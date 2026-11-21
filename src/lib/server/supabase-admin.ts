/**
 * SERVER ONLY. Uses the Supabase service-role key, which bypasses RLS.
 * Never import this file from a "use client" component.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { CLOUD_ROW_ID, CLOUD_TABLE, STORAGE_BUCKET, STORAGE_OBJECT, normalizeState, type NovaState } from "@/lib/store/data";

let client: SupabaseClient | null = null;

export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  client = client ?? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** Reads the shared store the same way the app does: state table first, Storage fallback second. */
export async function loadServerState(): Promise<NovaState | null> {
  const supabase = adminClient();
  if (!supabase) return null;
  const { data } = await supabase.from(CLOUD_TABLE).select("version,payload").eq("id", CLOUD_ROW_ID).maybeSingle();
  if (data) {
    const row = data as { payload?: unknown; version?: number };
    const parsed = normalizeState(row.payload);
    if (parsed) {
      if (typeof row.version === "number") parsed.version = row.version;
      return parsed;
    }
  }
  const downloaded = await supabase.storage.from(STORAGE_BUCKET).download(STORAGE_OBJECT);
  if (!downloaded.error && downloaded.data) {
    try {
      return normalizeState(JSON.parse(await downloaded.data.text()));
    } catch {
      return null;
    }
  }
  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Resolves a browser session token to its (unblocked) user, or null. */
export async function userFromToken(state: NovaState, token: unknown) {
  if (typeof token !== "string" || token.length < 16 || token.length > 200) return null;
  const hash = await sha256Hex(token);
  const session = state.sessions.find((item) => item.tokenHash === hash && Date.parse(item.expiresAt) > Date.now());
  if (!session) return null;
  const user = state.users.find((item) => item.id === session.userId);
  return user && !user.isBlocked ? user : null;
}

export function adminIds(state: NovaState): string[] {
  return state.users.filter((user) => user.role === "ADMIN").map((user) => user.id);
}

/** Resolves a browser session token to an ADMIN user, or null. */
export async function adminFromToken(state: NovaState, token: unknown) {
  const user = await userFromToken(state, token);
  return user && user.role === "ADMIN" ? user : null;
}

/** Reads the state, retrying briefly while a just-made save is still uploading. */
export async function loadServerStateWhere(ready: (state: NovaState) => boolean, attempts = 4): Promise<NovaState | null> {
  let state: NovaState | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    state = await loadServerState();
    if (state && ready(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return state;
}

/* ------------------------------ v30: vault pieces (codes & accounts per package) ------------------------------ */

/** Columns after SQL part 8 (package-specific codes & accounts). */
export const VAULT_COLUMNS = "id,service_id,package_id,vault_type,redeem_code,pin_serial,email,password,extra_info,status,sold_to_user_id,sold_at,order_id,receipt_number,created_at";
/** Columns before part 8 — used as a fallback so the vault keeps working until it is run. */
export const VAULT_LEGACY_COLUMNS = "id,service_id,email,password,extra_info,status,sold_to_user_id,sold_at,order_id,receipt_number,created_at";

/** True when a query failed only because part 8 (new columns / function) is not installed yet. */
export function vaultNeedsUpgrade(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  return /42703|42883|PGRST202|PGRST204|column|claim_vault_item_v2|schema cache/i.test(text);
}

export type VaultPieceOut = {
  orderId: string;
  vaultType: "REDEEM_CODE" | "ACCOUNT";
  redeemCode: string;
  pinOrSerial: string;
  email: string;
  password: string;
  extraInfo: string;
  packageId: string;
  receiptNumber: string;
  soldAt: string;
};

/** Database row → what the buyer's screen shows. */
export function vaultPiece(row: Record<string, unknown>): VaultPieceOut {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    orderId: text(row.order_id),
    vaultType: row.vault_type === "REDEEM_CODE" ? "REDEEM_CODE" : "ACCOUNT",
    redeemCode: text(row.redeem_code),
    pinOrSerial: text(row.pin_serial),
    email: text(row.email),
    password: text(row.password),
    extraInfo: text(row.extra_info),
    packageId: text(row.package_id),
    receiptNumber: text(row.receipt_number),
    soldAt: text(row.sold_at),
  };
}

/* ------------------------------ v35: owner check from a Supabase access token ------------------------------ */

const OWNER_EMAIL = "majd@elmadani.com";

/** Claims of a JWT whose signature Supabase has just checked (getUser). */
function jwtClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1] ?? "";
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * `Authorization: Bearer <access_token>` → the owner's store account, or null.
 * Same rule as SQL part 9: Supabase must accept the token, the email must be the owner's, the
 * session must come from Google sign-in, and the store account with that email must be ADMIN.
 */
export async function ownerFromBearer(request: Request, state?: NovaState | null) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token || token.length > 8192) return null;
  const supabase = adminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  const email = data.user?.email?.toLowerCase() ?? "";
  if (error || email !== OWNER_EMAIL) return null;
  const claims = jwtClaims(token);
  const appMeta = (claims?.app_metadata ?? {}) as { provider?: unknown };
  const amr = Array.isArray(claims?.amr) ? (claims?.amr as Array<{ method?: unknown }>) : [];
  const google = appMeta.provider === "google" || amr.some((entry) => entry?.method === "oauth");
  if (!google || String(claims?.email ?? "").toLowerCase() !== OWNER_EMAIL) return null;
  const store = state ?? (await loadServerState());
  const user = store?.users.find((item) => item.email.toLowerCase() === OWNER_EMAIL && item.role === "ADMIN");
  return user ?? null;
}

let guardCache: { at: number; installed: boolean } | null = null;

/** Whether SQL part 9 (money guard) is installed — cached for a minute. */
export async function guardInstalled(): Promise<boolean> {
  if (guardCache && Date.now() - guardCache.at < 60_000) return guardCache.installed;
  const supabase = adminClient();
  if (!supabase) return false;
  const { error } = await supabase.rpc("nova_guard_status");
  guardCache = { at: Date.now(), installed: !error };
  return guardCache.installed;
}
