import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateProfile } from "@/lib/profile";
import { TopNav } from "@/components/layout/TopNav";
import { Card } from "@/components/ui/primitives";
import { getCategoryBySlug, getServicesByCategory } from "@/lib/mock-data";

export default async function CategoryPage({ params }: { params: { name: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = user ? await getOrCreateProfile(supabase, user.id, user.email ?? "") : null;

  // TODO(supabase): replace with `supabase.from("categories").select().eq("slug", params.name)`
  const category = getCategoryBySlug(params.name);
  if (!category) notFound();

  const services = getServicesByCategory(category.id);

  return (
    <div>
      <TopNav profile={profile} />
      <main className="px-6 md:px-16 lg:px-24 py-12">
        <p className="text-ember text-sm font-medium mb-2">{category.name}</p>
        <h1 className="font-display text-3xl font-medium mb-8">Choose a service</h1>

        {services.length === 0 ? (
          <p className="text-muted">No services live in this category yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {services.map((svc) => (
              <Link key={svc.id} href={`/service/${svc.slug}`}>
                <Card className="overflow-hidden hover:border-ember transition-colors h-full">
                  <div className="aspect-square bg-panel2 flex items-center justify-center text-muted text-xs">
                    {svc.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={svc.image_url}
                        alt={svc.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      "No image"
                    )}
                  </div>
                  <div className="p-4">
                    <div className="font-medium text-sm">{svc.name}</div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
