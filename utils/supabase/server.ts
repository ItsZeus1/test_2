import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Server Actions, and
 * Route Handlers. Must be created FRESH on every request (never module-level
 * singleton) because it's bound to the current request's cookies.
 *
 * Usage in a Server Component / Server Action:
 *   import { createClient } from "@/utils/supabase/server";
 *   const supabase = await createClient();
 *   const { data, error } = await supabase.from("games").select("*");
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
       setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options as CookieOptions);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions (see middleware.ts / utils/supabase/middleware.ts).
          }
        },
      },
    }
  );
}

/**
 * Admin client using the SERVICE ROLE key — bypasses RLS entirely.
 * ONLY ever import/use this inside trusted Server Actions (e.g. admin
 * inventory operations) that have ALREADY verified the caller is an
 * ADMIN via the normal server client. Never expose this to the client,
 * never use it for user-facing reads.
 */
export function createAdminClient() {
  const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
