import Link from "next/link";
import { TrendChart } from "@/components/TrendChart";
import { endExperimentAction, resetAction, runOptimizerAction, runSimulationAction } from "@/app/actions";
import { experimentResults, listExperiments } from "@/lib/experiments";
import { cohortTrend, kpis, listInsights, listRuns, productTable, recentActions } from "@/lib/metrics";
import { getSettings } from "@/lib/store";
import { hasClaudeCredentials } from "@/lib/optimizer";

const pct = (n: number, d = 1) => (n * 100).toFixed(d) + "%";
const usd = (n: number) => "$" + n.toFixed(2);

export default async function Admin() {
  const k = kpis();
  const settings = getSettings();
  const running = listExperiments("running").map((e) => experimentResults(e.id));
  const ended = listExperiments("ended").slice(0, 8);
  const products = productTable();
  const runs = listRuns(6);
  const actions = recentActions(12);
  const insights = listInsights({ limit: 8 });
  const cohorts = cohortTrend(250);
  const hasKey = hasClaudeCredentials();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Operator console</h1>
          <p className="muted text-sm">What the agents see, and what they did.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={runSimulationAction} className="flex gap-2">
            <input name="shoppers" type="number" defaultValue={300} min={1} max={2000} className="w-24 rounded-lg border px-2 text-sm" style={{ borderColor: "var(--line)" }} />
            <button className="btn">Send shoppers</button>
          </form>
          <form action={runOptimizerAction}>
            <input type="hidden" name="mode" value="auto" />
            <button className="btn btn-primary">Run optimizer ({hasKey ? "Claude" : "policy"})</button>
          </form>
          {hasKey && (
            <form action={runOptimizerAction}>
              <input type="hidden" name="mode" value="policy" />
              <button className="btn">Run policy only</button>
            </form>
          )}
          <form action={resetAction}><button className="btn btn-danger">Reset data</button></form>
        </div>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          ["Sessions", k.sessions.toLocaleString()],
          ["Orders", k.orders.toLocaleString()],
          ["Revenue", usd(k.revenue)],
          ["Gross margin", usd(k.gross_margin)],
          ["Conversion", pct(k.conversion_rate, 2)],
          ["Add-to-cart", pct(k.add_to_cart_rate)],
          ["AOV", usd(k.aov)],
          ["Rev / session", usd(k.revenue_per_session)],
        ].map(([label, value]) => (
          <div key={label} className="panel p-3">
            <div className="text-xs muted">{label}</div>
            <div className="kpi text-lg font-semibold">{value}</div>
          </div>
        ))}
      </section>

      <section className="panel p-5">
        <h2 className="font-semibold mb-2">Is it learning?</h2>
        <TrendChart cohorts={cohorts} />
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="panel p-5 space-y-4">
          <h2 className="font-semibold">Running experiments ({running.length})</h2>
          {!running.length && <p className="muted text-sm">None. Run the optimizer to launch some.</p>}
          {running.map((r) => (
            <div key={r.experiment.id} className="border rounded-xl p-3 space-y-2" style={{ borderColor: "var(--line)" }}>
              <div className="flex justify-between gap-2 text-sm">
                <div>
                  <Link href={`/admin/experiments/${r.experiment.id}`} className="font-semibold hover:underline">{r.experiment.name}</Link>
                  <div className="text-xs muted">{r.experiment.surface} · by {r.experiment.created_by} · {r.total_impressions} impressions · objective {r.objective}</div>
                </div>
                {r.decisive && <span className="chip chip-on self-start">decisive</span>}
              </div>
              {r.arms.map((a) => (
                <div key={a.id} className="text-xs">
                  <div className="flex justify-between"><span>{a.label}</span><span className="kpi muted">{a.conversions}/{a.impressions} · {pct(a.rate)} · P(best) {pct(a.prob_best, 0)}{a.profit_per_impression != null ? ` · ${usd(a.profit_per_impression)}/imp` : ""}</span></div>
                  <div className="h-1.5 rounded bg-[#f1f0ec] overflow-hidden"><div className="h-full" style={{ width: pct(a.prob_best, 0), background: a.id === r.leader ? "var(--accent)" : "#b9bfd1" }} /></div>
                </div>
              ))}
              <form action={endExperimentAction} className="flex gap-2 items-center text-xs">
                <input type="hidden" name="id" value={r.experiment.id} />
                <select name="winner_arm" className="rounded border px-1 py-0.5" style={{ borderColor: "var(--line)" }} defaultValue="">
                  <option value="">No winner</option>
                  {r.arms.map((a) => <option key={a.id} value={a.id}>Apply {a.label}</option>)}
                </select>
                <button className="btn text-xs py-1">End</button>
              </form>
            </div>
          ))}
          {ended.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mt-2 mb-1">Recently ended</h3>
              <ul className="text-xs space-y-1">
                {ended.map((e) => <li key={e.id}><Link href={`/admin/experiments/${e.id}`} className="font-medium hover:underline">{e.name}</Link> <span className="muted">— {e.outcome}</span></li>)}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="panel p-5">
            <h2 className="font-semibold mb-2">What the store has learned</h2>
            {!insights.length && <p className="muted text-sm">No insights yet.</p>}
            <ul className="space-y-2 text-sm">
              {insights.map((i) => (
                <li key={i.id}><span className="tag mr-1">{i.topic}</span>{i.text} {i.confidence != null && <span className="muted text-xs">({pct(i.confidence, 0)} confidence, {i.agent})</span>}</li>
              ))}
            </ul>
          </div>
          <div className="panel p-5">
            <h2 className="font-semibold mb-2">Live settings</h2>
            <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="muted">Headline</dt><dd>{settings.hero_headline}</dd>
              <dt className="muted">CTA</dt><dd>{settings.cta_label}</dd>
              <dt className="muted">Sort</dt><dd>{settings.product_sort}</dd>
              <dt className="muted">Free shipping</dt><dd>${settings.free_shipping_threshold}</dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="panel p-5 overflow-x-auto">
        <h2 className="font-semibold mb-2">Products</h2>
        <table className="data">
          <thead><tr><th>Product</th><th>Price</th><th>Cost</th><th>Margin</th><th>Stock</th><th>Views</th><th>ATC rate</th><th>Purchases</th><th>Revenue</th></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/p/${p.slug}`} className="hover:underline">{p.name}</Link><div className="text-xs muted">{p.category} · {p.id}</div></td>
                <td>{usd(p.price)}{p.price !== p.base_price && <div className="text-xs muted">was {usd(p.base_price)}</div>}</td>
                <td>{usd(p.cost)}</td><td>{pct(p.margin_pct, 0)}</td>
                <td style={{ color: p.stock < 5 ? "var(--bad)" : undefined }}>{p.stock}</td>
                <td>{p.views}</td><td>{pct(p.atc_rate)}</td><td>{p.purchases}</td><td>{usd(p.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="panel p-5">
          <h2 className="font-semibold mb-2">Optimizer runs</h2>
          {!runs.length && <p className="muted text-sm">No runs yet.</p>}
          <ul className="space-y-3 text-sm">
            {runs.map((r) => (
              <li key={r.id}>
                <div className="text-xs muted">{new Date(r.started_at).toLocaleString()} · {r.mode} · {r.tool_calls} tool calls · {r.ok === 0 ? "failed" : r.finished_at ? "done" : "running"}</div>
                <div>{r.summary}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-5 overflow-x-auto">
          <h2 className="font-semibold mb-2">Agent action log</h2>
          <table className="data">
            <thead><tr><th>When</th><th>Agent</th><th>Tool</th><th>Input</th><th>OK</th></tr></thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{new Date(a.ts).toLocaleTimeString()}</td>
                  <td>{a.agent}</td><td>{a.tool}</td>
                  <td className="max-w-[18rem] truncate text-xs muted">{JSON.stringify(a.input)}</td>
                  <td>{a.ok ? "✓" : "✗"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
