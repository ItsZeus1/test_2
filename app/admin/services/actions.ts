"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { serviceFormSchema, type ServiceFormInput } from "@/lib/validation";
import { revalidatePath } from "next/cache";

type ActionResult = { success: true } | { success: false; error: string };

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "ADMIN" ? user : null;
}

export async function createServiceAction(input: ServiceFormInput): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: "Not authorized." };

  const parsed = serviceFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { categoryId, name, slug, imageUrl, packages } = parsed.data;

  const db = createServiceRoleClient();

  const { data: service, error: serviceError } = await db
    .from("services")
    .insert({ category_id: categoryId, name, slug, image_url: imageUrl || null })
    .select()
    .single();
  if (serviceError) {
    return { success: false, error: "Could not create service — slug may already exist." };
  }

  const packageRows = packages.map((p) => ({
    service_id: service.id,
    size_name: p.sizeName,
    normal_price: p.normalPrice,
    vip_price: p.vipPrice,
    api_endpoint: p.apiEndpoint,
    api_secret_code: p.apiSecretCode,
  }));

  const { error: packagesError } = await db.from("packages").insert(packageRows);
  if (packagesError) {
    return { success: false, error: "Service created but packages failed to save." };
  }

  revalidatePath("/admin/services");
  return { success: true };
}

export async function deleteServiceAction(serviceId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { success: false, error: "Not authorized." };

  const db = createServiceRoleClient();
  const { error } = await db.from("services").delete().eq("id", serviceId);
  if (error) return { success: false, error: "Could not delete service." };

  revalidatePath("/admin/services");
  return { success: true };
}
