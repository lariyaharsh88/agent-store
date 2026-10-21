import { cohortTrend, overview, productTable } from "@/lib/metrics";
import { experimentResults, listExperiments } from "@/lib/experiments";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ ...overview(), products: productTable(), cohorts: cohortTrend(250), experiments: listExperiments().map((e) => experimentResults(e.id)) });
}
