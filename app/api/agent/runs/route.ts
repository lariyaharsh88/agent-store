import { listRuns, recentActions } from "@/lib/metrics";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("run") ?? undefined;
  return json({ runs: listRuns(20), actions: recentActions(50, runId) });
}
