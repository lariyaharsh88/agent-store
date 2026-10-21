import { sessionFromRequest } from "@/lib/session";
import { viewProduct } from "@/lib/store";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sid = sessionFromRequest(req);
  const v = viewProduct(sid, slug);
  if (!v) return fail("Product not found", 404);
  const p = v.product;
  return json({
    product: { id: p.id, slug: p.slug, name: p.name, description: p.description, category: p.category, price: p.effective_price, list_price: p.base_price, stock: p.stock, tags: p.tags, url: `/p/${p.slug}` },
    related: v.related.map((r) => ({ id: r.id, slug: r.slug, name: r.name, price: r.effective_price, url: `/p/${r.slug}` })),
  });
}
