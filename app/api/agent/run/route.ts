import { agentAuthorized } from "@/lib/auth";
import { runOptimizer, type OptimizerMode } from "@/lib/optimizer";
import { body, fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Body: { mode?: "auto" | "claude" | "policy" }. Runs one optimisation cycle and returns the run. */
export async function POST(req: Request) {
  if (!agentAuthorized(req)) return fail("Missing or invalid x-agent-key", 401);
  const b = await body(req);
  const mode = (["auto", "claude", "policy"].includes(String(b.mode)) ? String(b.mode) : "auto") as OptimizerMode;
  try {
    return json(await runOptimizer({ mode }));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}
