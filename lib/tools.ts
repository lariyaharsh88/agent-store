/**
 * Operator tool registry. One definition drives three consumers:
 * the HTTP endpoint (/api/agent/tools/<name>), the MCP server and the
 * built-in optimizer agent. Every invocation is logged to agent_actions.
 */
import { db, now, resetData } from "./db";
import { createExperiment, endExperiment, experimentResults, listExperiments, SURFACES } from "./experiments";
import { cohortTrend, funnel, kpis, listInsights, overview, productTable, recentActions } from "./metrics";
import { getProductById, getProductBySlug, getSettings, SETTING_KEYS, setSetting, updateProduct } from "./store";
import { simulateShoppers } from "./simulate";
import type { Arm } from "./types";

export type JsonSchema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };

export type ToolDef = {
  name: string;
  description: string;
  input_schema: JsonSchema;
  readOnly: boolean;
  handler: (input: Record<string, unknown>, ctx: { agent: string }) => unknown;
};

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

export const TOOLS: ToolDef[] = [
  {
    name: "get_store_overview",
    description: "Store-wide KPIs (sessions, conversion rate, revenue, AOV, margin), funnel, running experiments, low stock and the latest insights. Call this first.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    handler: () => overview(),
  },
  {
    name: "get_settings",
    description: "Current storefront settings: hero headline, CTA label, product sort strategy, free shipping threshold.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    handler: () => getSettings(),
  },
  {
    name: "set_setting",
    description: `Change a storefront setting directly (no experiment). Keys: ${SETTING_KEYS.join(", ")}. Prefer create_experiment for anything that affects conversion.`,
    input_schema: { type: "object", properties: { key: str("Setting key"), value: str("New value (strings; numbers as text)") }, required: ["key", "value"], additionalProperties: false },
    readOnly: false,
    handler: (i) => { setSetting(String(i.key), String(i.value)); return getSettings(); },
  },
  {
    name: "list_products",
    description: "Every product with price, cost, stock and behavioural stats (views, add-to-cart rate, purchases, revenue, margin %).",
    input_schema: { type: "object", properties: { category: str("Optional category filter"), sort_by: str("Optional: views | revenue | conversion_rate | atc_rate | stock") }, additionalProperties: false },
    readOnly: true,
    handler: (i) => {
      let rows = productTable();
      if (i.category) rows = rows.filter((r) => r.category.toLowerCase() === String(i.category).toLowerCase());
      const key = i.sort_by as keyof (typeof rows)[number] | undefined;
      if (key && rows.length && typeof rows[0][key] === "number") rows = rows.slice().sort((a, b) => (b[key] as number) - (a[key] as number));
      return rows;
    },
  },
  {
    name: "get_product",
    description: "One product by id or slug, including its stats.",
    input_schema: { type: "object", properties: { id: str("Product id"), slug: str("Product slug") }, additionalProperties: false },
    readOnly: true,
    handler: (i) => {
      const p = i.id ? getProductById(String(i.id)) : i.slug ? getProductBySlug(String(i.slug)) : null;
      if (!p) throw new Error("Product not found");
      const stats = productTable().find((r) => r.id === p.id);
      return { ...p, stats };
    },
  },
  {
    name: "update_product",
    description: "Edit a product: name, description, price, stock, active, tags, category. Price changes apply immediately to all shoppers and must stay above cost.",
    input_schema: {
      type: "object",
      properties: {
        id: str("Product id"),
        name: str("New name"), description: str("New description"), category: str("New category"),
        price: num("New list price"), stock: num("New stock level"),
        active: { type: "boolean", description: "Hide (false) or show (true) the product" },
        tags: { type: "array", items: { type: "string" }, description: "Replace tags" },
      },
      required: ["id"], additionalProperties: false,
    },
    readOnly: false,
    handler: (i) => {
      const { id, ...patch } = i;
      return updateProduct(String(id), patch as Parameters<typeof updateProduct>[1]);
    },
  },
  {
    name: "restock",
    description: "Add units to a product's stock.",
    input_schema: { type: "object", properties: { id: str("Product id"), qty: num("Units to add") }, required: ["id", "qty"], additionalProperties: false },
    readOnly: false,
    handler: (i) => {
      const p = getProductById(String(i.id));
      if (!p) throw new Error("Product not found");
      return updateProduct(p.id, { stock: p.stock + Math.max(0, Math.round(Number(i.qty))) });
    },
  },
  {
    name: "list_experiments",
    description: "Experiments (running or ended) with a results summary for each.",
    input_schema: { type: "object", properties: { status: str("running | ended | all (default all)") }, additionalProperties: false },
    readOnly: true,
    handler: (i) => {
      const status = i.status === "running" || i.status === "ended" ? i.status : undefined;
      return listExperiments(status).map((e) => {
        const r = experimentResults(e.id);
        return { ...e, total_impressions: r.total_impressions, leader: r.leader, decisive: r.decisive, arms: r.arms.map((a) => ({ id: a.id, label: a.label, config: a.config, impressions: a.impressions, conversions: a.conversions, rate: round(a.rate, 4), revenue: a.revenue, prob_best: round(a.prob_best, 3) })) };
      });
    },
  },
  {
    name: "get_experiment_results",
    description: "Full results for one experiment: per-arm impressions, conversions, rate with 95% interval, revenue, probability of being best, lift vs control (first arm). 'decisive' is true when the leader has >= 95% probability of being best with >= 100 impressions per arm (80 for price tests).",
    input_schema: { type: "object", properties: { id: str("Experiment id") }, required: ["id"], additionalProperties: false },
    readOnly: true,
    handler: (i) => experimentResults(String(i.id)),
  },
  {
    name: "create_experiment",
    description:
      "Start a Thompson-sampling experiment. Traffic shifts toward better arms automatically. The first arm is the control. Surfaces: " +
      Object.entries(SURFACES).map(([k, v]) => `${k} (${v.describe})`).join("; ") +
      ". Only one running experiment per surface.",
    input_schema: {
      type: "object",
      properties: {
        name: str("Short name"),
        surface: str("hero_headline | cta_label | product_sort | free_shipping_threshold | price:<productId>"),
        hypothesis: str("What you expect and why"),
        arms: {
          type: "array", minItems: 2,
          items: { type: "object", properties: { id: str("Short arm id, e.g. control, b"), label: str("Human label"), config: { type: "object", description: "Surface-specific config, e.g. {headline, subheadline} | {label} | {strategy} | {threshold} | {price}" } }, required: ["id", "label", "config"] },
          description: "At least two arms; the first is the control",
        },
      },
      required: ["name", "surface", "arms"], additionalProperties: false,
    },
    readOnly: false,
    handler: (i, ctx) => createExperiment({ name: String(i.name), surface: String(i.surface), hypothesis: i.hypothesis ? String(i.hypothesis) : undefined, arms: i.arms as Arm[], createdBy: ctx.agent }),
  },
  {
    name: "end_experiment",
    description: "Stop an experiment. Pass winner_arm and apply_winner=true to roll the winning config out to every shopper. Always record an outcome sentence.",
    input_schema: {
      type: "object",
      properties: { id: str("Experiment id"), winner_arm: str("Winning arm id, if any"), apply_winner: { type: "boolean", description: "Apply the winner's config to the live store" }, outcome: str("One-sentence outcome") },
      required: ["id", "outcome"], additionalProperties: false,
    },
    readOnly: false,
    handler: (i) => endExperiment(String(i.id), { winnerArm: i.winner_arm ? String(i.winner_arm) : null, outcome: String(i.outcome), applyWinner: Boolean(i.apply_winner) }),
  },
  {
    name: "get_funnel",
    description: "Session funnel: sessions, viewed a product, added to cart, purchased, with step rates.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
    handler: () => funnel(),
  },
  {
    name: "get_cohort_trend",
    description: "Conversion rate and revenue per session for each cohort of N sessions in arrival order. Rising numbers mean the store is learning.",
    input_schema: { type: "object", properties: { cohort_size: num("Sessions per cohort (default 100)") }, additionalProperties: false },
    readOnly: true,
    handler: (i) => cohortTrend(Number(i.cohort_size) || 100),
  },
  {
    name: "write_insight",
    description: "Store something you learned so future runs (and humans) can build on it. Topics: pricing, headline, cta, sort, shipping, inventory, general.",
    input_schema: {
      type: "object",
      properties: { topic: str("Topic tag"), text: str("The insight, one to three sentences"), confidence: num("0 to 1"), evidence: { type: "object", description: "Numbers that back it up" } },
      required: ["topic", "text"], additionalProperties: false,
    },
    readOnly: false,
    handler: (i, ctx) => {
      const r = db().prepare("INSERT INTO insights (ts, agent, topic, text, evidence, confidence) VALUES (?, ?, ?, ?, ?, ?)").run(now(), ctx.agent, String(i.topic), String(i.text), i.evidence ? JSON.stringify(i.evidence) : null, i.confidence == null ? null : Number(i.confidence));
      return { id: Number(r.lastInsertRowid), stored: true };
    },
  },
  {
    name: "list_insights",
    description: "Previously stored insights, newest first.",
    input_schema: { type: "object", properties: { topic: str("Optional topic filter"), limit: num("Max rows (default 20)") }, additionalProperties: false },
    readOnly: true,
    handler: (i) => listInsights({ topic: i.topic ? String(i.topic) : undefined, limit: Number(i.limit) || 20 }),
  },
  {
    name: "get_recent_agent_actions",
    description: "Audit log of recent tool calls by any agent.",
    input_schema: { type: "object", properties: { limit: num("Max rows (default 30)") }, additionalProperties: false },
    readOnly: true,
    handler: (i) => recentActions(Number(i.limit) || 30),
  },
  {
    name: "run_simulation",
    description: "Dev only: send N synthetic shoppers through the live storefront so experiments gather data. Shoppers have hidden preferences; the store cannot see them.",
    input_schema: { type: "object", properties: { shoppers: num("Number of shoppers (1-2000, default 200)") }, additionalProperties: false },
    readOnly: false,
    handler: (i) => simulateShoppers(Math.min(2000, Math.max(1, Number(i.shoppers) || 200))),
  },
  {
    name: "reset_store_data",
    description: "Dev only: wipe events, orders, experiments, insights and agent logs; restore seed prices and settings. Irreversible.",
    input_schema: { type: "object", properties: { confirm: { type: "boolean", description: "Must be true" } }, required: ["confirm"], additionalProperties: false },
    readOnly: false,
    handler: (i) => { if (!i.confirm) throw new Error("Pass confirm: true"); resetData(); return { reset: true }; },
  },
];

