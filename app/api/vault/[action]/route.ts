import { NextResponse } from "next/server";

import { claimTelegramEvent, sendTelegram, telegramConfigured, tgEscape } from "@/lib/server/push";
import {
  VAULT_COLUMNS,
  VAULT_LEGACY_COLUMNS,
  adminClient,
  adminFromToken,
  guardInstalled,
  loadServerState,
  loadServerStateWhere,
  ownerFromBearer,
  userFromToken,
  vaultNeedsUpgrade,
  vaultPiece,
} from "@/lib/server/supabase-admin";
import type { NovaState } from "@/lib/store/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * v35: the four vault routes live in one file (same URLs) to stay under GitHub's 100-file limit:
 *   GET  /api/vault/stock   · POST /api/vault/claim · POST /api/vault/mine · POST /api/vault/admin
 */
type Ctx = { params: Promise<{ action: string }> };

export async function GET(request: Request, { params }: Ctx) {
  const { action } = await params;
  if (action === "stock") return stockGet(request);
  return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
}

export async function POST(request: Request, { params }: Ctx) {
  const { action } = await params;
  if (action === "claim") return claimPost(request);
  if (action === "mine") return minePost(request);
  if (action === "admin") return adminPost(request);
  return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
}

/* ------------------------------ stock (public counts only) ------------------------------ */

/**
 * Public: how many pieces are available for a service (counts only, never the contents).
 * v30: also returns `byPackage` (stock per package size). Pieces saved without a package
 * (`shared`) can be sold for any size of that service, so each size shows its own + shared.
 */
async function stockGet(request: Request) {
  const serviceId = new URL(request.url).searchParams.get("serviceId") ?? "";
  const supabase = adminClient();
  const headers = { "Cache-Control": "no-store" };
  if (!supabase || !serviceId || serviceId.length > 120) return NextResponse.json({ available: null, byPackage: {}, shared: 0 }, { headers });
  const { data, error } = await supabase.from("vault_items").select("package_id").eq("service_id", serviceId).eq("status", "AVAILABLE").limit(5000);
  if (error) {
    if (!vaultNeedsUpgrade(error)) return NextResponse.json({ available: null, byPackage: {}, shared: 0 }, { headers });
    // Part 8 not installed yet: one count for the whole service, as before.
    const legacy = await supabase.from("vault_items").select("id", { count: "exact", head: true }).eq("service_id", serviceId).eq("status", "AVAILABLE");
    return NextResponse.json({ available: legacy.error ? null : (legacy.count ?? 0), byPackage: {}, shared: legacy.count ?? 0 }, { headers });
  }
  const byPackage: Record<string, number> = {};
  let shared = 0;
  for (const row of (data ?? []) as Array<{ package_id: string | null }>) {
    const id = row.package_id ?? "";
    if (!id) shared += 1;
    else byPackage[id] = (byPackage[id] ?? 0) + 1;
  }
  return NextResponse.json({ available: (data ?? []).length, byPackage, shared }, { headers });
}

/* ------------------------------ claim (buyer, right after a vault purchase) ------------------------------ */

/**
 * Buyer calls this right after a VAULT purchase. The server checks the paid order exists,
 * belongs to this session and is waiting for its piece, then atomically claims one.
 */
async function claimPost(request: Request) {
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
  await lowStockAlert(state, order);
  return NextResponse.json({ ok: true, item: vaultPiece(row) });
}

/** v35 · Telegram: a package dropped to 2 codes or fewer (once per sale). */
async function lowStockAlert(state: NovaState, order: NovaState["orders"][number]) {
  const supabase = adminClient();
  if (!supabase || !telegramConfigured()) return;
  try {
    const pack = order.packageId ?? "";
    let query = supabase.from("vault_items").select("id", { count: "exact", head: true }).eq("service_id", order.serviceId).eq("status", "AVAILABLE");
    if (pack && !pack.startsWith("points:")) query = query.in("package_id", [pack, ""]);
    let { count, error } = await query;
    if (error && vaultNeedsUpgrade(error)) {
      ({ count, error } = await supabase.from("vault_items").select("id", { count: "exact", head: true }).eq("service_id", order.serviceId).eq("status", "AVAILABLE"));
    }
    if (error || count === null || count > 2) return;
    if (!(await claimTelegramEvent(`tg:vault_low:${order.id}`))) return;
    const size = state.packages.find((item) => item.id === pack)?.sizeName ?? order.packageName;
    await sendTelegram(
      [
        "📦 <b>تنبيه مخزون منخفض · Vault low stock</b>",
        `${tgEscape(order.serviceName)} · ${tgEscape(size)}`,
        count === 0 ? "⛔️ نفدت الأكواد بالكامل · 0 left" : `⚠️ المتبقي: <b>${count}</b> فقط`,
        "أضف أكواداً من «خزنة الحسابات» · /admin#vault-manager",
      ].join("\n"),
    );
  } catch {
    /* alerts never break a delivery */
  }
}

/* ------------------------------ mine (buyer's own pieces) ------------------------------ */

/** The signed-in buyer's own vault pieces (codes & accounts) for My Orders. */
async function minePost(request: Request) {
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

/* ------------------------------ admin (vault manager) ------------------------------ */

type Piece = { vaultType?: unknown; redeemCode?: unknown; pinOrSerial?: unknown; email?: unknown; password?: unknown; extraInfo?: unknown };

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * Admin vault manager: stock per package, list, add (single or bulk), delete. Admin session required.
 * v30: every piece belongs to a service AND a package size, and is a redeem code or an account.
 */
async function adminPost(request: Request) {
  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." }, { status: 503 });
  let body: { token?: unknown; action?: unknown; serviceId?: unknown; packageId?: unknown; items?: unknown; id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const state = await loadServerState();
  // v35: once SQL part 9 is installed, the vault (it holds unsold codes) needs the owner's verified
  // Supabase session — a store session alone could be forged. Before part 9: the store session, as before.
  const owner = state ? await ownerFromBearer(request, state) : null;
  const admin = owner ?? (state && !(await guardInstalled()) ? await adminFromToken(state, body.token) : null);
  if (!admin || !state) {
    return NextResponse.json(
      { ok: false, error: "🔐 جلسة المالك الآمنة مطلوبة: فعّلها من الإدارة ← الإعدادات · Owner secure session required: turn it on in Admin → Settings." },
      { status: 403 },
    );
  }
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
