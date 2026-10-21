import { db, newId, now } from "./db";
import { probBest, thompsonPick, wilson } from "./bandit";
import type { Arm, ArmStat, Experiment } from "./types";

export const SURFACES: Record<string, { conversion: "purchase" | "add_to_cart"; keys: string[]; describe: string }> = {
  hero_headline: { conversion: "purchase", keys: ["headline", "subheadline"], describe: "Home page hero headline and subheadline. Conversion = purchase." },
  cta_label: { conversion: "add_to_cart", keys: ["label"], describe: "Label on every add-to-cart button. Conversion = add to cart." },
  product_sort: { conversion: "purchase", keys: ["strategy"], describe: "Home page product ordering: learned | default | price_asc | popular. Conversion = purchase." },
  free_shipping_threshold: { conversion: "purchase", keys: ["threshold"], describe: "Order subtotal needed for free shipping (number). Conversion = purchase." },
  price: { conversion: "purchase", keys: ["price"], describe: "Surface is 'price:<productId>'. Arm config {price}. Conversion = purchase containing that product; revenue = line revenue." },
};

export function surfaceKind(surface: string): string {
  return surface.startsWith("price:") ? "price" : surface;
}

function rowToExperiment(r: Record<string, unknown>): Experiment {
  return {
    id: r.id as string,
    name: r.name as string,
    surface: r.surface as string,
    hypothesis: (r.hypothesis as string) ?? null,
    status: r.status as Experiment["status"],
    arms: JSON.parse(r.arms as string) as Arm[],
    conversion_event: r.conversion_event as Experiment["conversion_event"],
    created_by: r.created_by as string,
    created_at: r.created_at as string,
    ended_at: (r.ended_at as string) ?? null,
    winner_arm: (r.winner_arm as string) ?? null,
    outcome: (r.outcome as string) ?? null,
  };
}

export function listExperiments(status?: "running" | "ended"): Experiment[] {
  const d = db();
  const rows = status
    ? d.prepare("SELECT * FROM experiments WHERE status = ? ORDER BY created_at DESC").all(status)
    : d.prepare("SELECT * FROM experiments ORDER BY created_at DESC").all();
  return (rows as Record<string, unknown>[]).map(rowToExperiment);
}

