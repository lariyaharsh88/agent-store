import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { getSessionId } from "@/lib/session";
import { categories, homeProducts, storefrontContext, trackEvent } from "@/lib/store";

export default async function Home({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const sid = await getSessionId();
  const ctx = storefrontContext(sid);
  const products = homeProducts(sid, ctx.sort_strategy, { category });
  trackEvent(sid, "view_home", { meta: category ? { category } : undefined });
  const cats = categories();
  return (
    <div className="space-y-8">
      <section className="panel p-8 sm:p-12" style={{ background: "linear-gradient(135deg, #fff 0%, #eef2ff 100%)" }}>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight max-w-2xl">{ctx.headline}</h1>
        <p className="mt-3 muted max-w-xl">{ctx.subheadline}</p>
        <p className="mt-4 text-sm">Free shipping on orders over ${ctx.free_shipping_threshold}.</p>
      </section>
      <div className="flex flex-wrap gap-2">
        <Link href="/" className={`chip ${!category ? "chip-on" : ""}`}>All</Link>
        {cats.map((c) => (
          <Link key={c} href={`/?category=${encodeURIComponent(c)}`} className={`chip ${category === c ? "chip-on" : ""}`}>{c}</Link>
        ))}
      </div>
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((p) => <ProductCard key={p.id} p={p} cta={ctx.cta_label} />)}
      </section>
    </div>
  );
}
