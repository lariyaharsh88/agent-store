import { sessionFromRequest } from "@/lib/session";
import { homeProducts, storefrontContext, trackEvent } from "@/lib/store";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Searchable catalogue with session-specific prices. ?q=&category= */
export async function GET(req: Request) {
  const sid = sessionFromRequest(req);
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const ctx = storefrontContext(sid);
  const products = homeProducts(sid, ctx.sort_strategy, { q, category });
  if (q) trackEvent(sid, "search", { meta: { q, results: products.length, via: "api" } });
  return json({ count: products.length, products: products.map((p) => ({ id: p.id, slug: p.slug, name: p.name, description: p.description, category: p.category, price: p.effective_price, list_price: p.base_price, stock: p.stock, tags: p.tags, url: `/p/${p.slug}` })) });
}
