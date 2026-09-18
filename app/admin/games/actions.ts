"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/types";

/**
 * Verifies the current session belongs to an ADMIN. Every admin Server
 * Action calls this FIRST — never trust that middleware alone kept
 * non-admins out, since Server Actions can in principle be invoked
 * directly (e.g. via a crafted request), bypassing the route middleware.
 */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: "Not authenticated." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "ADMIN") {
    return { ok: false as const, error: "You do not have permission to do that." };
  }

  return { ok: true as const, supabase, userId: user.id };
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export async function addGameAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const title = String(formData.get("title") || "").trim();
  let slug = String(formData.get("slug") || "").trim();
  const publisher = String(formData.get("publisher") || "").trim();
  const imageUrl = String(formData.get("imageUrl") || "").trim();
  const description = String(formData.get("description") || "").trim();

  if (!title) {
    return { success: false, error: "Title is required." };
  }

  slug = slug ? slugify(slug) : slugify(title);

  const { error } = await auth.supabase.from("games").insert({
    title,
    slug,
    publisher: publisher || null,
    image_url: imageUrl || null,
    description: description || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "A game with that slug already exists." };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/games");
  revalidatePath("/");
  return { success: true };
}

export async function toggleGameActiveAction(gameId: string, isActive: boolean) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const { error } = await auth.supabase
    .from("games")
    .update({ is_active: isActive })
    .eq("id", gameId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/games");
  revalidatePath("/");
  return { success: true };
}

export async function addProductAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const gameId = String(formData.get("gameId") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const price = Number(formData.get("price"));

  if (!gameId || !name || Number.isNaN(price) || price < 0) {
    return { success: false, error: "Please fill in all fields with a valid price." };
  }

  const { error } = await auth.supabase.from("products").insert({
    game_id: gameId,
    name,
    description: description || null,
    price,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/games");
  revalidatePath("/admin/inventory");
  return { success: true };
}
