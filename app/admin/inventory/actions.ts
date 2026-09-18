"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/types";

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

  return { ok: true as const, supabase };
}

/**
 * Bulk-adds secret codes for a product. Accepts one code per line so an
 * admin can paste a whole batch of PINs at once.
 */
export async function addSecretCodesAction(
  _prevState: ActionResult<{ inserted: number; skipped: number }> | null,
  formData: FormData
): Promise<ActionResult<{ inserted: number; skipped: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const productId = String(formData.get("productId") || "");
  const rawCodes = String(formData.get("codes") || "");

  if (!productId) {
    return { success: false, error: "Please select a product." };
  }

  const codes = Array.from(
    new Set(
      rawCodes
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean)
    )
  );

  if (codes.length === 0) {
    return { success: false, error: "Paste at least one code (one per line)." };
  }

  const rows = codes.map((code_string) => ({ product_id: productId, code_string }));

  const { data, error } = await auth.supabase
    .from("secret_codes")
    .insert(rows)
    .select("id");

  if (error) {
    // Unique constraint violation means some/all codes already exist for
    // this product. Retry one-by-one so valid codes still get inserted.
    if (error.code === "23505") {
      let inserted = 0;
      for (const row of rows) {
        const { error: singleError } = await auth.supabase
          .from("secret_codes")
          .insert(row);
        if (!singleError) inserted++;
      }
      revalidatePath("/admin/inventory");
      return {
        success: true,
        data: { inserted, skipped: codes.length - inserted },
      };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/inventory");
  return { success: true, data: { inserted: data?.length ?? 0, skipped: 0 } };
}
