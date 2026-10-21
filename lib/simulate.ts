/**
 * Synthetic shoppers with HIDDEN preferences. They go through the same
 * functions the HTTP API and the pages use, so experiments, events and
 * conversions are recorded exactly as for real traffic.
 *
 * The store never reads anything in this file; the optimizer has to
 * discover these truths through experiments.
 */
import { randomUUID } from "node:crypto";
import { listProducts, storefrontContext, homeProducts, viewProduct, addToCart, getCart, checkout, trackEvent } from "./store";
import type { PricedProduct } from "./types";

/** Willingness to pay relative to the seed price. >1 means underpriced today, <1 overpriced. */
const WTP_MULTIPLIER: Record<string, number> = {
  "aurora-anc-headphones": 0.88,
  "pebble-true-wireless": 1.25,
  "slab-bluetooth-speaker": 1.0,
  "ember-desk-lamp": 1.1,
  "monolith-laptop-stand": 1.3,
  "keystone-mechanical-keyboard": 0.9,
  "glide-wireless-mouse": 1.05,
  "tempo-smart-bottle": 0.8,
  "stride-resistance-bands": 1.4,
  "halo-massage-gun": 0.92,
  "nimbus-air-purifier": 1.0,
  "brew-pour-over-kettle": 1.15,
  "loom-weighted-blanket": 0.95,
  "orbit-smart-plug-4pk": 1.2,
};

const ELASTICITY: Record<string, number> = { Audio: 1.6, Desk: 1.3, Fitness: 2.0, Home: 1.2 };

const SEGMENTS = [
  { name: "bargain", weight: 0.4, buyBase: 0.45, priceSens: 1.4, browse: [2, 4] },
  { name: "premium", weight: 0.25, buyBase: 0.6, priceSens: 0.6, browse: [1, 3] },
  { name: "browser", weight: 0.35, buyBase: 0.3, priceSens: 1.0, browse: [1, 5] },
];

function pick<T extends { weight: number }>(items: T[]): T {
  const r = Math.random() * items.reduce((s, i) => s + i.weight, 0);
  let acc = 0;
  for (const i of items) { acc += i.weight; if (r <= acc) return i; }
  return items[items.length - 1];
}

function headlineBoost(h: string): number {
  const s = h.toLowerCase();
  if (/free shipping/.test(s)) return 1.3;
  if (/sale|% off|save/.test(s)) return 1.15;
  if (/gear that earns/.test(s)) return 1.0;
  if (/curated|details|notice/.test(s)) return 1.02;
  return 0.97;
}

function ctaBoost(label: string): number {
  const s = label.toLowerCase();
  if (/free returns/.test(s)) return 1.18;
  if (/buy now/.test(s)) return 1.08;
  if (/add to bag/.test(s)) return 0.93;
  if (/add to cart/.test(s)) return 1.0;
  return 0.95;
}

export type SimResult = { shoppers: number; sessions_with_view: number; add_to_carts: number; orders: number; revenue: number; ms: number };

export function simulateShoppers(n: number): SimResult {
  const t0 = Date.now();
  const basePrice: Record<string, number> = {};
  for (const p of listProducts()) basePrice[p.slug] = p.base_price;
  const cats = Array.from(new Set(listProducts().map((p) => p.category)));
  let views = 0, atcs = 0, orders = 0, revenue = 0;

  for (let i = 0; i < n; i++) {
    const sid = "sim_" + randomUUID().slice(0, 12);
    const seg = pick(SEGMENTS);
    const affinity: Record<string, number> = {};
    for (const c of cats) affinity[c] = 0.3 + Math.random() * 0.7;
    const fav = cats[Math.floor(Math.random() * cats.length)];
    affinity[fav] = 1.0;

    trackEvent(sid, "session_start", { meta: { segment: seg.name } });
    const ctx = storefrontContext(sid);
    const shelf = homeProducts(sid, ctx.sort_strategy);
    trackEvent(sid, "view_home");
    const hb = headlineBoost(ctx.headline);
    const cb = ctaBoost(ctx.cta_label);

    const k = seg.browse[0] + Math.floor(Math.random() * (seg.browse[1] - seg.browse[0] + 1));
    const chosen = chooseProducts(shelf, affinity, k);
    let viewed = false;
    for (const p of chosen) {
      const v = viewProduct(sid, p.slug);
      if (!v) continue;
      viewed = true;
      const price = v.product.effective_price;
      const wtp = basePrice[p.slug] * (WTP_MULTIPLIER[p.slug] ?? 1);
      const el = (ELASTICITY[p.category] ?? 1.3) * seg.priceSens;
      const priceFactor = Math.min(1.8, Math.max(0.1, Math.pow(wtp / price, el)));
      const pAtc = 0.22 * affinity[p.category] * priceFactor * cb;
      if (Math.random() < pAtc && p.stock > 0) {
        try { addToCart(sid, p.id, Math.random() < 0.15 ? 2 : 1); atcs++; } catch { /* out of stock */ }
      }
    }
    if (viewed) views++;
    const cart = getCart(sid, ctx.free_shipping_threshold);
    if (cart.lines.length) {
      trackEvent(sid, "checkout_start", { value: cart.total });
      const shipFactor = cart.shipping === 0 ? 1.15 : 0.9;
      const pBuy = seg.buyBase * hb * shipFactor;
      if (Math.random() < pBuy) {
        try {
          const o = checkout(sid, { channel: "sim" });
          orders++;
          revenue += o.total;
        } catch { /* stock ran out */ }
      }
    }
  }
  return { shoppers: n, sessions_with_view: views, add_to_carts: atcs, orders, revenue: Math.round(revenue * 100) / 100, ms: Date.now() - t0 };
}

/** Position-biased, affinity-weighted sampling without replacement. */
function chooseProducts(shelf: PricedProduct[], affinity: Record<string, number>, k: number): PricedProduct[] {
  const pool = shelf.map((p, idx) => ({ p, weight: affinity[p.category] * (1 / Math.pow(idx + 1, 0.6)) }));
  const out: PricedProduct[] = [];
  while (out.length < k && pool.length) {
    const total = pool.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    let j = 0;
    for (; j < pool.length; j++) { r -= pool[j].weight; if (r <= 0) break; }
    const [hit] = pool.splice(Math.min(j, pool.length - 1), 1);
    out.push(hit.p);
  }
  return out;
}
