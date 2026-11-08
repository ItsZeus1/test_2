import { NextResponse } from "next/server";

import { adminClient, loadServerStateWhere, userFromToken } from "@/lib/server/supabase-admin";

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
  const { data, error } = await supabase.rpc("claim_vault_item", {
    p_service_id: order.serviceId,
    p_order_id: order.id,
    p_user_id: user.id,
    p_receipt: order.receiptNumber ?? "",
  });
  if (error) return NextResponse.json({ ok: false, error: `Run migrations/novacharge.sql (part 3) in Supabase (${error.message}).` }, { status: 500 });
  const item = Array.isArray(data) ? data[0] : null;
  if (!item) return NextResponse.json({ ok: false, error: "OUT_OF_STOCK" }, { status: 409 });
  return NextResponse.json({
    ok: true,
    item: { email: item.email, password: item.password, extraInfo: item.extra_info, receiptNumber: item.receipt_number, soldAt: item.sold_at },
  });
}
