import { NextResponse } from "next/server";

import { adminClient, adminFromToken, loadServerState, userFromToken } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Secret = { packageId: string; apiEndpoint: string; apiSecretCode: string };

/** Only public https hosts can be called (no localhost / private networks). */
function callable(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".invalid") || host.endsWith(".internal")) return false;
    if (/^(127\.|10\.|192\.168\.|0\.|169\.254\.)/.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || host.includes(":")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Server-only package secrets.
 *  - get-secrets  (admin): read provider endpoints / codes for the service editor
 *  - save-secrets (admin): store them (empty values delete the row)
 *  - dispatch     (buyer): send the buyer's own fresh order to its provider, once
 */
export async function POST(request: Request) {
  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." }, { status: 503 });
  let body: { action?: unknown; token?: unknown; secrets?: unknown; orderId?: unknown; packageIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const state = await loadServerState();
  if (!state) return NextResponse.json({ ok: false, error: "Store not found." }, { status: 503 });

  if (body.action === "get-secrets" || body.action === "save-secrets") {
    const admin = await adminFromToken(state, body.token);
    if (!admin) return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });

    if (body.action === "get-secrets") {
      const ids = Array.isArray(body.packageIds) ? body.packageIds.filter((id): id is string => typeof id === "string").slice(0, 500) : [];
      const query = supabase.from("package_secrets").select("package_id,api_endpoint,api_secret_code");
      const { data, error } = ids.length ? await query.in("package_id", ids) : await query;
      if (error) return NextResponse.json({ ok: false, error: `Run migrations/novacharge.sql part 4 (${error.message}).` }, { status: 500 });
      const secrets = (data ?? []).map((row) => ({ packageId: row.package_id as string, apiEndpoint: row.api_endpoint as string, apiSecretCode: row.api_secret_code as string }));
      return NextResponse.json({ ok: true, secrets });
    }

    const list = (Array.isArray(body.secrets) ? body.secrets : []).filter(
      (item): item is Secret =>
        !!item && typeof (item as Secret).packageId === "string" && typeof (item as Secret).apiEndpoint === "string" && typeof (item as Secret).apiSecretCode === "string",
    );
    const keep = list.filter((item) => item.apiEndpoint.trim() || item.apiSecretCode.trim());
    const drop = list.filter((item) => !item.apiEndpoint.trim() && !item.apiSecretCode.trim()).map((item) => item.packageId);
    if (keep.length) {
      const { error } = await supabase.from("package_secrets").upsert(
        keep.map((item) => ({
          package_id: item.packageId.slice(0, 120),
          api_endpoint: item.apiEndpoint.trim().slice(0, 500),
          api_secret_code: item.apiSecretCode.trim().slice(0, 500),
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "package_id" },
      );
      if (error) return NextResponse.json({ ok: false, error: `Run migrations/novacharge.sql part 4 (${error.message}).` }, { status: 500 });
    }
    if (drop.length) await supabase.from("package_secrets").delete().in("package_id", drop);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "dispatch") {
    const user = await userFromToken(state, body.token);
    if (!user) return NextResponse.json({ ok: false, error: "Please sign in." }, { status: 403 });
    const order = state.orders.find((row) => row.id === body.orderId);
    // Only the buyer's own, fresh, still-processing order — and only once.
    if (!order || order.userId !== user.id || order.status !== "processing" || Date.now() - Date.parse(order.createdAt) > 10 * 60_000) {
      return NextResponse.json({ ok: true, status: "processing" });
    }
    const claim = await supabase.from("dispatched_orders").insert({ order_id: order.id, status: "sending" });
    if (claim.error) return NextResponse.json({ ok: true, status: "processing" });
    const { data: secret } = await supabase.from("package_secrets").select("api_endpoint,api_secret_code").eq("package_id", order.packageId).maybeSingle();
    let status: "delivered" | "processing" = "processing";
    const endpoint = (secret?.api_endpoint as string | undefined) ?? "";
    if (endpoint && callable(endpoint)) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ target_id: order.targetId, code: secret?.api_secret_code ?? "" }),
          signal: AbortSignal.timeout(5000),
        });
        status = response.ok ? "delivered" : "processing";
      } catch {
        status = "processing";
      }
    }
    await supabase.from("dispatched_orders").update({ status }).eq("order_id", order.id);
    return NextResponse.json({ ok: true, status });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
