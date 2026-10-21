/**
 * The built-in optimizer agent. Two brains, one body:
 *  - "claude": Claude reasons over the store through the tool registry.
 *  - "policy": a deterministic rule set that does the same job without an API key.
 * Both only ever act through invokeTool, so everything they do is audited.
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { db, newId, now } from "./db";
import { experimentResults, listExperiments } from "./experiments";
import { productTable } from "./metrics";
import { getSettings } from "./store";
import { invokeTool, TOOLS } from "./tools";
import type { AgentRun, Experiment } from "./types";

export type OptimizerMode = "auto" | "claude" | "policy";

const MAX_RUNNING = 4;
const MAX_TURNS = 24;
const MAX_IMPRESSIONS = 3000;

const HEADLINE_POOL: { headline: string; subheadline: string }[] = [
  { headline: "Free shipping on orders over $75", subheadline: "Audio, desk, fitness and home gear, delivered on us when you bundle." },
  { headline: "Autumn sale: save on desk and audio", subheadline: "Limited-time prices on the things you use every day." },
  { headline: "The short list for a better desk", subheadline: "Fourteen products we would buy ourselves. Nothing else." },
  { headline: "Upgrade one thing this week", subheadline: "Small, well-made gear that makes the rest of your setup better." },
  { headline: "Curated gear for people who notice the details", subheadline: "Every product here earned its place." },
];

const CTA_POOL = ["Add to cart, free returns", "Buy now", "Add to bag"];

/** True when the SDK can authenticate: API key, auth token, or a profile from `ant auth login`. */
export function hasClaudeCredentials(): boolean {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  try {
    const home = process.env.HOME ?? "";
    return home !== "" && fs.existsSync(path.join(home, ".config", "anthropic"));
  } catch {
    return false;
  }
}

export async function runOptimizer(opts: { mode?: OptimizerMode } = {}): Promise<AgentRun & { log: string[] }> {
  const requested = opts.mode ?? "auto";
  const mode: "claude" | "policy" = requested === "auto" ? (hasClaudeCredentials() ? "claude" : "policy") : requested;

  const id = newId("run");
  const agent = `optimizer:${mode}`;
  db().prepare("INSERT INTO agent_runs (id, started_at, mode) VALUES (?, ?, ?)").run(id, now(), mode);
  const log: string[] = [];
  let calls = 0;
  const call = (name: string, input: Record<string, unknown> = {}) => {
    calls++;
    const out = invokeTool(name, input, { agent, runId: id });
    log.push(`${name}(${JSON.stringify(input).slice(0, 120)}) -> ${out.ok ? "ok" : "error: " + out.error}`);
    return out;
  };

  let summary = "";
  let ok = 1;
  try {
    summary = mode === "claude" ? await claudeBrain(call, log) : policyBrain(call, log);
  } catch (e) {
    ok = 0;
    summary = `Run failed: ${e instanceof Error ? e.message : String(e)}`;
    log.push(summary);
  }
  db().prepare("UPDATE agent_runs SET finished_at = ?, summary = ?, tool_calls = ?, ok = ? WHERE id = ?").run(now(), summary, calls, ok, id);
  const run = db().prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as unknown as AgentRun;
  return { ...run, log };
}

type Call = (name: string, input?: Record<string, unknown>) => { ok: boolean; result?: unknown; error?: string };

/* ----------------------------- policy brain ----------------------------- */

