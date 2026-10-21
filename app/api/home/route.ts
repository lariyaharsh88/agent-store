import { sessionFromRequest } from "@/lib/session";
import { categories, homeProducts, storefrontContext, trackEvent } from "@/lib/store";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** The home page as data: what this session would see, including experiment arms. */
export async function GET(req: Request) {
  const sid = sessionFromRequest(req);
  const url = new URL(req.url);
  const category = url.searchParams.get("category") ?? undefined;
  const ctx = storefrontContext(sid);
  const products = homeProducts(sid, ctx.sort_strategy, { category });
  trackEvent(sid, "view_home", { meta: { via: "api", category } });
  return json({
    session_id: sid,
    ...ctx,
    categories: categories(),
    products: products.map((p) => ({ id: p.id, slug: p.slug, name: p.name, category: p.category, price: p.effective_price, list_price: p.base_price, in_stock: p.stock > 0, emoji: p.emoji, tags: p.tags, url: `/p/${p.slug}` })),
  });
}
