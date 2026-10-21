import { redirect } from "next/navigation";
import { money } from "@/components/ProductCard";
import { checkoutAction } from "@/app/actions";
import { getSessionId } from "@/lib/session";
import { getCart, trackEvent } from "@/lib/store";

export default async function CheckoutPage() {
  const sid = await getSessionId();
  const cart = getCart(sid);
  if (!cart.lines.length) redirect("/cart");
  trackEvent(sid, "checkout_start", { value: cart.total });
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Checkout</h1>
      <p className="muted text-sm">Demo checkout: no payment is taken. The order is recorded so the store can learn from it.</p>
      <form action={checkoutAction} className="panel p-5 space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Name</span>
          <input name="name" required className="mt-1 w-full rounded-lg border px-3 py-2" style={{ borderColor: "var(--line)" }} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Email</span>
          <input name="email" type="email" required className="mt-1 w-full rounded-lg border px-3 py-2" style={{ borderColor: "var(--line)" }} />
        </label>
        <div className="text-sm space-y-1 pt-2">
          {cart.lines.map((l) => <div key={l.product.id} className="flex justify-between"><span>{l.qty} × {l.product.name}</span><span className="kpi">{money(l.line_total)}</span></div>)}
          <div className="flex justify-between"><span>Shipping</span><span className="kpi">{cart.shipping === 0 ? "Free" : money(cart.shipping)}</span></div>
          <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span className="kpi">{money(cart.total)}</span></div>
        </div>
        <button className="btn btn-primary w-full">Place order</button>
      </form>
    </div>
  );
}
