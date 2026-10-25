"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { walletRequestSchema, type WalletRequestInput } from "@/lib/validation";

type Result = { success: true } | { success: false; error: string };

/** Submit a wallet top-up request for admin approval. */
export async function requestBalanceAction(input: WalletRequestInput): Promise<Result> {
  const parsed = walletRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  const session = await getCurrentUser();
  if (!session) return { success: false, error: "Please log in first." };
  if (!hasServiceRoleKey()) {
    return { success: false, error: "Server is not configured to accept requests yet." };
  }

  const db = createServiceRoleClient();
  const { error } = await db.from("balance_requests").insert({
    user_id: session.profile.id,
    amount: parsed.data.amount,
    payment_method: parsed.data.paymentMethod,
    reference_note: parsed.data.referenceNote || null,
  });
  if (error) return { success: false, error: "Could not submit your request. Try again." };

  revalidatePath("/admin/users");
  return { success: true };
}

/** Toggle a favorite (uses the user's own session; RLS enforces ownership). */
export async function toggleFavoriteAction(
  serviceId: string
): Promise<{ success: true; favorite: boolean } | { success: false; error: string }> {
  const session = await getCurrentUser();
  if (!session) return { success: false, error: "Please log in first." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("favorites")
    .select("service_id")
    .eq("user_id", session.profile.id)
    .eq("service_id", serviceId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", session.profile.id)
      .eq("service_id", serviceId);
    if (error) return { success: false, error: "Could not update favorites." };
    return { success: true, favorite: false };
  }

  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: session.profile.id, service_id: serviceId });
  if (error) return { success: false, error: "Could not update favorites." };
  return { success: true, favorite: true };
}
