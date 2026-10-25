"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

type Result = { success: true } | { success: false; error: string };

const NO_KEY = "SUPABASE_SERVICE_ROLE_KEY is not set on the server, so this change can't be saved.";

const balanceSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().finite(),
  mode: z.enum(["add", "set"]),
});

export async function updateBalanceAction(input: z.infer<typeof balanceSchema>): Promise<Result> {
  if (!(await requireAdmin())) return { success: false, error: "Not authorized." };
  if (!hasServiceRoleKey()) return { success: false, error: NO_KEY };

  const parsed = balanceSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input." };
  const { userId, amount, mode } = parsed.data;
  const db = createServiceRoleClient();

  if (mode === "add") {
    if (amount <= 0) return { success: false, error: "Amount to add must be greater than 0." };
    const { error } = await db.rpc("increment_balance", { p_user_id: userId, p_amount: amount });
    if (error) return { success: false, error: "Could not add funds." };
  } else {
    if (amount < 0) return { success: false, error: "Balance can't be negative." };
    const { error } = await db.from("profiles").update({ balance: amount }).eq("id", userId);
    if (error) return { success: false, error: "Could not set balance." };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function setRoleAction(input: {
  userId: string;
  role: "NORMAL" | "VIP" | "ADMIN";
}): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: "Not authorized." };
  if (!hasServiceRoleKey()) return { success: false, error: NO_KEY };

  if (!["NORMAL", "VIP", "ADMIN"].includes(input.role)) return { success: false, error: "Invalid role." };
  if (input.userId === admin.id && input.role !== "ADMIN") {
    return { success: false, error: "You can't demote your own admin account." };
  }

  const db = createServiceRoleClient();
  const { error } = await db.from("profiles").update({ role: input.role }).eq("id", input.userId);
  if (error) return { success: false, error: "Could not change the role." };

  revalidatePath("/admin/users");
  return { success: true };
}

export async function resolveRequestAction(input: {
  requestId: string;
  approve: boolean;
}): Promise<Result> {
  if (!(await requireAdmin())) return { success: false, error: "Not authorized." };
  if (!hasServiceRoleKey()) return { success: false, error: NO_KEY };

  const db = createServiceRoleClient();

  // Conditional update: only the first resolver of a PENDING request wins,
  // so double-clicks can never credit a wallet twice.
  const { data, error } = await db
    .from("balance_requests")
    .update({ status: input.approve ? "APPROVED" : "REJECTED" })
    .eq("id", input.requestId)
    .eq("status", "PENDING")
    .select("user_id, amount")
    .maybeSingle();
  if (error) return { success: false, error: "Could not update the request." };
  if (!data) return { success: false, error: "This request was already handled." };

  if (input.approve) {
    const req = data as { user_id: string; amount: number };
    const { error: creditError } = await db.rpc("increment_balance", {
      p_user_id: req.user_id,
      p_amount: Number(req.amount),
    });
    if (creditError) {
      // put it back so it can be retried
      await db.from("balance_requests").update({ status: "PENDING" }).eq("id", input.requestId);
      return { success: false, error: "Could not credit the wallet. The request is still pending." };
    }
  }

  revalidatePath("/admin/users");
  return { success: true };
}
