import { NextResponse } from "next/server";

import { adminClient, loadServerStateWhere, userFromToken, vaultNeedsUpgrade, vaultPiece } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Buyer calls this right after a VAULT purchase. The server checks the paid order exists,
 * belongs to this session and is waiting for its piece, then atomically claims one.
 */
export async function POST(request: Request) {
  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Vault is not configured on the server." }, { status: 503 });
  let body: { token?: unknown; orderId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  if (typeof body.orderId !== "string" || body.orderId.length > 120) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  const orderId = body.orderId;
  const state = await loadServerStateWhere((current) => current.orders.some((order) => order.id === orderId));
  if (!state) return NextResponse.json({ ok: false, error: "Store unavailable." }, { status: 503 });
  const user = await userFromToken(state, body.token);
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const order = state.orders.find((item) => item.id === orderId && item.userId === user.id);
  if (!order) return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  if (order.status !== "PENDING_VAULT" && order.status !== "delivered") {
    return NextResponse.json({ ok: false, error: "This order is not a vault order." }, { status: 409 });
  }
  // v30: hand out a piece for this exact package size first (then one saved for "any size").
  let claim = await supabase.rpc("claim_vault_item_v2", {
    p_service_id: order.serviceId,
    p_package_id: order.packageId ?? "",
    p_order_id: order.id,
    p_user_id: user.id,
    p_receipt: order.receiptNumber ?? "",
  });
  if (claim.error && vaultNeedsUpgrade(claim.error)) {
    // SQL part 8 not installed yet: the original whole-service claim.
    claim = await supabase.rpc("claim_vault_item", {
      p_service_id: order.serviceId,
      p_order_id: order.id,
      p_user_id: user.id,
      p_receipt: order.receiptNumber ?? "",
    });
  }
  if (claim.error) return NextResponse.json({ ok: false, error: `Run migrations/novacharge.sql (parts 3 and 8) in Supabase (${claim.error.message}).` }, { status: 500 });
  const row = Array.isArray(claim.data) ? (claim.data[0] as Record<string, unknown> | undefined) : undefined;
  if (!row) return NextResponse.json({ ok: false, error: "OUT_OF_STOCK" }, { status: 409 });
  return NextResponse.json({ ok: true, item: vaultPiece(row) });
}
