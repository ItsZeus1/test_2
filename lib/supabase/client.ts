import { createBrowserClient } from "@supabase/ssr";

/** Browser client (anon key). Currently unused by the UI; all data goes through server actions. */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY (these are inlined at build time — rebuild after setting them)."
    );
  }
  return createBrowserClient(url, anonKey);
}