function policyBrain(call: Call, log: string[]): string {
  const did: string[] = [];
  call("get_store_overview");

  // 1. Conclude experiments that have taught us something.
  for (const exp of listExperiments("running")) {
    const r = experimentResults(exp.id);
    const leader = r.arms.find((a) => a.id === r.leader);
    if (r.decisive && leader) {
      const isControl = leader.id === exp.arms[0].id;
      const metric = r.objective === "profit" ? `profit/impression ${leader.profit_per_impression?.toFixed(2)}` : `rate ${(leader.rate * 100).toFixed(1)}%`;
      const outcome = isControl
        ? `Control held: ${leader.label} stayed best (${metric}, P(best) ${(leader.prob_best * 100).toFixed(0)}%).`
        : `${leader.label} won with ${metric}, P(best) ${(leader.prob_best * 100).toFixed(0)}%; applied to the store.`;
      call("end_experiment", { id: exp.id, winner_arm: leader.id, apply_winner: !isControl, outcome });
      call("write_insight", { topic: topicFor(exp), text: `${exp.name}: ${outcome}`, confidence: leader.prob_best, evidence: { experiment: exp.id, arms: r.arms.map((a) => ({ id: a.id, impressions: a.impressions, conversions: a.conversions, rate: round(a.rate, 4), profit_per_impression: a.profit_per_impression })) } });
      did.push(`Concluded "${exp.name}": ${outcome}`);
    } else if (r.total_impressions >= MAX_IMPRESSIONS) {
      const control = r.arms[0];
      const probable = leader && leader.id !== control.id && leader.prob_best >= 0.7 && (r.objective === "profit" ? (leader.profit_per_impression ?? 0) > (control.profit_per_impression ?? 0) * 1.05 : leader.rate > control.rate * 1.05);
      if (probable && leader) {
        const outcome = `Probable winner after ${r.total_impressions} impressions: ${leader.label} (P(best) ${(leader.prob_best * 100).toFixed(0)}%); applied, to be re-tested later.`;
        call("end_experiment", { id: exp.id, winner_arm: leader.id, apply_winner: true, outcome });
        call("write_insight", { topic: topicFor(exp), text: `${exp.name}: ${outcome}`, confidence: leader.prob_best, evidence: { experiment: exp.id, arms: r.arms.map((a) => ({ id: a.id, impressions: a.impressions, conversions: a.conversions, rate: round(a.rate, 4) })) } });
        did.push(`Adopted a probable winner for "${exp.name}".`);
      } else {
        const outcome = `No winner after ${r.total_impressions} impressions; kept the control.`;
        call("end_experiment", { id: exp.id, winner_arm: null, apply_winner: false, outcome });
        call("write_insight", { topic: topicFor(exp), text: `${exp.name}: ${outcome}`, confidence: 0.5, evidence: { experiment: exp.id } });
        did.push(`Closed "${exp.name}" as inconclusive.`);
      }
    }
  }

  // 2. Launch new experiments where signals suggest upside.
  const all = listExperiments();
  let running = listExperiments("running").length;
  const settings = getSettings();
  const tried = (surface: string) => all.filter((e) => e.surface === surface);

  if (running < MAX_RUNNING && !tried("hero_headline").some((e) => e.status === "running")) {
    const used = new Set(all.filter((e) => e.surface === "hero_headline").flatMap((e) => e.arms.map((a) => String(a.config.headline))));
    const candidates = HEADLINE_POOL.filter((h) => h.headline !== settings.hero_headline && !used.has(h.headline)).slice(0, 1);
    if (candidates.length === 1) {
      const r = call("create_experiment", {
        name: "Hero headline round " + (tried("hero_headline").length + 1),
        surface: "hero_headline",
        hypothesis: "A benefit-led headline lifts purchase rate over the current one.",
        arms: [
          { id: "control", label: "Current headline", config: { headline: settings.hero_headline, subheadline: settings.hero_subheadline } },
          ...candidates.map((c, i) => ({ id: "v" + (i + 1), label: c.headline, config: c })),
        ],
      });
      if (r.ok) { running++; did.push("Launched a headline experiment."); }
    }
  }

  if (running < MAX_RUNNING && tried("cta_label").length === 0) {
    const r = call("create_experiment", {
      name: "Add-to-cart button copy",
      surface: "cta_label",
      hypothesis: "Reassurance in the button copy raises add-to-cart rate.",
      arms: [{ id: "control", label: settings.cta_label, config: { label: settings.cta_label } }, ...CTA_POOL.map((l, i) => ({ id: "v" + (i + 1), label: l, config: { label: l } }))],
    });
    if (r.ok) { running++; did.push("Launched a CTA copy experiment."); }
  }

  if (running < MAX_RUNNING && tried("free_shipping_threshold").length === 0) {
    const t = settings.free_shipping_threshold;
    const r = call("create_experiment", {
      name: "Free shipping threshold",
      surface: "free_shipping_threshold",
      hypothesis: "A lower threshold converts more carts without hurting order value much.",
      arms: [{ id: "control", label: `$${t}`, config: { threshold: t } }, { id: "lower", label: `$${Math.round(t * 0.67)}`, config: { threshold: Math.round(t * 0.67) } }, { id: "higher", label: `$${Math.round(t * 1.33)}`, config: { threshold: Math.round(t * 1.33) } }],
    });
    if (r.ok) { running++; did.push("Launched a free-shipping threshold experiment."); }
  }

  // Pricing: compare each product's add-to-cart rate with the catalogue median.
  const rows = productTable().filter((p) => p.views >= 25);
  if (rows.length >= 4) {
    const median = quantile(rows.map((p) => p.atc_rate), 0.5);
    const candidates = rows
      .map((p) => ({ p, ratio: median ? p.atc_rate / median : 1 }))
      .filter(({ p, ratio }) => (ratio < 0.6 || ratio > 1.5) && !tried(`price:${p.id}`).length)
      .sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1));
    for (const { p, ratio } of candidates) {
      if (running >= MAX_RUNNING) break;
      const down = ratio < 1;
      const floor = p.cost * 1.15;
      const steps = down ? [0.9, 0.8] : [1.1, 1.2];
      const arms = [{ id: "control", label: `$${p.price}`, config: { price: p.price } }];
      for (const s of steps) {
        const price = Math.max(floor, Math.round(p.price * s));
        if (price !== p.price && !arms.some((a) => a.config.price === price)) arms.push({ id: `p${Math.round(s * 100)}`, label: `$${price}`, config: { price } });
      }
      if (arms.length < 2) continue;
      const r = call("create_experiment", {
        name: `${p.name} price ${down ? "cut" : "raise"}`,
        surface: `price:${p.id}`,
        hypothesis: down
          ? `Add-to-cart rate (${(p.atc_rate * 100).toFixed(1)}%) is well below the median (${(median * 100).toFixed(1)}%): shoppers think it is overpriced. A lower price should raise profit per impression.`
          : `Add-to-cart rate (${(p.atc_rate * 100).toFixed(1)}%) is far above the median (${(median * 100).toFixed(1)}%): demand can carry a higher price.`,
        arms,
      });
      if (r.ok) { running++; did.push(`Launched a price ${down ? "cut" : "raise"} test on ${p.name}.`); }
    }
  }

  // 3. Inventory.
  for (const p of productTable().filter((p) => p.stock < 20)) {
    call("restock", { id: p.id, qty: 200 });
    did.push(`Restocked ${p.name} (+200).`);
  }

  if (!did.length) did.push("Nothing to change yet: experiments are still collecting data. Send more traffic and run again.");
  const text = did.join(" ");
  log.push("summary: " + text);
  return text;
}

