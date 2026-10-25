import * as React from "react";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/constants";
import type { Profile } from "@/lib/types";

export function getClientIp(): string {
  const h = headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? "unknown";
}

// React's per-request `cache` exists at runtime in the App Router but is not in the
// stable @types/react 18 typings, so access it defensively (falls back to no caching).
type Memo = <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R;
const memo: Memo = (React as unknown as { cache?: Memo }).cache ?? ((fn) => fn);

function normalize(row: Profile): Profile {
  return { ...row, balance: Number(row.balance) };
}

/**
 * Loads the user's profile, creating it if the DB trigger missed it, and
 * enforcing the admin rule for ADMIN_EMAIL (fallback to the SQL trigger).
 */
export async function ensureProfileForUser(user: User): Promise<Profile | null> {
  const supabase = await createClient();
  const email = user.email ?? "";
  const isAdminEmail = email.toLowerCase() === ADMIN_EMAIL;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  let profile = (data as Profile | null) ?? null;

  if (!profile) {
    const db = createServiceRoleClient();
    const meta = (user.user_metadata ?? {}) as { name?: string; username?: string };
    const base = (meta.username ?? "").trim() || email.split("@")[0] || "user";
    const suffix = user.id.replace(/-/g, "").slice(0, 6);

    const { data: inserted, error } = await db
      .from("profiles")
      .insert({
        id: user.id,
        name: (meta.name ?? "").trim() || base,
        username: `${base}_${suffix}`,
        email,
        role: isAdminEmail ? "ADMIN" : "NORMAL",
        balance: isAdminEmail ? 10000 : 0,
      })
      .select("*")
      .maybeSingle();

    if (error) {
      console.warn("[auth] profile self-heal insert failed:", error.message);
      const { data: again } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
      profile = (again as Profile | null) ?? null;
    } else {
      profile = (inserted as Profile | null) ?? null;
    }
  }

  if (profile && isAdminEmail && profile.role !== "ADMIN") {
    const db = createServiceRoleClient();
    const { data: updated, error } = await db
      .from("profiles")
      .update({ role: "ADMIN" })
      .eq("id", profile.id)
      .select("*")
      .maybeSingle();
    if (error) console.warn("[auth] admin promotion failed:", error.message);
    if (updated) profile = updated as Profile;
  }

  return profile ? normalize(profile) : null;
}

async function touchPresence(profile: Profile): Promise<Profile> {
  const last = profile.last_seen ? new Date(profile.last_seen).getTime() : 0;
  if (Date.now() - last < 60_000) return profile;
  try {
    const db = createServiceRoleClient();
    const nowIso = new Date().toISOString();
    const ip = getClientIp();
    await db.from("profiles").update({ last_seen: nowIso, last_ip: ip }).eq("id", profile.id);
    return { ...profile, last_seen: nowIso, last_ip: ip };
  } catch {
    return profile;
  }
}

/** Current signed-in user + profile (deduped per request). */
export const getCurrentUser = memo(async (): Promise<{ user: User; profile: Profile } | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await ensureProfileForUser(user);
  if (!profile) return null;

  return { user, profile: await touchPresence(profile) };
});

export async function requireAdmin(): Promise<Profile | null> {
  const session = await getCurrentUser();
  return session && session.profile.role === "ADMIN" ? session.profile : null;
}
