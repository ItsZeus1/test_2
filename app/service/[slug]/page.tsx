import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateProfile } from "@/lib/profile";
import { TopNav } from "@/components/layout/TopNav";
import { PackageGrid } from "@/components/checkout/PackageGrid";
import { getServiceBySlug, getPublicPackagesForService } from "@/lib/mock-data";

export default async function ServicePage({ params }: { params: { slug: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = user ? await getOrCreateProfile(supabase, user.id, user.email ?? "") : null;

  // TODO(supabase): replace with a query against `services` + the
  // `packages_public` view (never the base `packages` table on the client).
  const service = getServiceBySlug(params.slug);
  if (!service) notFound();

  const packages = getPublicPackagesForService(service.id);

  return (
    <div>
      <TopNav profile={profile} />
      <main className="px-6 md:px-16 lg:px-24 py-12">
        <div className="flex items-center gap-6 mb-10">
          <div className="w-20 h-20 bg-panel2 rounded-sharp flex items-center justify-center text-muted text-xs shrink-0">
            {service.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={service.image_url}
                alt={service.name}
                className="w-full h-full object-cover rounded-sharp"
              />
            ) : (
              "No image"
            )}
          </div>
          <div>
            <h1 className="font-display text-3xl font-medium">{service.name}</h1>
            <p className="text-muted text-sm mt-1">Choose a charge size below</p>
          </div>
        </div>

        <PackageGrid packages={packages} profile={profile} />
      </main>
    </div>
  );
}
