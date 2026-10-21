import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Discovery document for agents, served at /.well-known/agent.json. */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return json({
    name: "Agent Store",
    description: "A demo e-commerce store that agents can shop from and operate.",
    version: "0.1.0",
    docs: `${origin}/llms.txt`,
    openapi: `${origin}/openapi.json`,
    shopping_api: { base: `${origin}/api`, session: "Send a stable x-session-id header on every request (any string). Prices and copy can differ per session because experiments are running." },
    operator_api: { tools: `${origin}/api/agent/tools`, invoke: `${origin}/api/agent/tools/{name}`, auth: "x-agent-key header when AGENT_API_KEY is configured" },
    mcp: { transport: "stdio", command: "npm run mcp", env: { STORE_URL: origin } },
  });
}
