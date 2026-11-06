import { NextResponse } from "next/server";

import { adminClient, adminFromToken, loadServerState } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Piece = { email?: unknown; password?: unknown; extraInfo?: unknown };

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Admin vault manager: stats, list, add (single or bulk), delete. Admin session required. */
export async function POST(request: Request) {
  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." }, { status: 503 });
  let body: { token?: unknown; action?: unknown; serviceId?: unknown; items?: unknown; id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const state = await loadServerState();
  const admin = state ? await adminFromToken(state, body.token) : null;
  if (!admin) return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  const serviceId = clean(body.serviceId, 120);
  const missing = (message: string) =>
    NextResponse.json({ ok: false, error: `Run migrations/0004_vault.sql in Supabase (${message}).`, needsSql: true }, { status: 500 });

  if (body.action === "list") {
    if (!serviceId) return NextResponse.json({ ok: false, error: "Pick a service." }, { status: 400 });
    const { data, error } = await supabase
      .from("vault_items")
      .select("id,email,password,extra_info,status,sold_to_user_id,sold_at,receipt_number,created_at")
      .eq("service_id", serviceId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return missing(error.message);
    const rows = data ?? [];
    const users = new Map(state!.users.map((user) => [user.id, user]));
    return NextResponse.json({
      ok: true,
      available: rows.filter((row) => row.status === "AVAILABLE").length,
      sold: rows.filter((row) => row.status === "SOLD").length,
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        password: row.password,
        extraInfo: row.extra_info,
        status: row.status,
        soldAt: row.sold_at,
        receiptNumber: row.receipt_number,
        buyer: row.sold_to_user_id ? (users.get(row.sold_to_user_id)?.email ?? row.sold_to_user_id) : null,
        createdAt: row.created_at,
      })),
    });
  }

  if (body.action === "add") {
    if (!serviceId || !state!.services.some((service) => service.id === serviceId)) return NextResponse.json({ ok: false, error: "Pick a service." }, { status: 400 });
    const list = Array.isArray(body.items) ? (body.items as Piece[]).slice(0, 1000) : [];
    const rows = list
      .map((piece) => ({ service_id: serviceId, email: clean(piece.email, 200), password: clean(piece.password, 200), extra_info: clean(piece.extraInfo, 500) }))
      .filter((row) => row.email && row.password);
    if (!rows.length) return NextResponse.json({ ok: false, error: "Each piece needs an email/account and a password." }, { status: 400 });
    const { error } = await supabase.from("vault_items").insert(rows);
    if (error) return missing(error.message);
    return NextResponse.json({ ok: true, added: rows.length });
  }

  if (body.action === "delete") {
    const id = clean(body.id, 64);
    const { error } = await supabase.from("vault_items").delete().eq("id", id);
    if (error) return missing(error.message);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
