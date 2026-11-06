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

/** Resolves a browser session token to an ADMIN user, or null. */
export async function adminFromToken(state: NovaState, token: unknown) {
  if (typeof token !== "string" || token.length < 16 || token.length > 200) return null;
  const hash = await sha256Hex(token);
  const session = state.sessions.find((item) => item.tokenHash === hash && Date.parse(item.expiresAt) > Date.now());
  if (!session) return null;
  const user = state.users.find((item) => item.id === session.userId);
  return user && user.role === "ADMIN" && !user.isBlocked ? user : null;
}
