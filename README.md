# Agent Store

An e-commerce store built to be **used by AI agents** and to **learn from its own traffic**.

- **Shopping agents** browse and buy through a JSON API (`/api/home`, `/api/catalog`, `/api/cart`, `/api/checkout`). Discovery via `/llms.txt`, `/openapi.json`, `/.well-known/agent.json`, and schema.org JSON-LD on product pages.
- **Operator agents** run the store through a tool API (`/api/agent/tools/*`), over MCP (`npm run mcp`), or via the built-in optimizer agent that plans with Claude (or a deterministic policy when no key is set).
- **The store learns**: every experiment is a Thompson-sampling bandit, product ranking is learned from behaviour, "bought together" comes from co-occurrence, and insights written by agents persist across runs.
- **Everything is audited**: every tool call by every agent lands in an action log on the operator console.

## Run it

```bash
npm install
npm run dev            # http://localhost:3126
```

Open **/admin**, click **Send shoppers** a few times, then **Run optimizer**. Watch the cohort chart on the dashboard.

From a terminal, against the running server:

```bash
npm run simulate -- 300 3         # 3 rounds of 300 synthetic shoppers
npm run agent -- 5 400            # 5 optimizer cycles with 400 shoppers between each
```

Set `ANTHROPIC_API_KEY` in `.env` and the optimizer reasons with Claude Opus 5.5 (server-side refusal fallbacks are enabled). Without a key it runs a rule-based policy through the same tools.

### Use it from Claude Desktop / Claude Code (MCP)

```json
{ "mcpServers": { "agent-store": { "command": "node", "args": ["/path/to/agent-store/mcp/server.mjs"], "env": { "STORE_URL": "http://localhost:3126" } } } }
```

### Operate it over HTTP

```bash
curl -s localhost:3126/api/agent/tools | jq '.tools[].name'
curl -s -X POST localhost:3126/api/agent/tools/get_store_overview -H 'x-agent-name: me' | jq
curl -s -X POST localhost:3126/api/agent/tools/create_experiment -H 'content-type: application/json' -d '{
  "name": "Headline test", "surface": "hero_headline",
  "arms": [
    { "id": "control", "label": "Current", "config": { "headline": "Gear that earns its place on your desk" } },
    { "id": "b", "label": "Shipping", "config": { "headline": "Free shipping on orders over $75" } }
  ]}'
```

Set `AGENT_API_KEY` to require an `x-agent-key` header on operator endpoints.

## How it learns

| Mechanism | Where | What it does |
|---|---|---|
| Thompson sampling experiments | `lib/experiments.ts`, `lib/bandit.ts` | Each session gets a sticky arm per running experiment; conversions credit that arm; traffic shifts to better arms. Surfaces: headline, CTA label, product sort, free-shipping threshold, per-product price. Price arms are weighted by unit profit so the bandit optimises profit per impression. |
| Learned ranking | `lib/recommend.ts` | Products are ranked by a Thompson sample of their view-to-purchase rate, so winners rise while under-exposed products still get tried. |
| Bought together | `lib/recommend.ts` | Co-occurrence of views and purchases within sessions. |
| Insights memory | `write_insight` / `list_insights` tools | Agents record what they learned; later runs read it first. |
| Optimizer agent | `lib/optimizer.ts` | Observe, conclude decisive experiments (apply winners), launch new ones where signals suggest upside, restock, summarise. |

The simulator in `lib/simulate.ts` sends shoppers with **hidden** preferences (price elasticity per category, headline and CTA sensitivity, segments). The store never reads that file; the optimizer has to discover those truths through experiments. That is what makes the cohort chart on `/admin` go up.

## Layout

```
app/            Next.js 15 pages (storefront, /admin) and API routes
lib/db.ts       SQLite via node:sqlite (no native build), schema + seed
lib/store.ts    catalogue, pricing per session, cart, checkout, events
lib/tools.ts    operator tool registry shared by HTTP, MCP and the optimizer
lib/optimizer.ts  Claude tool loop + deterministic policy
lib/simulate.ts synthetic shoppers with hidden preferences
mcp/server.mjs  MCP stdio server proxying the tool API
scripts/        simulate.mjs, agent.mjs
```

Requires Node 22.13+ (uses `node:sqlite`). Demo checkout takes no payment.
