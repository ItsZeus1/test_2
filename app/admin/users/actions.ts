"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const topUpSchema = z.object({
  userId: z.string().min(1),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
});

type ActionResult = { success: true } | { success: false; error: string };

export async function topUpBalanceAction(
  input: z.infer<typeof topUpSchema>
): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authorized." };

  const { data: adminProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (adminProfile?.role !== "ADMIN") {
    return { success: false, error: "Not authorized." };
  }

  const parsed = topUpSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = createServiceRoleClient();

  // In production this increments atomically via an RPC
  // (e.g. `update profiles set balance = balance + $amount where id = $userId`)
  // rather than a read-then-write, to avoid race conditions with concurrent
  // purchases.
  const { error } = await db.rpc("increment_balance", {
    p_user_id: parsed.data.userId,
    p_amount: parsed.data.amount,
  });

  if (error) return { success: false, error: "Could not update balance." };

  revalidatePath("/admin/users");
  return { success: true };
}
