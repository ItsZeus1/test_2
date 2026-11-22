import { NextResponse } from "next/server";

import { VAULT_COLUMNS, VAULT_LEGACY_COLUMNS, adminClient, loadServerState, ownerFromRequest, vaultNeedsUpgrade } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" };

/**
 * v35/v36 · Admin-only JSON backup. Requires the owner: `Authorization: Bearer <Supabase access token>`
 * of the confirmed owner account, or (after SQL part 10) the owner's server-made store session in
 * `x-zova-token`. Both are checked on the server, together with the ADMIN role in the store.
 * Everyone else gets 401 / 403. Password hashes, sessions, provider API secrets and tokens are
 * never included.
 */
export async function GET(request: Request) {
  if (!/^Bearer\s+\S+$/i.test(request.headers.get("authorization") ?? "") && !request.headers.get("x-zova-token")) {
    return NextResponse.json({ ok: false, error: "Sign-in required." }, { status: 401, headers: NO_STORE });
  }
  const supabase = adminClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." }, { status: 503, headers: NO_STORE });
  const state = await loadServerState();
  if (!state) return NextResponse.json({ ok: false, error: "Store unavailable." }, { status: 503, headers: NO_STORE });
  const owner = await ownerFromRequest(request, state, null);
  if (!owner) {
    return NextResponse.json(
      { ok: false, error: "🔐 للمالك فقط: سجّل الدخول كمدير مجدداً · Owner only: sign in again as the admin." },
      { status: 403, headers: NO_STORE },
    );
  }

  // Vault stock (codes / accounts) — operational data the owner needs to restore the shop.
  // `columns: string` keeps one result type for both column lists (before / after SQL part 8).
  const readVault = (columns: string) => supabase.from("vault_items").select(columns).order("created_at", { ascending: true }).limit(20_000);
  let vault = await readVault(VAULT_COLUMNS);
  if (vault.error && vaultNeedsUpgrade(vault.error)) vault = await readVault(VAULT_LEGACY_COLUMNS);

  const users = state.users.map((user) => {
    // Explicit allow-list: no passwordHash / passwordSalt / sessions / tokens.
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role,
      currency: user.currency ?? "USD",
      balanceCents: user.balanceCents,
      isBlocked: user.isBlocked,
      isLocked: user.isLocked === true,
      authProvider: user.authProvider ?? "password",
      emailVerified: user.emailVerified === true || user.authProvider === "google",
      vipProfitMargin: user.vipProfitMargin ?? 0,
      lastCountry: user.lastCountry ?? null,
      lastSeenAt: user.lastSeenAt,
      createdAt: user.createdAt,
    };
  });
  // Provider API endpoints / secret codes are never part of a backup.
  const packages = state.packages.map((pack) => {
    const { apiEndpoint: _endpoint, apiSecretCode: _secret, ...rest } = pack;
    void _endpoint;
    void _secret;
    return rest;
  });

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const backup = {
    app: "ZovaCharge",
    format: "zovacharge-backup",
    version: 35,
    exportedAt: now.toISOString(),
    storeVersion: state.version,
    counts: {
      services: state.services.length,
      packages: packages.length,
      vault: (vault.data ?? []).length,
      orders: state.orders.length,
      topups: state.balanceRequests.length,
      ledger: state.transactions.length,
      users: users.length,
    },
    settings: {
      sypRate: state.sypRate ?? null,
      paymentAddresses: { SHAMCASH: state.shamcashAddress, SYRIATEL_CASH: state.syriatelCashAddress ?? "", MTN_CASH: state.mtnCashAddress ?? "" },
      serviceGroups: state.serviceGroups ?? [],
      offersTickerText: state.offersTickerText ?? "",
      offersTickerTextAr: state.offersTickerTextAr ?? "",
    },
    services: state.services,
    packages,
    vault: vault.error ? { error: vault.error.message } : vault.data,
    orders: state.orders,
    topups: state.balanceRequests,
    ledger: state.transactions,
    users,
  };
  return new NextResponse(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="zovacharge-backup-${day}.json"`,
    },
  });
}
