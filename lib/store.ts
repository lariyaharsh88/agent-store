import { db, newId, now } from "./db";
import { armFor, recordConversion, syncThresholdCopy } from "./experiments";
import { parseProduct, rankProducts, relatedProducts } from "./recommend";
import type { Cart, CartLine, Order, PricedProduct, Product, Settings } from "./types";

export const SETTING_KEYS = ["store_name", "hero_headline", "hero_subheadline", "cta_label", "product_sort", "free_shipping_threshold"] as const;

export function getSettings(): Settings {
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const m: Record<string, string> = {};
  for (const r of rows) m[r.key] = r.value;
  return {
    store_name: m.store_name ?? "Agent Store",
    hero_headline: m.hero_headline ?? "",
    hero_subheadline: m.hero_subheadline ?? "",
    cta_label: m.cta_label ?? "Add to cart",
    product_sort: (m.product_sort as Settings["product_sort"]) ?? "learned",
    free_shipping_threshold: Number(m.free_shipping_threshold ?? 75),
  };
}

export function setSetting(key: string, value: string) {
  if (!(SETTING_KEYS as readonly string[]).includes(key)) throw new Error(`Unknown setting '${key}'. Allowed: ${SETTING_KEYS.join(", ")}`);
  if (key === "product_sort" && !["learned", "default", "price_asc", "popular"].includes(value)) throw new Error("product_sort must be learned | default | price_asc | popular");
  if (key === "free_shipping_threshold") {
    if (!Number.isFinite(Number(value))) throw new Error("free_shipping_threshold must be a number");
    syncThresholdCopy(Number(value));
    return;
  }
  db().prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)").run(key, value, now());
}

export function listProducts(opts: { category?: string; q?: string; includeInactive?: boolean } = {}): Product[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (!opts.includeInactive) where.push("active = 1");
  if (opts.category) {
    where.push("LOWER(category) = LOWER(?)");
    params.push(opts.category);
  }
  if (opts.q) {
    where.push("(LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(tags) LIKE ? OR LOWER(category) LIKE ?)");
    const like = `%${opts.q.toLowerCase()}%`;
    params.push(like, like, like, like);
  }
  const sql = `SELECT * FROM products ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY sort_order`;
  return (db().prepare(sql).all(...params) as Record<string, unknown>[]).map(parseProduct);
}

export function categories(): string[] {
  return (db().prepare("SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category").all() as { category: string }[]).map((r) => r.category);
}

export function getProductBySlug(slug: string): Product | null {
  const r = db().prepare("SELECT * FROM products WHERE slug = ?").get(slug) as Record<string, unknown> | undefined;
  return r ? parseProduct(r) : null;
}