function topicFor(exp: Experiment): string {
  if (exp.surface.startsWith("price:")) return "pricing";
  return { hero_headline: "headline", cta_label: "cta", product_sort: "sort", free_shipping_threshold: "shipping" }[exp.surface] ?? "general";
}

function quantile(xs: number[], q: number): number {
  const s = xs.slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))));
  return s[i];
}

function round(n: number, d: number) { const f = 10 ** d; return Math.round(n * f) / f; }

/* ----------------------------- claude brain ----------------------------- */

const SYSTEM = `You are the autonomous growth operator for a small online store. You act only through the tools provided; every call is logged for the human owner.

Objective: raise profit per session over time, honestly. Never price below cost, never invent scarcity or fake discounts, keep copy truthful.

How each run should go:
1. Observe: get_store_overview, list_experiments (running), list_insights. Read what earlier runs learned before deciding anything.
2. Conclude: for every running experiment, read get_experiment_results. If "decisive" is true, end it, apply the winner when it beat the control, and write_insight with the numbers. If it has 3000+ impressions and no winner, end it as inconclusive and keep the control (or adopt a probable winner when P(best) is at least 70% and it beats the control). Otherwise leave it running.
3. Launch: keep at most ${MAX_RUNNING} experiments running. Pick surfaces where the data suggests upside (a product whose add-to-cart rate is far from the catalogue median is a pricing candidate; an untested headline, CTA or shipping threshold is a cheap test). Each experiment needs a clear hypothesis and a control as the first arm. Price experiments are judged on profit per impression, not conversion.
4. Housekeeping: restock anything under 5 units.
5. Finish with a plain-text summary of three to six sentences: what you concluded, what you launched, what you expect to learn next. Do not ask questions; there is no one to answer them.`;

async function claudeBrain(call: Call, log: string[]): Promise<string> {
  const client = new Anthropic();
  const tools: Anthropic.Beta.BetaTool[] = TOOLS.filter((t) => t.name !== "reset_store_data").map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema,
  }));
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Run one optimisation cycle now. The time is ${now()}.` },
  ];
  let finalText = "";
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      system: SYSTEM,
      tools,
      messages,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (text) finalText = text;

    if (response.stop_reason === "refusal") {
      log.push("model declined the turn: " + (response.stop_details?.type === "refusal" ? response.stop_details.category ?? "" : ""));
      break;
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason === "max_tokens") {
      log.push("model hit max_tokens; stopping the cycle");
      break;
    }
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((tu) => {
      const out = call(tu.name, (tu.input ?? {}) as Record<string, unknown>);
      return {
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(out.ok ? out.result : { error: out.error }).slice(0, 30000),
        is_error: !out.ok,
      };
    });
    messages.push({ role: "user", content: results });
  }
  if (!finalText) finalText = "Cycle finished without a written summary; see the action log.";
  log.push("summary: " + finalText);
  return finalText;
}
