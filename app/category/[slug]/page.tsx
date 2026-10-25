import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getStoreServices } from "@/lib/store-data";
import { Storefront } from "@/components/store/Storefront";
import { CATEGORIES, type CategorySlug } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const category = CATEGORIES.find((c) => c.slug === params.slug);
  if (!category) notFound();

  const session = await getCurrentUser();
  if (!session) redirect("/");

  const services = await getStoreServices(session.profile.role, session.profile.id);

  return (
    <main>
      <Suspense fallback={null}>
        <Storefront
          key={category.slug}
          services={services}
          isAdmin={session.profile.role === "ADMIN"}
          initialTab={category.slug as CategorySlug}
          showBanner={false}
          heading={category.label}
        />
      </Suspense>
    </main>
  );
}
