import Link from "next/link";
import { notFound } from "next/navigation";
import { experimentResults, getExperiment } from "@/lib/experiments";

const pct = (n: number, d = 1) => (n * 100).toFixed(d) + "%";

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getExperiment(id)) notFound();
  const r = experimentResults(id);
  const e = r.experiment;
  return (
    <div className="max-w-3xl space-y-6">
      <nav className="text-sm muted"><Link href="/admin">Operator console</Link> / {e.name}</nav>
      <div>
        <h1 className="text-2xl font-bold">{e.name}</h1>
        <p className="muted text-sm">{e.surface} · {e.status} · created by {e.created_by} · conversion = {e.conversion_event} · objective = {r.objective}</p>
        {e.hypothesis && <p className="mt-2 text-sm"><span className="font-medium">Hypothesis:</span> {e.hypothesis}</p>}
        {e.outcome && <p className="mt-1 text-sm"><span className="font-medium">Outcome:</span> {e.outcome}</p>}
      </div>
      <div className="panel overflow-x-auto">
        <table className="data">
          <thead><tr><th>Arm</th><th>Config</th><th>Impressions</th><th>Conversions</th><th>Rate (95% CI)</th><th>Revenue</th><th>Profit / imp</th><th>Lift</th><th>P(best)</th></tr></thead>
          <tbody>
            {r.arms.map((a) => (
              <tr key={a.id} style={{ fontWeight: a.id === e.winner_arm ? 600 : undefined }}>
                <td>{a.label}{a.id === e.winner_arm ? " ★" : ""}</td>
                <td className="text-xs"><code className="inline">{JSON.stringify(a.config)}</code></td>
                <td>{a.impressions}</td><td>{a.conversions}</td>
                <td>{pct(a.rate)} <span className="muted text-xs">({pct(a.ci95[0])}–{pct(a.ci95[1])})</span></td>
                <td>${a.revenue.toFixed(2)}</td>
                <td>{a.profit_per_impression == null ? "—" : "$" + a.profit_per_impression.toFixed(2)}</td>
                <td>{a.lift_vs_control == null ? "—" : (a.lift_vs_control >= 0 ? "+" : "") + pct(a.lift_vs_control, 0)}</td>
                <td>{pct(a.prob_best, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm muted">Traffic is split by Thompson sampling, so arms that look better receive more impressions while the experiment runs. {r.decisive ? "This result is decisive." : "Not decisive yet."}</p>
    </div>
  );
}
