"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase/server";
import { getClientIp, getCurrentUser } from "@/lib/auth";
import { purchaseSchema, type PurchaseInput } from "@/lib/validation";
import { isPlaceholderEndpoint, priceForRole } from "@/lib/utils";

type PurchaseResult =
  | { success: true; orderId: string; status: "COMPLETED"; amount: number; serviceName: string; sizeName: string }
  | { success: false; error: string };

interface PackageWithService {
  id: string;
  size_name: string;
  normal_price: number;
  vip_price: number;
  api_endpoint: string;
  api_secret_code: string;
  service_id: string;
  services: { id: string; name: string; is_active: boolean } | { id: string; name: string; is_active: boolean }[] | null;
}

export async function purchaseAction(input: PurchaseInput): Promise<PurchaseResult> {
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { packageId, targetAccountId, zoneId } = parsed.data;

  const session = await getCurrentUser();
  if (!session) return { success: false, error: "Please log in to purchase." };
  if (!hasServiceRoleKey()) {
    return { success: false, error: "Checkout isn't configured yet (missing server key). Contact support." };
  }

  const { profile } = session;
  const db = createServiceRoleClient();

  // Everything below runs on the server. The package's endpoint and secret
  // are read here and never returned to the browser.
  const { data } = await db
    .from("packages")
    .select("id, size_name, normal_price, vip_price, api_endpoint, api_secret_code, service_id, services(id, name, is_active)")
    .eq("id", packageId)
    .maybeSingle();
  const pkg = data as PackageWithService | null;
  if (!pkg) return { success: false, error: "That package no longer exists." };

  const service = Array.isArray(pkg.services) ? pkg.services[0] : pkg.services;
  if (!service || !service.is_active) return { success: false, error: "This service is unavailable." };

  // Re-derive the price from the DB + the user's role. Never trust the client.
  const price = priceForRole(profile.role, pkg.normal_price, pkg.vip_price);
  if (profile.balance < price) {
    return { success: false, error: "Insufficient balance. Add funds to your wallet first." };
  }

  const ip = getClientIp();

  // Atomic deduction (fails if the balance dropped in the meantime).
  const { error: deductError } = await db.rpc("deduct_balance", {
    p_user_id: profile.id,
    p_amount: price,
  });
  if (deductError) {
    const msg = deductError.message.includes("Insufficient")
      ? "Insufficient balance. Add funds to your wallet first."
      : "Could not process payment. Please try again.";
    return { success: false, error: msg };
  }

  // Call the external provider (or simulate when the URL is a placeholder).
  let ok = false;
  let apiResponse: Record<string, unknown> = {};
  try {
    const endpointUrl = new URL(pkg.api_endpoint);
    if (endpointUrl.protocol !== "https:" && endpointUrl.protocol !== "http:") {
      throw new Error("Unsupported protocol");
    }

    if (isPlaceholderEndpoint(pkg.api_endpoint)) {
      ok = true;
      apiResponse = {
        simulated: true,
        note: "Placeholder endpoint — request logged, not sent.",
        target_account_id: targetAccountId,
        zone_id: zoneId ?? null,
        package: pkg.size_name,
      };
      console.log("[purchase] simulated provider call", { endpoint: pkg.api_endpoint, targetAccountId, zoneId });
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch(pkg.api_endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${pkg.api_secret_code}`,
          },
          body: JSON.stringify({
            account_id: targetAccountId,
            zone_id: zoneId ?? null,
            code: pkg.api_secret_code,
            package: pkg.size_name,
          }),
          signal: controller.signal,
          cache: "no-store",
        });
        ok = res.ok;
        const text = await res.text();
        apiResponse = { http_status: res.status, body: text.slice(0, 1000) };
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (error) {
    ok = false;
    apiResponse = { error: error instanceof Error ? error.message : "Provider request failed" };
  }

  const status = ok ? "COMPLETED" : "FAILED";

  const { data: txn, error: txnError } = await db
    .from("transactions")
    .insert({
      user_id: profile.id,
      service_id: service.id,
      package_id: pkg.id,
      service_name: service.name,
      size_name: pkg.size_name,
      target_account_id: zoneId ? `${targetAccountId} (${zoneId})` : targetAccountId,
      amount_paid: price,
      user_ip: ip,
      status,
      api_response: apiResponse,
    })
    .select("id")
    .single();
  if (txnError) console.error("[purchase] failed to record transaction:", txnError.message);

  if (!ok) {
    await db.rpc("refund_balance", { p_user_id: profile.id, p_amount: price });
    return { success: false, error: "Delivery failed — your balance has been refunded." };
  }

  revalidatePath("/orders");
  revalidatePath("/admin");
  return {
    success: true,
    orderId: (txn as { id: string } | null)?.id ?? "unknown",
    status: "COMPLETED",
    amount: price,
    serviceName: service.name,
    sizeName: pkg.size_name,
  };
}
