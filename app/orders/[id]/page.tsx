import Link from "next/link";
import { notFound } from "next/navigation";
import { money } from "@/components/ProductCard";
import { getOrder } from "@/lib/store";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) notFound();
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Thanks, your order is in.</h1>
      <p className="muted text-sm">Order <code className="inline">{order.id}</code> placed {new Date(order.created_at).toLocaleString()}.</p>
      <div className="panel p-5 text-sm space-y-1">
        {order.items.map((i) => <div key={i.product_id} className="flex justify-between"><span>{i.qty} × {i.name}</span><span className="kpi">{money(i.qty * i.unit_price)}</span></div>)}
        <div className="flex justify-between"><span>Shipping</span><span className="kpi">{order.shipping === 0 ? "Free" : money(order.shipping)}</span></div>
        <div className="flex justify-between font-bold text-base pt-1"><span>Total</span><span className="kpi">{money(order.total)}</span></div>
      </div>
      <Link href="/" className="btn">Keep shopping</Link>
    </div>
  );
}
