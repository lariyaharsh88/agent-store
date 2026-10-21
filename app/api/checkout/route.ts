import { sessionFromRequest } from "@/lib/session";
import { checkout } from "@/lib/store";
import { body, fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Body: { name?, email? }. Demo checkout, no payment is taken. */
export async function POST(req: Request) {
  const sid = sessionFromRequest(req);
  const b = await body(req);
  try {
    const order = checkout(sid, { name: b.name ? String(b.name) : undefined, email: b.email ? String(b.email) : undefined, channel: "api" });
    return json({ order, url: `/orders/${order.id}` }, 201);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
