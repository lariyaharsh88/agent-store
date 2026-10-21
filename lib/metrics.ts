import { db } from "./db";
import { listProducts } from "./store";
import { productSignals } from "./recommend";
import { listExperiments } from "./experiments";
import type { AgentAction, AgentRun, Insight } from "./types";

export type Kpis = {
  sessions: number;
  product_views: number;
  add_to_carts: number;
  orders: number;
  revenue: number;
  conversion_rate: number;
  add_to_cart_rate: number;
  aov: number;
  revenue_per_session: number;
  gross_margin: number;
};

export function kpis(): Kpis {
  const d = db();
  const sessions = (d.prepare("SELECT COUNT(DISTINCT session_id) AS n FROM events").get() as { n: number }).n;
  const views = (d.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'view'").get() as { n: number }).n;
  const atc = (d.prepare("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE type = 'add_to_cart'").get() as { n: number }).n;
  const o = d.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS rev FROM orders").get() as { n: number; rev: number };
  const margin = d
    .prepare(
      `SELECT COALESCE(SUM(e.value - p.cost * COALESCE(json_extract(e.meta, '$.qty'), 1)), 0) AS m
       FROM events e JOIN products p ON p.id = e.product_id WHERE e.type = 'purchase'`,
    )
    .get() as { m: number };
  return {
    sessions,
    product_views: views,
    add_to_carts: atc,
    orders: o.n,
    revenue: Math.round(o.rev * 100) / 100,
    conversion_rate: sessions ? o.n / sessions : 0,
    add_to_cart_rate: sessions ? atc / sessions : 0,
    aov: o.n ? o.rev / o.n : 0,
    revenue_per_session: sessions ? o.rev / sessions : 0,
    gross_margin: Math.round(margin.m * 100) / 100,
  };
}

export type ProductRow = {
  id: string; slug: string; name: string; category: string; price: number; base_price: number; cost: number; stock: number;
  views: number; add_to_carts: number; purchases: number; revenue: number; atc_rate: number; conversion_rate: number; margin_pct: number;
};

export function productTable(): ProductRow[] {
  const sig = productSignals();
  return listProducts({ includeInactive: true }).map((p) => {
    const s = sig[p.id];
    const views = s?.views ?? 0;
    const atc = s?.add_to_carts ?? 0;
    const buys = s?.purchases ?? 0;
    return {
      id: p.id, slug: p.slug, name: p.name, category: p.category, price: p.price, base_price: p.base_price, cost: p.cost, stock: p.stock,
      views, add_to_carts: atc, purchases: buys, revenue: Math.round((s?.revenue ?? 0) * 100) / 100,
      atc_rate: views ? atc / views : 0, conversion_rate: views ? buys / views : 0, margin_pct: p.price ? (p.price - p.cost) / p.price : 0,
    };
  });
}

export type Cohort = { cohort: number; sessions: number; orders: number; revenue: number; conversion_rate: number; revenue_per_session: number; started_at: string };

/** Sessions in arrival order, grouped into fixed-size cohorts: shows whether the store is learning over time. */
export function cohortTrend(cohortSize = 100): Cohort[] {
  const d = db();
  const sessions = d.prepare("SELECT session_id, MIN(ts) AS first FROM events GROUP BY session_id ORDER BY first").all() as { session_id: string; first: string }[];
  const orders = d.prepare("SELECT session_id, SUM(total) AS rev, COUNT(*) AS n FROM orders GROUP BY session_id").all() as { session_id: string; rev: number; n: number }[];
  const byS: Record<string, { rev: number; n: number }> = {};
  for (const o of orders) byS[o.session_id] = { rev: o.rev, n: o.n };
  const out: Cohort[] = [];
  for (let i = 0; i < sessions.length; i += cohortSize) {
    const slice = sessions.slice(i, i + cohortSize);
    if (slice.length < Math.min(cohortSize, 20)) break;
    let rev = 0;
    let n = 0;
    for (const s of slice) {
      const o = byS[s.session_id];
      if (o) { rev += o.rev; n += o.n; }
    }
    out.push({ cohort: out.length + 1, sessions: slice.length, orders: n, revenue: Math.round(rev * 100) / 100, conversion_rate: n / slice.length, revenue_per_session: rev / slice.length, started_at: slice[0].first });
  }
  return out;
}

export function funnel() {
  const d = db();
  const step = (sql: string) => (d.prepare(sql).get() as { n: number }).n;
  const sessions = step("SELECT COUNT(DISTINCT session_id) AS n FROM events");
  const viewed = step("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE type = 'view'");
  const carted = step("SELECT COUNT(DISTINCT session_id) AS n FROM events WHERE type = 'add_to_cart'");
  const ordered = step("SELECT COUNT(DISTINCT session_id) AS n FROM orders");
  return [
    { step: "sessions", sessions },
    { step: "viewed_product", sessions: viewed, rate: sessions ? viewed / sessions : 0 },
    { step: "added_to_cart", sessions: carted, rate: viewed ? carted / viewed : 0 },
    { step: "purchased", sessions: ordered, rate: carted ? ordered / carted : 0 },
  ];
}

export function recentActions(limit = 30, runId?: string): AgentAction[] {
  const rows = runId
    ? db().prepare("SELECT * FROM agent_actions WHERE run_id = ? ORDER BY id DESC LIMIT ?").all(runId, limit)
    : db().prepare("SELECT * FROM agent_actions ORDER BY id DESC LIMIT ?").all(limit);
  return (rows as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as AgentAction), input: safeJson(r.input), output: safeJson(r.output) }));
}

export function listInsights(opts: { topic?: string; limit?: number } = {}): Insight[] {
  const rows = opts.topic
    ? db().prepare("SELECT * FROM insights WHERE topic = ? ORDER BY id DESC LIMIT ?").all(opts.topic, opts.limit ?? 50)
    : db().prepare("SELECT * FROM insights ORDER BY id DESC LIMIT ?").all(opts.limit ?? 50);
  return (rows as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as Insight), evidence: safeJson(r.evidence) }));
}

export function listRuns(limit = 20): AgentRun[] {
  return db().prepare("SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT ?").all(limit) as unknown as AgentRun[];
}

export function overview() {
  const running = listExperiments("running");
  return {
    kpis: kpis(),
    funnel: funnel(),
    running_experiments: running.map((e) => ({ id: e.id, name: e.name, surface: e.surface, arms: e.arms.length, created_at: e.created_at })),
    ended_experiments: listExperiments("ended").length,
    products: productTable().length,
    low_stock: productTable().filter((p) => p.stock < 5).map((p) => ({ id: p.id, name: p.name, stock: p.stock })),
    recent_insights: listInsights({ limit: 5 }).map((i) => ({ topic: i.topic, text: i.text, confidence: i.confidence })),
  };
}

function safeJson(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
}
