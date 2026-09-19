"use server";

import { headers } from "next/headers";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { purchaseSchema, type PurchaseInput } from "@/lib/validation";
import { getPriceForRole } from "@/lib/pricing";
import { getPrivatePackageById, mockPackagesPublic } from "@/lib/mock-data";

type ActionResult = { success: true } | { success: false; error: string };

export async function purchaseAction(input: PurchaseInput): Promise<ActionResult> {
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { packageId, targetAccountId } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "You must be logged in to purchase." };
  }

  // Re-read role and balance from the DB — never trust anything the
  // client claims about itself.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, balance")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return { success: false, error: "Account not found." };
  }

  // TODO(supabase): swap this mock lookup for a service-role read of the
  // real `packages` table — this is the ONLY place `api_endpoint` and
  // `api_secret_code` are ever loaded, and they never leave this function.
  const pkg = getPrivatePackageById(packageId);
  if (!pkg) {
    return { success: false, error: "Package not found." };
  }

  const publicPkg = mockPackagesPublic.find((p) => p.id === packageId)!;
  const realPrice = getPriceForRole(publicPkg, profile.role);

  if (profile.balance < realPrice) {
    return { success: false, error: "Insufficient balance." };
  }

  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // In production this whole block runs against the service-role client
  // inside a single DB transaction (deduct balance + insert transaction
  // row) so a failed external call can't leave balance deducted with no
  // record, and so a client can never race the deduction.
  const serviceClient = createServiceRoleClient();

  try {
    // 1. Deduct balance atomically (e.g. via a Postgres function/RPC that
    //    checks balance >= amount inside the same transaction).
    const { error: deductError } = await serviceClient.rpc("deduct_balance", {
      p_user_id: user.id,
      p_amount: realPrice,
    });
    if (deductError) {
      return { success: false, error: "Could not process payment. Try again." };
    }

    // 2. Call the external provider. Secret code and endpoint never
    //    leave this server function.
    const providerResponse = await fetch(pkg.api_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pkg.api_secret_code}`,
      },
      body: JSON.stringify({ targetAccountId, sizeName: pkg.size_name }),
    }).catch(() => null);

    const status = providerResponse?.ok ? "SUCCESS" : "FAILED";

    // 3. Record the transaction regardless of outcome, for the admin feed
    //    and for refund/support workflows.
    await serviceClient.from("transactions").insert({
      user_id: user.id,
      package_id: packageId,
      target_account_id: targetAccountId,
      amount_deducted: realPrice,
      status,
      ip_address: ip,
    });

    if (status === "FAILED") {
      // Refund on provider failure — again, atomic on the real backend.
      await serviceClient.rpc("refund_balance", { p_user_id: user.id, p_amount: realPrice });
      return { success: false, error: "Delivery failed — your balance has been refunded." };
    }

    return { success: true };
  } catch {
    return { success: false, error: "Unexpected error. Please contact support." };
  }
}
