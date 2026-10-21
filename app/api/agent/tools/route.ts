import { toolManifest } from "@/lib/tools";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Operator tool catalogue in Claude tool-definition shape. POST /api/agent/tools/<name> to call one. */
export async function GET() {
  return json({ tools: toolManifest(), invoke: "POST /api/agent/tools/{name} with a JSON body matching input_schema. Headers: x-agent-name (who you are), x-agent-key (if AGENT_API_KEY is set)." });
}
