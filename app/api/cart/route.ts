import { sessionFromRequest } from "@/lib/session";
import { addToCart, getCart, removeFromCart } from "@/lib/store";
import { body, fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

function shape(c: ReturnType<typeof getCart>) {
  return { session_id: c.session_id, lines: c.lines.map((l) => ({ product_id: l.product.id, slug: l.product.slug, name: l.product.name, qty: l.qty, unit_price: l.unit_price, line_total: l.line_total })), subtotal: c.subtotal, shipping: c.shipping, total: c.total, free_shipping_threshold: c.free_shipping_threshold, amount_to_free_shipping: c.amount_to_free_shipping };
}

export async function GET(req: Request) {
  return json(shape(getCart(sessionFromRequest(req))));
}

/** Body: { product_id, qty? } */
export async function POST(req: Request) {
  const sid = sessionFromRequest(req);
  const b = await body(req);
  if (!b.product_id) return fail("product_id is required");
  try {
    return json(shape(addToCart(sid, String(b.product_id), Number(b.qty) || 1)));
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/** Body: { product_id } */
export async function DELETE(req: Request) {
  const sid = sessionFromRequest(req);
  const b = await body(req);
  if (!b.product_id) return fail("product_id is required");
  return json(shape(removeFromCart(sid, String(b.product_id))));
}
