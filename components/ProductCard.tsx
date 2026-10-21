import Link from "next/link";
import type { PricedProduct } from "@/lib/types";
import { addToCartAction } from "@/app/actions";

export function money(n: number) {
  return "$" + n.toFixed(2);
}

export function ProductCard({ p, cta }: { p: PricedProduct; cta: string }) {
  const discounted = p.effective_price < p.base_price;
  return (
    <div className="panel p-3 flex flex-col gap-3">
      <Link href={`/p/${p.slug}`} className="tile" style={{ background: `hsl(${p.hue} 70% 92%)` }} aria-label={p.name}>
        <span>{p.emoji}</span>
      </Link>
      <div className="flex-1">
        <div className="text-xs muted">{p.category}</div>
        <Link href={`/p/${p.slug}`} className="font-semibold leading-snug hover:underline">{p.name}</Link>
        <div className="mt-1 kpi">
          <span className="font-semibold">{money(p.effective_price)}</span>
          {discounted && <span className="ml-2 muted line-through text-sm">{money(p.base_price)}</span>}
        </div>
      </div>
      <form action={addToCartAction}>
        <input type="hidden" name="product_id" value={p.id} />
        <button className="btn btn-primary w-full" disabled={p.stock <= 0}>{p.stock > 0 ? cta : "Sold out"}</button>
      </form>
    </div>
  );
}
