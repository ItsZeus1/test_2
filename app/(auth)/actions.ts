"use server";

import { createClient } from "@/lib/supabase/server";
import { registerSchema, loginSchema, type RegisterInput, type LoginInput } from "@/lib/validation";
import { redirect } from "next/navigation";

type ActionResult = { success: true } | { success: false; error: string };

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

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  if (signUpError || !signUpData.user) {
    return { success: false, error: signUpError?.message ?? "Could not create account" };
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: signUpData.user.id,
    name,
    username,
    email,
    role: "NORMAL",
    balance: 0,
  });
  if (profileError) {
    return { success: false, error: "Account created but profile setup failed. Contact support." };
  }

  redirect("/");
}

export async function signInAction(input: LoginInput): Promise<ActionResult> {
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
