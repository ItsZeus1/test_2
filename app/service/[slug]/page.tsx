import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ServiceTopup } from "@/components/service/ServiceTopup";
import { priceForRole } from "@/lib/utils";
import type { PublicPackage, ServiceRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ServicePage({ params }: { params: { slug: string } }) {
  const session = await getCurrentUser();
  const role = session?.profile.role ?? "GUEST";

  const db = createServiceRoleClient();
  const { data: svc } = await db
    .from("services")
    .select("*")
    .eq("slug", params.slug)
    .eq("is_active", true)
    .maybeSingle();
  const service = svc as ServiceRow | null;
  if (!service) notFound();

  // Secrets are never selected. Only the price that applies to this viewer
  // is sent to the browser — the other tier never leaves the server.
  const { data: pk } = await db
    .from("packages")
    .select("id, size_name, normal_price, vip_price")
    .eq("service_id", service.id)
    .order("normal_price", { ascending: true });

  const packages: PublicPackage[] = (
    (pk ?? []) as { id: string; size_name: string; normal_price: number; vip_price: number }[]
  ).map((p) => ({
    id: p.id,
    size_name: p.size_name,
    price: priceForRole(role, p.normal_price, p.vip_price),
  }));

  return (
    <main>
      <ServiceTopup
        name={service.name}
        imageUrl={service.image_url}
        description={service.description}
        packages={packages}
        role={role}
        balance={session?.profile.balance ?? 0}
      />
    </main>
  );
}