export function getExperiment(id: string): Experiment | null {
  const r = db().prepare("SELECT * FROM experiments WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? rowToExperiment(r) : null;
}

export function runningExperimentFor(surface: string): Experiment | null {
  const r = db().prepare("SELECT * FROM experiments WHERE surface = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1").get(surface) as
    | Record<string, unknown>
    | undefined;
  return r ? rowToExperiment(r) : null;
}

export function armStats(experimentId: string): ArmStat[] {
  return db().prepare("SELECT * FROM arm_stats WHERE experiment_id = ?").all(experimentId) as unknown as ArmStat[];
}

export function createExperiment(input: {
  name: string;
  surface: string;
  hypothesis?: string;
  arms: Arm[];
  createdBy: string;
}): Experiment {
  const kind = surfaceKind(input.surface);
  const spec = SURFACES[kind];
  if (!spec) throw new Error(`Unknown surface '${input.surface}'. Valid: ${Object.keys(SURFACES).join(", ")} (price as 'price:<productId>')`);
  if (!Array.isArray(input.arms) || input.arms.length < 2) throw new Error("An experiment needs at least two arms");
  const ids = new Set<string>();
  for (const arm of input.arms) {
    if (!arm.id || !arm.label || typeof arm.config !== "object") throw new Error("Each arm needs id, label and config");
    if (ids.has(arm.id)) throw new Error(`Duplicate arm id '${arm.id}'`);
    ids.add(arm.id);
    for (const k of spec.keys) {
      if (!(k in arm.config)) throw new Error(`Arm '${arm.id}' is missing config.${k}`);
    }
    if (kind === "price") {
      const p = Number(arm.config.price);
      if (!Number.isFinite(p) || p <= 0) throw new Error(`Arm '${arm.id}' has an invalid price`);
      arm.config.price = Math.round(p * 100) / 100;
    }
    if (kind === "free_shipping_threshold") {
      const t = Number(arm.config.threshold);
      if (!Number.isFinite(t) || t < 0) throw new Error(`Arm '${arm.id}' has an invalid threshold`);
      arm.config.threshold = t;
    }
    if (kind === "product_sort" && !["learned", "default", "price_asc", "popular"].includes(String(arm.config.strategy))) {
      throw new Error(`Arm '${arm.id}' has an invalid sort strategy`);
    }
  }
  if (kind === "price") {
    const pid = input.surface.slice("price:".length);
    const prod = db().prepare("SELECT id FROM products WHERE id = ?").get(pid);
    if (!prod) throw new Error(`No product with id '${pid}'`);
  }
  if (runningExperimentFor(input.surface)) throw new Error(`There is already a running experiment on surface '${input.surface}'. End it first.`);

  const d = db();
  const id = newId("exp");
  const ts = now();
  d.prepare(
    `INSERT INTO experiments (id, name, surface, hypothesis, status, arms, conversion_event, created_by, created_at)
     VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?)`,
  ).run(id, input.name, input.surface, input.hypothesis ?? null, JSON.stringify(input.arms), spec.conversion, input.createdBy, ts);
  const ins = d.prepare("INSERT INTO arm_stats (experiment_id, arm_id) VALUES (?, ?)");
  for (const arm of input.arms) ins.run(id, arm.id);
  return getExperiment(id)!;
}

export type ArmResult = Arm & ArmStat & {
  rate: number;
  ci95: [number, number];
  prob_best: number;
  lift_vs_control: number | null;
  revenue_per_impression: number;
  profit_per_impression: number | null;
};

/** Price experiments weigh each arm by unit profit so the bandit optimises profit, not just conversion. */
export function armWeights(exp: Experiment): Record<string, number> {
  const w: Record<string, number> = {};
  if (surfaceKind(exp.surface) !== "price") {
    for (const a of exp.arms) w[a.id] = 1;
    return w;
  }
  const pid = exp.surface.slice("price:".length);
  const prod = db().prepare("SELECT cost FROM products WHERE id = ?").get(pid) as { cost: number } | undefined;
  const cost = prod?.cost ?? 0;
  for (const a of exp.arms) w[a.id] = Math.max(0.01, Number(a.config.price) - cost);
  return w;
}

export function experimentResults(id: string): {
  experiment: Experiment;
  objective: "conversion" | "profit";
  arms: ArmResult[];
  total_impressions: number;
  leader: string | null;
  decisive: boolean;
} {
  const exp = getExperiment(id);
  if (!exp) throw new Error(`No experiment '${id}'`);
  const stats = armStats(id);
  const weights = armWeights(exp);
  const isPrice = surfaceKind(exp.surface) === "price";
  const counts = exp.arms.map((a) => {
    const s = stats.find((x) => x.arm_id === a.id) ?? { impressions: 0, conversions: 0, revenue: 0 };
    return { id: a.id, impressions: s.impressions, conversions: s.conversions, revenue: s.revenue, weight: weights[a.id] };
  });
  const pb = probBest(counts);
  const control = counts[0];
  const controlRate = control.impressions ? control.conversions / control.impressions : 0;
  const arms: ArmResult[] = exp.arms.map((a, i) => {
    const c = counts[i];
    const rate = c.impressions ? c.conversions / c.impressions : 0;
    return {
      ...a,
      experiment_id: id,
      arm_id: a.id,
      impressions: c.impressions,
      conversions: c.conversions,
      revenue: Math.round(c.revenue * 100) / 100,
      rate,
      ci95: wilson(c.conversions, c.impressions),
      prob_best: pb[a.id],
      lift_vs_control: i === 0 || controlRate === 0 ? null : (rate - controlRate) / controlRate,
      revenue_per_impression: c.impressions ? c.revenue / c.impressions : 0,
      profit_per_impression: isPrice ? rate * weights[a.id] : null,
    };
  });
  const total = counts.reduce((s, c) => s + c.impressions, 0);
  const leader = arms.slice().sort((x, y) => y.prob_best - x.prob_best)[0];
  const minImpressions = Math.min(...counts.map((c) => c.impressions));
  const decisive = !!leader && leader.prob_best >= 0.95 && minImpressions >= (isPrice ? 80 : 100);
  return { experiment: exp, objective: isPrice ? "profit" : "conversion", arms, total_impressions: total, leader: leader?.id ?? null, decisive };
}

/** Change the free-shipping threshold and keep any "$<old>" mention in the hero copy truthful. */
export function syncThresholdCopy(threshold: number) {
  const d = db();
  const ts = now();
  const cur = d.prepare("SELECT key, value FROM settings WHERE key IN ('free_shipping_threshold','hero_headline','hero_subheadline')").all() as { key: string; value: string }[];
  const m: Record<string, string> = {};
  for (const r of cur) m[r.key] = r.value;
  const old = m.free_shipping_threshold;
  const set = d.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)");
  set.run("free_shipping_threshold", String(threshold), ts);
  if (old && old !== String(threshold)) {
    for (const key of ["hero_headline", "hero_subheadline"]) {
      const v = m[key] ?? "";
      if (v.includes("$" + old)) set.run(key, v.split("$" + old).join("$" + threshold), ts);
    }
  }
}

/** Apply an arm's config to the live store (settings or product price). */
export function applyArm(exp: Experiment, arm: Arm) {
  const d = db();
  const kind = surfaceKind(exp.surface);
  const ts = now();
  const set = d.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)");
  if (kind === "hero_headline") {
    set.run("hero_headline", String(arm.config.headline), ts);
    if (arm.config.subheadline != null) set.run("hero_subheadline", String(arm.config.subheadline), ts);
  } else if (kind === "cta_label") set.run("cta_label", String(arm.config.label), ts);
  else if (kind === "product_sort") set.run("product_sort", String(arm.config.strategy), ts);
  else if (kind === "free_shipping_threshold") syncThresholdCopy(Number(arm.config.threshold));
  else if (kind === "price") {
    const pid = exp.surface.slice("price:".length);
    d.prepare("UPDATE products SET price = ?, updated_at = ? WHERE id = ?").run(Number(arm.config.price), ts, pid);
  }
}

