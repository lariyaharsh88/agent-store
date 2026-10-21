import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard, money } from "@/components/ProductCard";
import { addToCartAction } from "@/app/actions";
import { getSessionId } from "@/lib/session";
import { storefrontContext, viewProduct } from "@/lib/store";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sid = await getSessionId();
  const ctx = storefrontContext(sid);
  const v = viewProduct(sid, slug);
  if (!v) notFound();
  const { product: p, related } = v;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.description,
    sku: p.id,
    category: p.category,
    offers: { "@type": "Offer", priceCurrency: "USD", price: p.effective_price.toFixed(2), availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `/p/${p.slug}` },
  };
  return (
    <div className="space-y-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-sm muted"><Link href="/">Shop</Link> / <Link href={`/?category=${p.category}`}>{p.category}</Link> / {p.name}</nav>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="tile text-[8rem]" style={{ background: `hsl(${p.hue} 70% 92%)` }}>{p.emoji}</div>
        <div className="space-y-5">
          <h1 className="text-3xl font-bold tracking-tight">{p.name}</h1>
          <div className="kpi text-2xl">
            <span className="font-semibold">{money(p.effective_price)}</span>
            {p.effective_price < p.base_price && <span className="ml-3 muted line-through text-lg">{money(p.base_price)}</span>}
          </div>
          <p className="muted leading-relaxed">{p.description}</p>
          <div className="flex flex-wrap gap-1">{p.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
          <form action={addToCartAction} className="flex items-center gap-3">
            <input type="hidden" name="product_id" value={p.id} />
            <select name="qty" className="rounded-lg border px-2 py-2 text-sm" style={{ borderColor: "var(--line)" }} defaultValue="1">
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn btn-primary" disabled={p.stock <= 0}>{p.stock > 0 ? ctx.cta_label : "Sold out"}</button>
          </form>
          <p className="text-xs muted">{p.stock > 0 ? `${p.stock} in stock.` : "Out of stock."} Free shipping on orders over ${ctx.free_shipping_threshold}.</p>
        </div>
      </div>
      {related.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Bought together</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{related.map((r) => <ProductCard key={r.id} p={r} cta={ctx.cta_label} />)}</div>
        </section>
      )}
    </div>
  );
}
