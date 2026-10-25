import { createServiceRoleClient } from "@/lib/supabase/server";
import { priceForRole } from "@/lib/utils";
import type { Role, ServiceRow, StoreService } from "@/lib/types";

interface PriceRow {
  service_id: string;
  normal_price: number;
  vip_price: number;
}

/** Services + the role-appropriate "from" price. Secrets are never selected. */
export async function getStoreServices(
  role: Role | "GUEST",
  userId: string | null
): Promise<StoreService[]> {
  const db = createServiceRoleClient();

  const { data: serviceData } = await db
    .from("services")
    .select("*")
    .eq("is_active", true)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: true });
  const services = (serviceData ?? []) as ServiceRow[];

  const { data: priceData } = await db
    .from("packages")
    .select("service_id, normal_price, vip_price");
  const prices = (priceData ?? []) as PriceRow[];

  const lowest = new Map<string, number>();
  for (const p of prices) {
    const price = priceForRole(role, p.normal_price, p.vip_price);
    const current = lowest.get(p.service_id);
    if (current === undefined || price < current) lowest.set(p.service_id, price);
  }

  let favoriteIds = new Set<string>();
  if (userId) {
    const { data: favData } = await db.from("favorites").select("service_id").eq("user_id", userId);
    favoriteIds = new Set(((favData ?? []) as { service_id: string }[]).map((f) => f.service_id));
  }

  return services.map((s) => ({
    ...s,
    starting_price: lowest.get(s.id) ?? null,
    is_favorite: favoriteIds.has(s.id),
  }));
}
