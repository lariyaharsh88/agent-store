import Link from "next/link";
import { money } from "@/components/ProductCard";
import { removeFromCartAction } from "@/app/actions";
import { getSessionId } from "@/lib/session";
import { getCart } from "@/lib/store";

export default async function CartPage() {
  const sid = await getSessionId();
  const cart = getCart(sid);
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Your cart</h1>
      {!cart.lines.length ? (
        <p className="muted">Your cart is empty. <Link href="/" className="underline">Back to the shop</Link>.</p>
      ) : (
        <div className="panel divide-y" style={{ borderColor: "var(--line)" }}>
          {cart.lines.map((l) => (
            <div key={l.product.id} className="flex items-center gap-4 p-4">
              <div className="w-14 h-14 rounded-lg grid place-items-center text-2xl" style={{ background: `hsl(${l.product.hue} 70% 92%)` }}>{l.product.emoji}</div>
              <div className="flex-1">
                <Link href={`/p/${l.product.slug}`} className="font-semibold hover:underline">{l.product.name}</Link>
                <div className="text-sm muted">{l.qty} × {money(l.unit_price)}</div>
              </div>
              <div className="kpi font-semibold">{money(l.line_total)}</div>
              <form action={removeFromCartAction}>
                <input type="hidden" name="product_id" value={l.product.id} />
                <button className="btn btn-danger text-xs">Remove</button>
              </form>
            </div>
          ))}
          <div className="p-4 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="kpi">{money(cart.subtotal)}</span></div>
            <div className="flex justify-between"><span>Shipping</span><span className="kpi">{cart.shipping === 0 ? "Free" : money(cart.shipping)}</span></div>
            {cart.amount_to_free_shipping > 0 && <p className="muted text-xs">Add {money(cart.amount_to_free_shipping)} more for free shipping.</p>}
            <div className="flex justify-between font-bold text-base pt-2"><span>Total</span><span className="kpi">{money(cart.total)}</span></div>
          </div>
          <div className="p-4"><Link href="/checkout" className="btn btn-primary w-full">Checkout</Link></div>
        </div>
      )}
    </div>
  );
}