export function getProductById(id: string): Product | null {
  const r = db().prepare("SELECT * FROM products WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? parseProduct(r) : null;
}

export function updateProduct(id: string, patch: Partial<Pick<Product, "name" | "description" | "price" | "stock" | "active" | "category">> & { tags?: string[] }): Product {
  const p = getProductById(id);
  if (!p) throw new Error(`No product '${id}'`);
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (patch.name != null) { sets.push("name = ?"); params.push(String(patch.name)); }
  if (patch.description != null) { sets.push("description = ?"); params.push(String(patch.description)); }
  if (patch.category != null) { sets.push("category = ?"); params.push(String(patch.category)); }
  if (patch.price != null) {
    const price = Number(patch.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error("price must be a positive number");
    if (price < p.cost) throw new Error(`price ${price} is below cost ${p.cost}; refusing to sell at a loss`);
    sets.push("price = ?"); params.push(Math.round(price * 100) / 100);
  }
  if (patch.stock != null) {
    const stock = Math.round(Number(patch.stock));
    if (!Number.isFinite(stock) || stock < 0) throw new Error("stock must be a non-negative integer");
    sets.push("stock = ?"); params.push(stock);
  }
  if (patch.active != null) { sets.push("active = ?"); params.push(patch.active ? 1 : 0); }
  if (patch.tags != null) { sets.push("tags = ?"); params.push(JSON.stringify(patch.tags)); }
  if (!sets.length) throw new Error("Nothing to update");
  sets.push("updated_at = ?"); params.push(now());
  params.push(id);
  db().prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  return getProductById(id)!;
}

/** Price this session sees: a running price experiment arm, else the list price. `expose` counts the impression (product page, add to cart); cards only assign. */
export function priceFor(sessionId: string, product: Product, opts: { expose?: boolean } = {}): PricedProduct {
  const hit = armFor(sessionId, `price:${product.id}`, { expose: opts.expose ?? true });
  if (!hit) return { ...product, effective_price: product.price, price_experiment: null };
  return { ...product, effective_price: Number(hit.arm.config.price), price_experiment: { experiment_id: hit.experiment.id, arm_id: hit.arm.id } };
}

export function trackEvent(sessionId: string, type: string, opts: { productId?: string; value?: number; meta?: Record<string, unknown> } = {}) {
  db().prepare("INSERT INTO events (ts, session_id, type, product_id, value, meta) VALUES (?, ?, ?, ?, ?, ?)").run(
    now(), sessionId, type, opts.productId ?? null, opts.value ?? null, opts.meta ? JSON.stringify(opts.meta) : null,
  );
}

export type StorefrontContext = {
  store_name: string;
  headline: string;
  subheadline: string;
  cta_label: string;
  sort_strategy: string;
  free_shipping_threshold: number;
  experiments: { surface: string; experiment_id: string; arm_id: string }[];
};

/** Everything the home page needs, with experiment arms resolved for this session. */
export function storefrontContext(sessionId: string): StorefrontContext {
  const s = getSettings();
  const ctx: StorefrontContext = {
    store_name: s.store_name,
    headline: s.hero_headline,
    subheadline: s.hero_subheadline,
    cta_label: s.cta_label,
    sort_strategy: s.product_sort,
    free_shipping_threshold: s.free_shipping_threshold,
    experiments: [],
  };
  const h = armFor(sessionId, "hero_headline");
  if (h) {
    ctx.headline = String(h.arm.config.headline);
    if (h.arm.config.subheadline != null) ctx.subheadline = String(h.arm.config.subheadline);
    ctx.experiments.push({ surface: "hero_headline", experiment_id: h.experiment.id, arm_id: h.arm.id });
  }
  const c = armFor(sessionId, "cta_label");
  if (c) {
    ctx.cta_label = String(c.arm.config.label);
    ctx.experiments.push({ surface: "cta_label", experiment_id: c.experiment.id, arm_id: c.arm.id });
  }
  const so = armFor(sessionId, "product_sort");
  if (so) {
    ctx.sort_strategy = String(so.arm.config.strategy);
    ctx.experiments.push({ surface: "product_sort", experiment_id: so.experiment.id, arm_id: so.arm.id });
  }
  const f = armFor(sessionId, "free_shipping_threshold");
  if (f) {
    ctx.free_shipping_threshold = Number(f.arm.config.threshold);
    ctx.experiments.push({ surface: "free_shipping_threshold", experiment_id: f.experiment.id, arm_id: f.arm.id });
  }
  return ctx;
}

export function homeProducts(sessionId: string, strategy: string, opts: { category?: string; q?: string } = {}): PricedProduct[] {
  const products = rankProducts(listProducts(opts), strategy);
  return products.map((p) => priceFor(sessionId, p, { expose: false }));
}

export function viewProduct(sessionId: string, slug: string): { product: PricedProduct; related: PricedProduct[] } | null {
  const p = getProductBySlug(slug);
  if (!p || !p.active) return null;
  const priced = priceFor(sessionId, p);
  trackEvent(sessionId, "view", { productId: p.id, value: priced.effective_price });
  return { product: priced, related: relatedProducts(p).map((r) => priceFor(sessionId, r, { expose: false })) };
}

function shippingFor(subtotal: number, threshold: number): number {
  if (subtotal <= 0) return 0;
  return subtotal >= threshold ? 0 : 6.99;
}

export function getCart(sessionId: string, threshold?: number): Cart {
  const t = threshold ?? storefrontContext(sessionId).free_shipping_threshold;
  const rows = db().prepare("SELECT product_id, qty, unit_price FROM carts WHERE session_id = ?").all(sessionId) as { product_id: string; qty: number; unit_price: number }[];
  const lines: CartLine[] = [];
  for (const r of rows) {
    const p = getProductById(r.product_id);
    if (!p) continue;
    lines.push({ product: p, qty: r.qty, unit_price: r.unit_price, line_total: Math.round(r.qty * r.unit_price * 100) / 100 });
  }
  const subtotal = Math.round(lines.reduce((s, l) => s + l.line_total, 0) * 100) / 100;
  const shipping = shippingFor(subtotal, t);
  return { session_id: sessionId, lines, subtotal, shipping, total: Math.round((subtotal + shipping) * 100) / 100, free_shipping_threshold: t, amount_to_free_shipping: Math.max(0, Math.round((t - subtotal) * 100) / 100) };
}

export function addToCart(sessionId: string, productId: string, qty = 1): Cart {
  const p = getProductById(productId);
  if (!p || !p.active) throw new Error(`No product '${productId}'`);
  if (p.stock <= 0) throw new Error(`${p.name} is out of stock`);
  const priced = priceFor(sessionId, p);
  const q = Math.max(1, Math.min(10, Math.round(qty)));
  db().prepare(
    `INSERT INTO carts (session_id, product_id, qty, unit_price) VALUES (?, ?, ?, ?)
     ON CONFLICT(session_id, product_id) DO UPDATE SET qty = MIN(10, qty + excluded.qty), unit_price = excluded.unit_price`,
  ).run(sessionId, productId, q, priced.effective_price);
  trackEvent(sessionId, "add_to_cart", { productId, value: priced.effective_price * q, meta: { qty: q } });
  recordConversion(sessionId, "add_to_cart", { productId, revenue: priced.effective_price * q });
  return getCart(sessionId);
}

export function removeFromCart(sessionId: string, productId: string): Cart {
  db().prepare("DELETE FROM carts WHERE session_id = ? AND product_id = ?").run(sessionId, productId);
  trackEvent(sessionId, "remove_from_cart", { productId });
  return getCart(sessionId);
}

export function checkout(sessionId: string, opts: { email?: string; name?: string; channel?: string } = {}): Order {
  const cart = getCart(sessionId);
  if (!cart.lines.length) throw new Error("Cart is empty");
  const d = db();
  for (const l of cart.lines) {
    if (l.product.stock < l.qty) throw new Error(`Only ${l.product.stock} of ${l.product.name} left`);
  }
  const id = newId("ord");
  const ts = now();
  const items = cart.lines.map((l) => ({ product_id: l.product.id, slug: l.product.slug, name: l.product.name, qty: l.qty, unit_price: l.unit_price }));
  const meta = { email: opts.email ?? null, name: opts.name ?? null, channel: opts.channel ?? "web" };
  d.prepare("INSERT INTO orders (id, session_id, items, subtotal, shipping, total, created_at, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    id, sessionId, JSON.stringify(items), cart.subtotal, cart.shipping, cart.total, ts, JSON.stringify(meta),
  );
  const dec = d.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
  const lineRevenue: Record<string, number> = {};
  for (const l of cart.lines) {
    dec.run(l.qty, l.product.id);
    lineRevenue[l.product.id] = l.line_total;
    trackEvent(sessionId, "purchase", { productId: l.product.id, value: l.line_total, meta: { qty: l.qty, order_id: id } });
  }
  trackEvent(sessionId, "order", { value: cart.total, meta: { order_id: id, items: items.length } });
  d.prepare("DELETE FROM carts WHERE session_id = ?").run(sessionId);
  recordConversion(sessionId, "purchase", { revenue: cart.total, lineRevenue });
  return getOrder(id)!;
}

export function getOrder(id: string): Order | null {
  const r = db().prepare("SELECT * FROM orders WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!r) return null;
  return { ...(r as unknown as Order), items: JSON.parse(r.items as string), meta: r.meta ? JSON.parse(r.meta as string) : null };
}
