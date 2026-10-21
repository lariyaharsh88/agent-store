"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionId } from "@/lib/session";
import { addToCart, checkout, removeFromCart } from "@/lib/store";
import { simulateShoppers } from "@/lib/simulate";
import { runOptimizer, type OptimizerMode } from "@/lib/optimizer";
import { invokeTool } from "@/lib/tools";

export async function addToCartAction(formData: FormData) {
  const sid = await getSessionId();
  const id = String(formData.get("product_id") ?? "");
  const qty = Number(formData.get("qty") ?? 1);
  try { addToCart(sid, id, qty); } catch { /* out of stock: nothing to do */ }
  revalidatePath("/", "layout");
}

export async function removeFromCartAction(formData: FormData) {
  const sid = await getSessionId();
  removeFromCart(sid, String(formData.get("product_id") ?? ""));
  revalidatePath("/", "layout");
}

export async function checkoutAction(formData: FormData) {
  const sid = await getSessionId();
  const order = checkout(sid, { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") });
  revalidatePath("/", "layout");
  redirect(`/orders/${order.id}`);
}

export async function runSimulationAction(formData: FormData) {
  const n = Math.min(2000, Math.max(1, Number(formData.get("shoppers") ?? 300)));
  invokeTool("run_simulation", { shoppers: n }, { agent: "admin-ui" });
  revalidatePath("/admin");
}

export async function runOptimizerAction(formData: FormData) {
  const mode = (String(formData.get("mode") ?? "auto") as OptimizerMode);
  await runOptimizer({ mode });
  revalidatePath("/admin");
}

export async function endExperimentAction(formData: FormData) {
  const id = String(formData.get("id"));
  const winner = String(formData.get("winner_arm") ?? "");
  invokeTool("end_experiment", { id, winner_arm: winner || undefined, apply_winner: winner !== "", outcome: winner ? `Ended by the owner; ${winner} applied.` : "Ended by the owner without a winner." }, { agent: "admin-ui" });
  revalidatePath("/admin");
  redirect("/admin");
}

export async function resetAction() {
  invokeTool("reset_store_data", { confirm: true }, { agent: "admin-ui" });
  revalidatePath("/", "layout");
}
