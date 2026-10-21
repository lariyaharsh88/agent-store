import { agentAuthorized, agentName } from "@/lib/auth";
import { invokeTool } from "@/lib/tools";
import { body, fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!agentAuthorized(req)) return fail("Missing or invalid x-agent-key", 401);
  const { name } = await params;
  const input = await body(req);
  const out = invokeTool(name, input, { agent: agentName(req) });
  return out.ok ? json({ ok: true, result: out.result }) : json({ ok: false, error: out.error }, 400);
}
