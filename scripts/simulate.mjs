#!/usr/bin/env node
// Send synthetic shoppers through a running store. Usage: node scripts/simulate.mjs [shoppers] [rounds]
const base = process.env.STORE_URL || "http://localhost:3126";
const shoppers = Number(process.argv[2] || 300);
const rounds = Number(process.argv[3] || 1);
const headers = { "content-type": "application/json", "x-agent-name": "simulate-script", ...(process.env.AGENT_API_KEY ? { "x-agent-key": process.env.AGENT_API_KEY } : {}) };
for (let r = 1; r <= rounds; r++) {
  const res = await fetch(`${base}/api/sim/run`, { method: "POST", headers, body: JSON.stringify({ shoppers }) });
  const data = await res.json();
  if (!res.ok) { console.error("failed:", data); process.exit(1); }
  console.log(`round ${r}: ${data.shoppers} shoppers -> ${data.orders} orders, $${data.revenue} revenue (${data.ms} ms)`);
}
