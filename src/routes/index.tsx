import { createFileRoute } from "@tanstack/react-router";

import { useProfileState } from "@/components/profile";
import { Storefront } from "@/components/storefront";
import { WelcomeWizard } from "@/components/welcome-wizard";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    browse: search.browse === true || search.browse === "true" ? (true as const) : undefined,
  }),
  component: Home,
});

function Home() {
  const { profile, ready } = useProfileState();
  const { browse } = Route.useSearch();
  if (!ready) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-16">
        <div className="h-64 animate-pulse rounded-[2rem] bg-white/5" />
      </main>
    );
  }
  if (!profile && !browse) return <WelcomeWizard />;
  return <Storefront />;
}
