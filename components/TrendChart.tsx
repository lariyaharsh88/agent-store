import type { Cohort } from "@/lib/metrics";

/** Inline SVG line chart of conversion rate and revenue per session by cohort. */
export function TrendChart({ cohorts }: { cohorts: Cohort[] }) {
  if (cohorts.length < 2) return <p className="muted text-sm">Needs at least 500 sessions to draw a trend. Run the simulator a few times.</p>;
  const w = 640, h = 180, pad = 28;
  const xs = (i: number) => pad + (i / (cohorts.length - 1)) * (w - pad * 2);
  const maxCr = Math.max(...cohorts.map((c) => c.conversion_rate), 0.01);
  const maxRps = Math.max(...cohorts.map((c) => c.revenue_per_session), 0.01);
  const path = (get: (c: Cohort) => number, max: number) => cohorts.map((c, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${(h - pad - (get(c) / max) * (h - pad * 2)).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Conversion rate and revenue per session by cohort">
        <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--line)" />
        <path d={path((c) => c.conversion_rate, maxCr)} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        <path d={path((c) => c.revenue_per_session, maxRps)} fill="none" stroke="var(--good)" strokeWidth={2.5} strokeDasharray="6 4" />
        {cohorts.map((c, i) => <circle key={i} cx={xs(i)} cy={h - pad - (c.conversion_rate / maxCr) * (h - pad * 2)} r={3} fill="var(--accent)" />)}
        <text x={pad} y={h - 8} fontSize={10} fill="var(--muted)">cohort 1</text>
        <text x={w - pad} y={h - 8} fontSize={10} fill="var(--muted)" textAnchor="end">cohort {cohorts.length}</text>
      </svg>
      <div className="flex gap-4 text-xs muted mt-1">
        <span><span style={{ color: "var(--accent)" }}>■</span> conversion rate (max {(maxCr * 100).toFixed(1)}%)</span>
        <span><span style={{ color: "var(--good)" }}>■</span> revenue / session (max ${maxRps.toFixed(2)})</span>
        <span>{cohorts[0].sessions} sessions per cohort</span>
      </div>
    </div>
  );
}
