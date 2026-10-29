import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type SupabaseEnv = {
  url: string;
  anonKey: string;
  enabled: boolean;
};

function readEnv(): SupabaseEnv {
  const env = import.meta.env as {
    VITE_SUPABASE_URL?: string;
    VITE_SUPABASE_ANON_KEY?: string;
  };
  const url = env.VITE_SUPABASE_URL?.trim() ?? "";
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
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
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    clientKey = key;
  }
  return client;
}

export function supabaseEnv(): SupabaseEnv {
  return readEnv();
}
