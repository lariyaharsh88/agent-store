import { ProductCard } from "@/components/ProductCard";
import { getSessionId } from "@/lib/session";
import { homeProducts, storefrontContext, trackEvent } from "@/lib/store";

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const sid = await getSessionId();
  const ctx = storefrontContext(sid);
  const products = q ? homeProducts(sid, ctx.sort_strategy, { q }) : [];
  if (q) trackEvent(sid, "search", { meta: { q, results: products.length } });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{q ? `Results for “${q}”` : "Search"}</h1>
      {q && !products.length && <p className="muted">Nothing matched. Try a category name or a tag like “wireless”.</p>}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((p) => <ProductCard key={p.id} p={p} cta={ctx.cta_label} />)}
      </section>
    </div>
  );
}
