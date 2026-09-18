"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/types";

interface PurchaseResult {
  orderId: string;
  code: string;
  productName: string;
}

/**
 * Executes a "purchase" of a digital top-up product.
 *
 * Flow:
 *  1. Verify the user is logged in.
 *  2. Look up the product (price, active status).
 *  3. Insert a PENDING order.
 *  4. Call the `claim_secret_code` RPC — this atomically grabs one unused
 *     code (FOR UPDATE SKIP LOCKED) and marks it used, avoiding race
 *     conditions if two users buy the last code simultaneously.
 *  5. If a code was claimed, flip the order to COMPLETED and return the code.
 *     If claiming fails (out of stock), flip the order to FAILED and report it.
 *
 * NOTE: This is a mock/demo payment flow — there's no real payment gateway
 * wired in. In production, step 3-4 would run only after a payment
 * provider webhook confirms funds were captured.
 */
export async function purchaseProductAction(
  productId: string
): Promise<ActionResult<PurchaseResult>> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "You must be logged in to purchase." };
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, price, is_active")
    .eq("id", productId)
    .single();

  if (productError || !product || !product.is_active) {
    return { success: false, error: "This product is not available." };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      product_id: product.id,
      amount: product.price,
      status: "PENDING",
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { success: false, error: "Could not create your order. Please try again." };
  }

  const { data: claimedCode, error: claimError } = await supabase.rpc(
    "claim_secret_code",
    { p_product_id: product.id, p_order_id: order.id }
  );

  if (claimError || !claimedCode || claimedCode.length === 0) {
    await supabase.from("orders").update({ status: "FAILED" }).eq("id", order.id);
    return {
      success: false,
      error: "Sorry, this item is currently out of stock. Your order was not charged.",
    };
  }

  await supabase.from("orders").update({ status: "COMPLETED" }).eq("id", order.id);

  revalidatePath("/dashboard");

  return {
    success: true,
    data: {
      orderId: order.id,
      code: claimedCode[0].code_string,
      productName: product.name,
    },
  };
}
