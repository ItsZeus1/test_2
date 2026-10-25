"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient, hasServiceRoleKey } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { serviceFormSchema, type ServiceFormInput } from "@/lib/validation";
import type { CategorySlug } from "@/lib/constants";

type Result = { success: true } | { success: false; error: string };

const NO_KEY =
  "SUPABASE_SERVICE_ROLE_KEY is not set on the server, so admin changes can't be saved. Add it in Vercel and redeploy.";

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/services");
  revalidatePath("/category/[slug]", "page");
}

export async function saveServiceAction(input: ServiceFormInput): Promise<Result> {
  if (!(await requireAdmin())) return { success: false, error: "Not authorized." };
  if (!hasServiceRoleKey()) return { success: false, error: NO_KEY };

  const parsed = serviceFormSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const db = createServiceRoleClient();

  const base = {
    name: d.name,
    slug: d.slug,
    category: d.category,
    image_url: d.imageUrl || null,
    description: d.description || null,
    is_active: d.isActive,
    is_featured: d.isFeatured,
  };

  let serviceId = d.id;
  if (serviceId) {
    const { error } = await db.from("services").update(base).eq("id", serviceId);
    if (error) {
      return {
        success: false,
        error: error.message.includes("duplicate") ? "That slug is already used." : "Could not update the service.",
      };
    }
  } else {
    const { data, error } = await db.from("services").insert(base).select("id").single();
    if (error || !data) {
      return {
        success: false,
        error: error?.message.includes("duplicate")
          ? "That slug is already used."
          : "Could not create the service.",
      };
    }
    serviceId = (data as { id: string }).id;
  }

  // Sync packages: delete removed, update existing, insert new.
  const { data: existing } = await db.from("packages").select("id").eq("service_id", serviceId);
  const existingIds = ((existing ?? []) as { id: string }[]).map((p) => p.id);
  const keepIds = d.packages.map((p) => p.pkgId).filter((v): v is string => Boolean(v));
  const toDelete = existingIds.filter((id) => !keepIds.includes(id));
  if (toDelete.length > 0) {
    await db.from("packages").delete().in("id", toDelete);
  }

  for (const p of d.packages) {
    const row = {
      service_id: serviceId,
      size_name: p.sizeName,
      normal_price: p.normalPrice,
      vip_price: p.vipPrice,
      api_endpoint: p.apiEndpoint,
      api_secret_code: p.apiSecretCode,
    };
    const { error } = p.pkgId
      ? await db.from("packages").update(row).eq("id", p.pkgId)
      : await db.from("packages").insert(row);
    if (error) {
      return { success: false, error: `Service saved, but package “${p.sizeName}” failed to save.` };
    }
  }

  refresh();
  return { success: true };
}

export async function deleteServiceAction(serviceId: string): Promise<Result> {
  if (!(await requireAdmin())) return { success: false, error: "Not authorized." };
  if (!hasServiceRoleKey()) return { success: false, error: NO_KEY };

  const db = createServiceRoleClient();
  const { error } = await db.from("services").delete().eq("id", serviceId);
  if (error) return { success: false, error: "Could not delete the service." };

  refresh();
  return { success: true };
}

/** Admin-only: loads a service with its packages INCLUDING secrets, for the edit form. */
export async function getServiceForEditAction(
  serviceId: string
): Promise<{ success: true; data: ServiceFormInput } | { success: false; error: string }> {
  if (!(await requireAdmin())) return { success: false, error: "Not authorized." };
  if (!hasServiceRoleKey()) return { success: false, error: NO_KEY };

  const db = createServiceRoleClient();
  const { data: svc } = await db.from("services").select("*").eq("id", serviceId).maybeSingle();
  if (!svc) return { success: false, error: "Service not found." };

  const s = svc as {
    id: string;
    name: string;
    slug: string;
    category: CategorySlug;
    image_url: string | null;
    description: string | null;
    is_active: boolean;
    is_featured: boolean;
  };

  const { data: pk } = await db
    .from("packages")
    .select("*")
    .eq("service_id", serviceId)
    .order("normal_price", { ascending: true });
  const packages = ((pk ?? []) as {
    id: string;
    size_name: string;
    normal_price: number;
    vip_price: number;
    api_endpoint: string;
    api_secret_code: string;
  }[]).map((p) => ({
    pkgId: p.id,
    sizeName: p.size_name,
    normalPrice: Number(p.normal_price),
    vipPrice: Number(p.vip_price),
    apiEndpoint: p.api_endpoint,
    apiSecretCode: p.api_secret_code,
  }));

  return {
    success: true,
    data: {
      id: s.id,
      name: s.name,
      slug: s.slug,
      category: s.category,
      imageUrl: s.image_url ?? "",
      description: s.description ?? "",
      isActive: s.is_active,
      isFeatured: s.is_featured,
      packages,
    },
  };
}
