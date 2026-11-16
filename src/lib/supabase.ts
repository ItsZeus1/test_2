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

/**
 * v26: every Supabase request gets a hard timeout. After a phone sleeps, a dead mobile socket can
 * leave a fetch pending forever — that used to stall the store queue and freeze the page.
 * Small requests (auth, version probes) give up after 4 s; the full store download / save, which
 * can be large on slow connections, after 15 s.
 */
const QUICK_MS = 4_000;
const HEAVY_MS = 15_000;

function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
  const quick = url.includes("/auth/v1/") || (method === "GET" && /select=(version|state_version)(&|$)/.test(url)) || method === "HEAD";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), quick ? QUICK_MS : HEAVY_MS);
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener("abort", () => controller.abort(outer.reason), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
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
      global: { fetch: timedFetch },
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
