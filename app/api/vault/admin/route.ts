import { NextResponse } from "next/server";

import { VAULT_COLUMNS, VAULT_LEGACY_COLUMNS, adminClient, adminFromToken, loadServerState, vaultNeedsUpgrade } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Piece = { vaultType?: unknown; redeemCode?: unknown; pinOrSerial?: unknown; email?: unknown; password?: unknown; extraInfo?: unknown };

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * Admin vault manager: stock per package, list, add (single or bulk), delete. Admin session required.
 * v30: every piece belongs to a service AND a package size, and is a redeem code or an account.
 */
export async function POST(request: Request) {
  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." }, { status: 503 });
  let body: { token?: unknown; action?: unknown; serviceId?: unknown; packageId?: unknown; items?: unknown; id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const state = await loadServerState();
  const admin = state ? await adminFromToken(state, body.token) : null;
  if (!admin || !state) return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  const serviceId = clean(body.serviceId, 120);
  const packageId = clean(body.packageId, 120);
  const missing = (message: string) =>
    NextResponse.json({ ok: false, error: `Run migrations/novacharge.sql (parts 3 and 8) in Supabase (${message}).`, needsSql: true }, { status: 500 });
  const packages = state.packages
    .filter((pack) => pack.serviceId === serviceId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((pack) => ({ id: pack.id, sizeName: pack.sizeName }));

  if (body.action === "list") {
    if (!serviceId) return NextResponse.json({ ok: false, error: "Pick a service." }, { status: 400 });
    const query = (columns: string, byPackage: boolean) => {
      let request = supabase.from("vault_items").select(columns).eq("service_id", serviceId);
      if (byPackage && packageId) request = request.eq("package_id", packageId);
      return request.order("created_at", { ascending: false }).limit(500);
    };
    let upgraded = true;
    let result = await query(VAULT_COLUMNS, true);
    if (result.error && vaultNeedsUpgrade(result.error)) {
      upgraded = false;
      result = await query(VAULT_LEGACY_COLUMNS, false);
    }
    if (result.error) return missing(result.error.message);
    const rows = (result.data ?? []) as unknown as Array<Record<string, unknown>>;
    // Live stock badge per package size (plus pieces saved for "any size").
    const stock: Record<string, number> = {};
    let shared = 0;
    if (upgraded) {
      const counts = await supabase.from("vault_items").select("package_id").eq("service_id", serviceId).eq("status", "AVAILABLE").limit(5000);
      for (const row of (counts.data ?? []) as Array<{ package_id: string | null }>) {
        if (!row.package_id) shared += 1;
        else stock[row.package_id] = (stock[row.package_id] ?? 0) + 1;
      }
    } else {
      shared = rows.filter((row) => row.status === "AVAILABLE").length;
    }
    const users = new Map(state.users.map((user) => [user.id, user]));
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    return NextResponse.json({
      ok: true,
      upgraded,
      packages,
      stock,
      shared,
      available: rows.filter((row) => row.status === "AVAILABLE").length,
      sold: rows.filter((row) => row.status === "SOLD").length,
      items: rows.map((row) => ({
        id: text(row.id),
        packageId: text(row.package_id),
        vaultType: row.vault_type === "REDEEM_CODE" ? "REDEEM_CODE" : "ACCOUNT",
        redeemCode: text(row.redeem_code),
        pinOrSerial: text(row.pin_serial),
        email: text(row.email),
        password: text(row.password),
        extraInfo: text(row.extra_info),
        status: row.status === "SOLD" ? "SOLD" : "AVAILABLE",
        soldAt: text(row.sold_at),
        receiptNumber: text(row.receipt_number),
        buyer: typeof row.sold_to_user_id === "string" ? (users.get(row.sold_to_user_id)?.email ?? row.sold_to_user_id) : null,
        createdAt: text(row.created_at),
      })),
    });
  }

  if (body.action === "add") {
    if (!serviceId || !state.services.some((service) => service.id === serviceId)) return NextResponse.json({ ok: false, error: "Pick a service." }, { status: 400 });
    if (packageId && !packages.some((pack) => pack.id === packageId)) return NextResponse.json({ ok: false, error: "Pick a package size of this service." }, { status: 400 });
    const list = Array.isArray(body.items) ? (body.items as Piece[]).slice(0, 1000) : [];
    const rows = list
      .map((piece) => {
        const vaultType = piece.vaultType === "REDEEM_CODE" ? "REDEEM_CODE" : "ACCOUNT";
        return {
          service_id: serviceId,
          package_id: packageId,
          vault_type: vaultType,
          redeem_code: vaultType === "REDEEM_CODE" ? clean(piece.redeemCode, 300) : "",
          pin_serial: vaultType === "REDEEM_CODE" ? clean(piece.pinOrSerial, 200) : "",
          email: vaultType === "ACCOUNT" ? clean(piece.email, 200) : "",
          password: vaultType === "ACCOUNT" ? clean(piece.password, 200) : "",
          extra_info: clean(piece.extraInfo, 500),
        };
      })
      .filter((row) => (row.vault_type === "REDEEM_CODE" ? row.redeem_code : row.email && row.password));
    if (!rows.length) return NextResponse.json({ ok: false, error: "Each code needs a redeem code; each account needs an email and a password." }, { status: 400 });
    const { error } = await supabase.from("vault_items").insert(rows);
    if (error) return missing(error.message);
    return NextResponse.json({ ok: true, added: rows.length });
  }

  if (body.action === "delete") {
    const id = clean(body.id, 64);
    const { error } = await supabase.from("vault_items").delete().eq("id", id).eq("status", "AVAILABLE");
    if (error) return missing(error.message);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
