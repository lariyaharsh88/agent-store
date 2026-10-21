import { db } from "./db";
import { randBeta } from "./bandit";
import type { Product } from "./types";

export type ProductSignal = { product_id: string; views: number; add_to_carts: number; purchases: number; revenue: number };

/** Behavioural counts per product, straight from the event log. */
export function productSignals(): Record<string, ProductSignal> {
  const rows = db()
    .prepare(
      `SELECT product_id,
         SUM(CASE WHEN type = 'view' THEN 1 ELSE 0 END) AS views,
         SUM(CASE WHEN type = 'add_to_cart' THEN 1 ELSE 0 END) AS add_to_carts,
         SUM(CASE WHEN type = 'purchase' THEN 1 ELSE 0 END) AS purchases,
         SUM(CASE WHEN type = 'purchase' THEN COALESCE(value, 0) ELSE 0 END) AS revenue
       FROM events WHERE product_id IS NOT NULL GROUP BY product_id`,
    )
    .all() as ProductSignal[];
  const out: Record<string, ProductSignal> = {};
  for (const r of rows) out[r.product_id] = r;
  return out;
}

/**
 * Learned ranking: Thompson-sample each product's view-to-purchase rate so
 * strong sellers float up while under-exposed products still get tried.
 */
export function rankProducts(products: Product[], strategy: string): Product[] {
  if (strategy === "price_asc") return products.slice().sort((a, b) => a.price - b.price);
  const sig = productSignals();
  if (strategy === "popular") return products.slice().sort((a, b) => (sig[b.id]?.views ?? 0) - (sig[a.id]?.views ?? 0));
  if (strategy === "learned") {
    const scored = products.map((p) => {
      const s = sig[p.id];
      const views = s?.views ?? 0;
      const buys = s?.purchases ?? 0;
      const sample = randBeta(1 + buys, 1 + Math.max(0, views - buys));
      return { p, score: sample * Math.sqrt(p.price) };
    });
    return scored.sort((a, b) => b.score - a.score).map((x) => x.p);
  }
  return products.slice().sort((a, b) => a.sort_order - b.sort_order);
}

/** Products bought or viewed together with this one, falling back to its category. */
export function relatedProducts(product: Product, limit = 4): Product[] {
  const d = db();
  const co = d
    .prepare(
      `SELECT e2.product_id AS pid, COUNT(*) AS n FROM events e1
       JOIN events e2 ON e1.session_id = e2.session_id AND e2.product_id != e1.product_id
       WHERE e1.product_id = ? AND e1.type IN ('view','add_to_cart','purchase') AND e2.type IN ('add_to_cart','purchase')
       GROUP BY e2.product_id ORDER BY n DESC LIMIT ?`,
    )
    .all(product.id, limit) as { pid: string; n: number }[];
  const ids = co.map((r) => r.pid);
  const found: Product[] = [];
  for (const id of ids) {
    const r = d.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(id) as Record<string, unknown> | undefined;
    if (r) found.push(parseProduct(r));
  }
  if (found.length < limit) {
    const extra = d
      .prepare("SELECT * FROM products WHERE category = ? AND id != ? AND active = 1 ORDER BY sort_order LIMIT ?")
      .all(product.category, product.id, limit) as Record<string, unknown>[];
    for (const r of extra) {
      const p = parseProduct(r);
      if (!found.some((f) => f.id === p.id)) found.push(p);
      if (found.length >= limit) break;
    }
  }
  return found.slice(0, limit);
}

export function parseProduct(r: Record<string, unknown>): Product {
  return { ...(r as unknown as Product), tags: JSON.parse((r.tags as string) || "[]") };
}
