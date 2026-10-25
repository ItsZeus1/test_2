"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase/server";
import { ensureProfileForUser } from "@/lib/auth";
import {
  registerSchema,
  loginSchema,
  type RegisterInput,
  type LoginInput,
} from "@/lib/validation";

type AuthResult =
  | { success: true; needsEmailConfirmation: boolean }
  | { success: false; error: string };

export async function signUpAction(input: RegisterInput): Promise<AuthResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, username, email, password } = parsed.data;

  // Username uniqueness. Needs the service key: anonymous visitors cannot
  // read other people's profile rows (RLS), so the check must run server-side.
  if (hasServiceRoleKey()) {
    const db = createServiceRoleClient();
    const { data: taken } = await db
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (taken) return { success: false, error: "That username is already taken." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, username } },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("rate limit")) {
      return {
        success: false,
        error:
          "Too many sign-up emails were sent recently. Wait a while, or turn off “Confirm email” in Supabase → Authentication → Providers → Email.",
      };
    }
    if (msg.includes("already registered")) {
      return { success: false, error: "An account with this email already exists. Try logging in." };
    }
    return { success: false, error: error.message };
  }
  if (!data.user) return { success: false, error: "Could not create your account." };

  // Supabase returns an empty identities list when the email already exists.
  if (data.user.identities && data.user.identities.length === 0) {
    return { success: false, error: "An account with this email already exists. Try logging in." };
  }

  if (!data.session) {
    // Email confirmation is ON: nothing more to do until they confirm.
    return { success: true, needsEmailConfirmation: true };
  }

  // Fallback to the SQL trigger: guarantees the profile (and the owner's ADMIN role) exist.
  await ensureProfileForUser(data.user);
  return { success: true, needsEmailConfirmation: false };
}

export async function signInAction(input: LoginInput): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    const msg = (error?.message ?? "").toLowerCase();
    if (msg.includes("email not confirmed")) {
      return {
        success: false,
        error: "This email isn't confirmed yet. Check your inbox for the confirmation link.",
      };
    }
    if (msg.includes("rate limit")) {
      return { success: false, error: "Too many attempts. Wait a few minutes and try again." };
    }
    return { success: false, error: "Incorrect email or password." };
  }

  // Fallback to the SQL trigger: repairs a missing profile / promotes the owner email.
  await ensureProfileForUser(data.user);
  return { success: true, needsEmailConfirmation: false };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
