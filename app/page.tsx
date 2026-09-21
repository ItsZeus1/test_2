import { createClient } from "@/lib/supabase/server";
import { getOrCreateProfile } from "@/lib/profile";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { TopNav } from "@/components/layout/TopNav";
import { CategoryGrid } from "@/components/layout/CategoryGrid";
import { mockCategories } from "@/lib/mock-data";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guests see the animated onboarding wizard.
  if (!user) {
    return <OnboardingWizard />;
  }

  // Logged-in users land on a simple dashboard: nav + category grid.
  const profile = await getOrCreateProfile(supabase, user.id, user.email ?? "");

  return (
    <div>
      <TopNav profile={profile} />
      <main className="px-6 md:px-16 lg:px-24 py-12">
        <h1 className="font-display text-3xl font-medium mb-8">Browse services</h1>
        <CategoryGrid categories={mockCategories} />
      </main>
    </div>
  );
}
