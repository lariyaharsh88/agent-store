import { TOOLS } from "@/lib/tools";

export const dynamic = "force-dynamic";

/** Plain-text guide for language-model agents, served at /llms.txt. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const text = `# Agent Store

> A small e-commerce store built to be used by AI agents: shopping agents can browse and buy through a JSON API, and operator agents can run experiments and tune the store through a tool API. Everything agents do is logged.

## Shopping (no auth)
Send a stable \`x-session-id\` header on every request. Sessions see sticky experiment arms, so prices and copy may differ between sessions.

- GET ${origin}/api/home — headline, CTA label, free-shipping threshold and the ranked product list for this session
- GET ${origin}/api/catalog?q=&category= — search the catalogue
- GET ${origin}/api/products/{slug} — one product with related items (counts as a product view)
- GET/POST/DELETE ${origin}/api/cart — body {product_id, qty}
- POST ${origin}/api/checkout — body {name, email}; demo checkout, no payment taken
- GET ${origin}/api/orders/{id}

## Operating (x-agent-key if configured, x-agent-name to identify yourself)
- GET ${origin}/api/agent/tools — tool catalogue in Claude tool-definition shape
- POST ${origin}/api/agent/tools/{name} — call a tool with a JSON body
- POST ${origin}/api/agent/run — run the built-in optimizer once; body {mode: "auto"|"claude"|"policy"}
- GET ${origin}/api/metrics — KPIs, funnel, cohort trend, product stats, experiment results

Tools: ${TOOLS.map((t) => t.name).join(", ")}.

## How the store learns
Experiments are multi-armed bandits (Thompson sampling). Each session is assigned an arm per running experiment; conversions credit that arm; traffic drifts toward better arms. Price experiments optimise profit per impression. Insights written by agents persist and are read by later runs.

## Machine-readable
- ${origin}/openapi.json
- ${origin}/.well-known/agent.json
- Product pages carry schema.org/Product JSON-LD.
`;
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
