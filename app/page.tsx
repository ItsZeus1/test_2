import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getStoreServices } from "@/lib/store-data";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { Storefront } from "@/components/store/Storefront";
import { WelcomeWizard, type Teaser } from "@/components/onboarding/WelcomeWizard";

export const dynamic = "force-dynamic";

async function getTeasers(): Promise<Teaser[]> {
  const db = createServiceRoleClient();
  const { data: svc } = await db
    .from("services")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(4);
  const services = (svc ?? []) as { id: string; name: string; slug: string }[];
  if (services.length === 0) return [];

  const { data: pk } = await db
    .from("packages")
    .select("service_id, normal_price, vip_price")
    .in("service_id", services.map((s) => s.id));
  const packages = (pk ?? []) as { service_id: string; normal_price: number; vip_price: number }[];

  const teasers: Teaser[] = [];
  for (const s of services) {
    const mine = packages.filter((p) => p.service_id === s.id);
    if (mine.length === 0) continue;
    const cheapest = mine.reduce((a, b) => (Number(b.normal_price) < Number(a.normal_price) ? b : a));
    teasers.push({
      name: s.name,
      slug: s.slug,
      normal: Number(cheapest.normal_price),
      vip: Number(cheapest.vip_price),
    });
  }
  return teasers;
}

export default async function HomePage() {
  const session = await getCurrentUser();

  if (!session) {
    let teasers: Teaser[] = [];
    try {
      teasers = await getTeasers();
    } catch (error) {
      console.warn("[home] could not load teasers:", error);
    }
    return <WelcomeWizard teasers={teasers} />;
  }

  const services = await getStoreServices(session.profile.role, session.profile.id);

  return (
    <main>
      <Suspense fallback={null}>
        <Storefront services={services} isAdmin={session.profile.role === "ADMIN"} />
      </Suspense>
    </main>
  );
}
