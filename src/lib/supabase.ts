import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseEnv = {
  url: string;
  anonKey: string;
  enabled: boolean;
};

function readEnv(): SupabaseEnv {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const enabled = /^https?:\/\//i.test(url) && anonKey.length >= 20;
  return { url, anonKey, enabled };
}

let client: SupabaseClient | null = null;
let clientKey = "";

/** Anon-key client only. Returns null until both public env vars are set. */
export function getSupabase(): SupabaseClient | null {
  const env = readEnv();
  if (!env.enabled) return null;
  const key = `${env.url}::${env.anonKey}`;
  if (!client || clientKey !== key) {
    client = createClient(env.url, env.anonKey, {
      auth: {
        // v35: only the owner keeps a Supabase session (set after Google sign-in); it refreshes itself.
        // Customer accounts live in the store, and every temporary customer session is closed at once.
        persistSession: typeof window !== "undefined",
        autoRefreshToken: typeof window !== "undefined",
        detectSessionInUrl: false,
        storageKey: "zovacharge-owner-auth",
      },
    });
    clientKey = key;
  }
  return client;
}

export function supabaseEnv(): SupabaseEnv {
  return readEnv();
}
