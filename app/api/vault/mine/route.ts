import { NextResponse } from "next/server";

import { adminClient, loadServerState, userFromToken } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in buyer's own vault pieces (for /orders). */
export async function POST(request: Request) {
  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ ok: true, items: [] });
  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const state = await loadServerState();
  const user = state ? await userFromToken(state, body.token) : null;
  if (!user) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const { data } = await supabase
    .from("vault_items")
    .select("order_id,email,password,extra_info,receipt_number,sold_at")
    .eq("sold_to_user_id", user.id)
    .order("sold_at", { ascending: false })
    .limit(200);
  const items = (data ?? []).map((row) => ({
    orderId: row.order_id as string,
    email: row.email as string,
    password: row.password as string,
    extraInfo: row.extra_info as string,
    receiptNumber: row.receipt_number as string,
    soldAt: row.sold_at as string,
  }));
  return NextResponse.json({ ok: true, items });
}
