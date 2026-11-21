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

/**
 * `Authorization: Bearer <access_token>` → the owner's store account, or null.
 * Same rule as SQL part 9: Supabase must accept the token, it must belong to the confirmed
 * Supabase Auth account with the owner's email, and the store account with that email must be ADMIN.
 */
export async function ownerFromBearer(request: Request, state?: NovaState | null) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token || token.length > 8192) return null;
  const supabase = adminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  const email = data.user?.email?.toLowerCase() ?? "";
  if (error || email !== OWNER_EMAIL || !data.user?.email_confirmed_at) return null;
  const store = state ?? (await loadServerState());
  const user = store?.users.find((item) => item.email.toLowerCase() === OWNER_EMAIL && item.role === "ADMIN");
  return user ?? null;
}

let guardCache: { at: number; version: number } | null = null;

/** Installed SQL guard version: 0 = none, 35 = part 9, 36 = part 10 (cached for a minute). */
export async function guardVersion(): Promise<number> {
  if (guardCache && Date.now() - guardCache.at < 60_000) return guardCache.version;
  const supabase = adminClient();
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("nova_guard_status");
  const version = error ? 0 : Number((data as { version?: number } | null)?.version ?? 35) || 35;
  guardCache = { at: Date.now(), version };
  return version;
}

/** Whether SQL part 9 (money guard) is installed. */
export async function guardInstalled(): Promise<boolean> {
  return (await guardVersion()) >= 35;
}

/**
 * The owner, from either the Supabase owner session (Bearer) or — once SQL part 10 makes sessions
 * server-only (unforgeable) — the store's own admin session token.
 */
export async function ownerFromRequest(request: Request, state: NovaState | null, token: unknown) {
  if (!state) return null;
  const bearer = await ownerFromBearer(request, state);
  if (bearer) return bearer;
  if ((await guardVersion()) < 36) return null;
  const user = await userFromToken(state, token ?? request.headers.get("x-zova-token"));
  return user && user.role === "ADMIN" && user.email.toLowerCase() === OWNER_EMAIL ? user : null;
}

/* ------------------------------ v36: server-side store writes & sign-in helpers ------------------------------ */

export type ServerPatchOp =
  | { op: "upsert"; key: string; idKey: "id"; value: Record<string, unknown>; at?: "start" | "end" }
  | { op: "merge"; key: string; idKey: "id"; id: string; value: Record<string, unknown> }
  | { op: "delete"; key: string; idKey: "id"; id: string };

/** Change-only save with the service-role key (trusted by the SQL guard). */
export async function serverPatch(ops: ServerPatchOp[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = adminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." };
  if (!ops.length) return { ok: true };
  const { error } = await supabase.rpc("novacharge_patch", { ops });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export { sha256Hex };

/** Same PBKDF2-SHA256 (100 000 rounds) the shop has always used, so existing passwords keep working. */
export async function hashPasswordServer(password: string, saltHex?: string): Promise<{ passwordHash: string; passwordSalt: string }> {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: salt.buffer.slice(0) as ArrayBuffer, iterations: 100_000, hash: "SHA-256" }, key, 256);
  const hash = Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { passwordHash: hash, passwordSalt: saltHex ?? Array.from(salt, (byte) => byte.toString(16).padStart(2, "0")).join("") };
}

export function sameText(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

/** Real visitor IP + country from Vercel's edge headers. */
export function requestOrigin(request: Request): { ip: string; country: string } {
  const header = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "";
  return { ip: header.split(",")[0]?.trim().slice(0, 64) ?? "", country: (request.headers.get("x-vercel-ip-country") ?? "").slice(0, 4) };
}
