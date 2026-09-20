import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Uses the anon key only — RLS policies
 * (see supabase/schema.sql) are what actually protect the data, not
 * this key being secret.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // NEXT_PUBLIC_ vars are inlined at build time — if these are missing,
    // they were unset when Vercel ran `next build`, so setting them now
    // and just reloading won't fix it. A rebuild is required.
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. These are baked in at build time — set them in Vercel and trigger a new deployment, not just a redeploy of the same build."
    );
  }

  return createBrowserClient(url, anonKey);
}