export function endExperiment(id: string, opts: { winnerArm?: string | null; outcome: string; applyWinner: boolean }): Experiment {
  const exp = getExperiment(id);
  if (!exp) throw new Error(`No experiment '${id}'`);
  if (exp.status === "ended") throw new Error("Experiment already ended");
  const winner = opts.winnerArm ? exp.arms.find((a) => a.id === opts.winnerArm) : undefined;
  if (opts.winnerArm && !winner) throw new Error(`No arm '${opts.winnerArm}' in this experiment`);
  if (opts.applyWinner && winner) applyArm(exp, winner);
  db().prepare("UPDATE experiments SET status = 'ended', ended_at = ?, winner_arm = ?, outcome = ? WHERE id = ?").run(now(), winner?.id ?? null, opts.outcome, id);
  return getExperiment(id)!;
}

/**
 * Sticky arm assignment for a session. An impression is counted the first
 * time the arm is actually exposed; price arms resolved for a product card
 * are assigned but not exposed until the product is viewed or carted.
 */
export function assignArm(sessionId: string, exp: Experiment, opts: { expose?: boolean } = {}): Arm {
  const expose = opts.expose ?? true;
  const d = db();
  const existing = d.prepare("SELECT arm_id, exposed FROM assignments WHERE session_id = ? AND experiment_id = ?").get(sessionId, exp.id) as { arm_id: string; exposed: number } | undefined;
  if (existing) {
    if (expose && !existing.exposed) {
      d.prepare("UPDATE assignments SET exposed = 1 WHERE session_id = ? AND experiment_id = ?").run(sessionId, exp.id);
      d.prepare("UPDATE arm_stats SET impressions = impressions + 1 WHERE experiment_id = ? AND arm_id = ?").run(exp.id, existing.arm_id);
    }
    return exp.arms.find((a) => a.id === existing.arm_id) ?? exp.arms[0];
  }
  const stats = armStats(exp.id);
  const weights = armWeights(exp);
  const counts = exp.arms.map((a) => {
    const s = stats.find((x) => x.arm_id === a.id);
    return { id: a.id, impressions: s?.impressions ?? 0, conversions: s?.conversions ?? 0, weight: weights[a.id] };
  });
  const pick = thompsonPick(counts);
  d.prepare("INSERT OR IGNORE INTO assignments (session_id, experiment_id, arm_id, exposed, assigned_at) VALUES (?, ?, ?, ?, ?)").run(sessionId, exp.id, pick, expose ? 1 : 0, now());
  if (expose) d.prepare("UPDATE arm_stats SET impressions = impressions + 1 WHERE experiment_id = ? AND arm_id = ?").run(exp.id, pick);
  return exp.arms.find((a) => a.id === pick) ?? exp.arms[0];
}

/** Resolve the arm a session sees for a surface, or null when no experiment is running there. */
export function armFor(sessionId: string, surface: string, opts: { expose?: boolean } = {}): { experiment: Experiment; arm: Arm } | null {
  const exp = runningExperimentFor(surface);
  if (!exp) return null;
  return { experiment: exp, arm: assignArm(sessionId, exp, opts) };
}

/**
 * Credit conversions to every assignment of this session whose experiment
 * listens for this event. Price experiments only convert for their own product.
 */
export function recordConversion(sessionId: string, event: "purchase" | "add_to_cart", opts: { productId?: string; revenue?: number; lineRevenue?: Record<string, number> }) {
  const d = db();
  const rows = d
    .prepare(
      `SELECT a.experiment_id, a.arm_id, e.surface, e.conversion_event FROM assignments a
       JOIN experiments e ON e.id = a.experiment_id
       WHERE a.session_id = ? AND a.converted = 0 AND a.exposed = 1 AND e.status = 'running' AND e.conversion_event = ?`,
    )
    .all(sessionId, event) as { experiment_id: string; arm_id: string; surface: string }[];
  const mark = d.prepare("UPDATE assignments SET converted = 1 WHERE session_id = ? AND experiment_id = ?");
  const bump = d.prepare("UPDATE arm_stats SET conversions = conversions + 1, revenue = revenue + ? WHERE experiment_id = ? AND arm_id = ?");
  for (const r of rows) {
    let revenue = opts.revenue ?? 0;
    if (r.surface.startsWith("price:")) {
      const pid = r.surface.slice("price:".length);
      if (event === "purchase") {
        if (!opts.lineRevenue || !(pid in opts.lineRevenue)) continue;
        revenue = opts.lineRevenue[pid];
      } else if (opts.productId !== pid) continue;
    }
    mark.run(sessionId, r.experiment_id);
    bump.run(revenue, r.experiment_id, r.arm_id);
  }
}
