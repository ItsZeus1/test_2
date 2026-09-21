import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Profile } from "@/types";

/**
 * Fetches the caller's profile, and if it doesn't exist yet, creates it.
 *
 * The `handle_new_user` trigger (see supabase/schema.sql) is meant to
 * create this row automatically the moment an auth.users row appears.
 * This function exists as a safety net for that trigger being missing,
 * not yet applied, or having failed for any reason — a logged-in user
 * should never be stuck with no profile row and no way to get one,
 * which is what "signed up fine but can't read anything back" looks
 * like from the outside.
 */
export async function getOrCreateProfile(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<Profile | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (profile) return profile as Profile;

  // Use the service-role client for the insert: a brand-new user has no
  // row yet, so there's nothing for a `profiles_insert_own` RLS policy
  // to key off of safely, and this path only ever runs for the caller's
  // own verified `userId` from a real session.
  const db = createServiceRoleClient();
  const { data: created, error } = await db
    .from("profiles")
    .insert({
      id: userId,
      name: email.split("@")[0],
      username: userId, // UUID — guaranteed unique, safe fallback
      email,
      role: "NORMAL",
      balance: 0,
    })
    .select()
    .single();

  if (error) {
    console.error("getOrCreateProfile: failed to create fallback profile", error);
    return null;
  }

  return created as Profile;
}
