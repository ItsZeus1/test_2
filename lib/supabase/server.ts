import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Thrown deliberately, with a specific message, instead of letting
    // supabase-js fail later on `new URL(undefined)` — that failure mode
    // shows up as an opaque "Digest: ..." error page with no clue which
    // variable is missing. Check Vercel → Project → Settings →
    // Environment Variables, then redeploy (adding a var does not
    // retroactively apply to an existing deployment).
    throw new Error(
      `Missing required environment variable: ${name}. Set it in Vercel → Settings → Environment Variables, then redeploy.`
    );
  }
  return value;
}

/**
 * Server-side client for use inside Server Components and Server
 * Actions. Reads/writes the session via cookies. Uses the anon key —
 * RLS enforces per-user access. For privileged operations (reading
 * `packages.api_secret_code`, writing `transactions`, admin balance
 * top-ups) use `createServiceRoleClient` instead, and only from
 * trusted server code, never anything reachable by a client-controlled
 * path without a role check first.
 */
export function createClient() {
  const cookieStore = cookies();
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component with no response to write to —
          // safe to ignore if middleware is refreshing sessions.
        }
      },
    },
  });
}

/**
 * Service-role client — bypasses RLS entirely. NEVER import this into
 * anything that runs in or is bundled for the browser. Only used
 * inside Server Actions after the caller's role has already been
 * verified against `profiles.role` using the regular server client.
 */
export function createServiceRoleClient() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
