import { createServiceRoleClient } from "@/lib/supabase/server";
import { ServiceManager, type ServiceListItem } from "@/components/admin/ServiceManager";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  const db = createServiceRoleClient();
  const [{ data: svc }, { data: pk }] = await Promise.all([
    db.from("services").select("id, name, slug, category, is_active, is_featured").order("created_at", { ascending: true }),
    db.from("packages").select("service_id"),
  ]);

  const counts = new Map<string, number>();
  for (const p of (pk ?? []) as { service_id: string }[]) {
    counts.set(p.service_id, (counts.get(p.service_id) ?? 0) + 1);
  }

  const services: ServiceListItem[] = (
    (svc ?? []) as Omit<ServiceListItem, "package_count">[]
  ).map((s) => ({ ...s, package_count: counts.get(s.id) ?? 0 }));

  return <ServiceManager services={services} />;
}
