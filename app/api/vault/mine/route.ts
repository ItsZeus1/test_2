import { NextResponse } from "next/server";

import { VAULT_COLUMNS, VAULT_LEGACY_COLUMNS, adminClient, loadServerState, userFromToken, vaultNeedsUpgrade, vaultPiece } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in buyer's own vault pieces (codes & accounts) for My Orders. */
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
  const query = (columns: string) =>
    supabase.from("vault_items").select(columns).eq("sold_to_user_id", user.id).order("sold_at", { ascending: false }).limit(200);
  let result = await query(VAULT_COLUMNS);
  if (result.error && vaultNeedsUpgrade(result.error)) result = await query(VAULT_LEGACY_COLUMNS);
  const rows = (result.data ?? []) as unknown as Array<Record<string, unknown>>;
  return NextResponse.json({ ok: true, items: rows.map(vaultPiece) }, { headers: { "Cache-Control": "no-store" } });
}
