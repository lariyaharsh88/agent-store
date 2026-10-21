import { agentAuthorized } from "@/lib/auth";
import { invokeTool } from "@/lib/tools";
import { body, fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Body: { shoppers?: number }. Sends synthetic shoppers through the store. */
export async function POST(req: Request) {
  if (!agentAuthorized(req)) return fail("Missing or invalid x-agent-key", 401);
  const b = await body(req);
  const out = invokeTool("run_simulation", { shoppers: Number(b.shoppers) || 200 }, { agent: "simulator" });
  return out.ok ? json(out.result) : fail(out.error ?? "failed");
}
