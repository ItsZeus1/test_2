import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

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

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );
}

/**
 * Service-role client — bypasses RLS entirely. NEVER import this into
 * anything that runs in or is bundled for the browser. Only used
 * inside Server Actions after the caller's role has already been
 * verified against `profiles.role` using the regular server client.
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