function round(n: number, d: number) { const f = 10 ** d; return Math.round(n * f) / f; }

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function toolManifest() {
  return TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema, read_only: t.readOnly }));
}

/** Validate the minimum (required keys present), run, and log. Never throws. */
export function invokeTool(name: string, input: Record<string, unknown>, ctx: { agent: string; runId?: string }): { ok: boolean; result?: unknown; error?: string } {
  const tool = getTool(name);
  if (!tool) return { ok: false, error: `Unknown tool '${name}'. Available: ${TOOLS.map((t) => t.name).join(", ")}` };
  const inp = input && typeof input === "object" ? input : {};
  for (const k of tool.input_schema.required ?? []) {
    if (!(k in inp)) return logged({ ok: false, error: `Missing required field '${k}'` });
  }
  try {
    const result = tool.handler(inp, { agent: ctx.agent });
    return logged({ ok: true, result });
  } catch (e) {
    return logged({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }

  function logged(out: { ok: boolean; result?: unknown; error?: string }) {
    db().prepare("INSERT INTO agent_actions (ts, agent, tool, input, output, ok, run_id) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      now(), ctx.agent, name, JSON.stringify(inp), truncate(JSON.stringify(out.ok ? out.result : { error: out.error })), out.ok ? 1 : 0, ctx.runId ?? null,
    );
    return out;
  }
}

function truncate(s: string, max = 20000) { return s.length > max ? s.slice(0, max) + "…" : s; }
