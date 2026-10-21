import { getOrder } from "@/lib/store";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = getOrder(id);
  return o ? json(o) : fail("Order not found", 404);
}
