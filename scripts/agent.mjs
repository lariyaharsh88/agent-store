#!/usr/bin/env node
// Run optimizer cycles against a running store, optionally interleaved with traffic.
// Usage: node scripts/agent.mjs [cycles] [shoppersBetween] [mode]
const base = process.env.STORE_URL || "http://localhost:3126";
const cycles = Number(process.argv[2] || 1);
const shoppers = Number(process.argv[3] || 0);
const mode = process.argv[4] || "auto";
const headers = { "content-type": "application/json", "x-agent-name": "agent-script", ...(process.env.AGENT_API_KEY ? { "x-agent-key": process.env.AGENT_API_KEY } : {}) };
for (let c = 1; c <= cycles; c++) {
  if (shoppers > 0) {
    const sr = await fetch(`${base}/api/sim/run`, { method: "POST", headers, body: JSON.stringify({ shoppers }) });
    const s = await sr.json();
    if (!sr.ok) { console.error("simulation failed:", s); process.exit(1); }
    console.log(`traffic: ${s.shoppers} shoppers -> ${s.orders} orders, $${s.revenue}`);
  }
  const res = await fetch(`${base}/api/agent/run`, { method: "POST", headers, body: JSON.stringify({ mode }) });
  const run = await res.json();
  if (!res.ok) { console.error("failed:", run); process.exit(1); }
  console.log(`cycle ${c} [${run.mode}, ${run.tool_calls} tool calls]\n  ${run.summary}\n`);
}
const m = await (await fetch(`${base}/api/metrics`)).json();
const k = m.kpis;
console.log(`now: ${k.sessions} sessions, ${k.orders} orders, $${k.revenue} revenue, CR ${(k.conversion_rate * 100).toFixed(2)}%, rev/session $${k.revenue_per_session.toFixed(2)}`);
