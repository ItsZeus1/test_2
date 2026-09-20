"use server";

import { createClient } from "@/lib/supabase/server";
import { registerSchema, loginSchema, type RegisterInput, type LoginInput } from "@/lib/validation";
import { redirect } from "next/navigation";

type ActionResult =
  | { success: true; needsEmailConfirmation: boolean }
  | { success: false; error: string };

type SignInResult = { success: false; error: string };

export async function signUpAction(input: RegisterInput): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, username, email, password } = parsed.data;

  const supabase = createClient();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing) {
    return { success: false, error: "That username is already taken" };
  }

  // The `profiles` row is created by a database trigger (`handle_new_user`,
  // see supabase/schema.sql) that fires the moment this auth.users row is
  // created — not by a client-side insert here. A client insert would be
  // blocked by RLS whenever the user has no session yet (e.g. email
  // confirmation is required), which is what caused the earlier
  // "account created but profile setup failed" error.
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, username } },
  });
  if (signUpError || !signUpData.user) {
    return { success: false, error: signUpError?.message ?? "Could not create account" };
  }

  // If email confirmation is enabled in Supabase Auth settings, there's no
  // session yet — don't redirect into the app, tell the user to confirm.
  if (!signUpData.session) {
    return { success: true, needsEmailConfirmation: true };
  }

  redirect("/");
}

export async function signInAction(input: LoginInput): Promise<SignInResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { success: false, error: "Incorrect email or password" };
  }

  redirect("/");
}

export async function signOutAction() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/");
}
