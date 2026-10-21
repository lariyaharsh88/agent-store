/**
 * Thompson sampling over Beta posteriors. Each arm is modelled as
 * Beta(1 + conversions, 1 + impressions - conversions).
 */

function randNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia & Tsang gamma sampler, shape > 0, scale 1. */
export function randGamma(shape: number): number {
  if (shape < 1) return randGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = randNormal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function randBeta(a: number, b: number): number {
  const x = randGamma(a);
  const y = randGamma(b);
  return x / (x + y);
}

export type ArmCounts = { id: string; impressions: number; conversions: number; weight?: number };

export function posterior(arm: ArmCounts): { alpha: number; beta: number } {
  return { alpha: 1 + arm.conversions, beta: 1 + Math.max(0, arm.impressions - arm.conversions) };
}

/** Pick an arm by sampling each posterior once and taking the max. `weight` turns a conversion-rate sample into a value-per-impression sample (used for price arms). */
export function thompsonPick(arms: ArmCounts[]): string {
  let best = arms[0].id;
  let bestSample = -1;
  for (const arm of arms) {
    const { alpha, beta } = posterior(arm);
    const s = randBeta(alpha, beta) * (arm.weight ?? 1);
    if (s > bestSample) {
      bestSample = s;
      best = arm.id;
    }
  }
  return best;
}

/** Monte Carlo estimate of P(arm is best). */
export function probBest(arms: ArmCounts[], samples = 3000): Record<string, number> {
  const wins: Record<string, number> = {};
  for (const a of arms) wins[a.id] = 0;
  const post = arms.map((a) => ({ id: a.id, weight: a.weight ?? 1, ...posterior(a) }));
  for (let i = 0; i < samples; i++) {
    let best = post[0].id;
    let bs = -1;
    for (const p of post) {
      const s = randBeta(p.alpha, p.beta) * p.weight;
      if (s > bs) {
        bs = s;
        best = p.id;
      }
    }
    wins[best]++;
  }
  for (const k of Object.keys(wins)) wins[k] = wins[k] / samples;
  return wins;
}

/** Wilson 95% interval for a conversion rate. */
export function wilson(conversions: number, impressions: number): [number, number] {
  if (impressions === 0) return [0, 1];
  const z = 1.96;
  const p = conversions / impressions;
  const n = impressions;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - spread) / denom), Math.min(1, (centre + spread) / denom)];
}
