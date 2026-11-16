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
        // v28: never take the browser-wide navigator.locks lock. supabase-js takes it before EVERY
        // request (to read the auth token); a frozen background tab or an overlapping signOut could
        // hold it forever and freeze sign-in, top-ups and loading. ZovaCharge keeps no Supabase
        // session, so a pass-through lock is safe.
        lock: <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
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
