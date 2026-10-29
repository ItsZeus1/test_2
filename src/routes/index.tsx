import { createFileRoute } from "@tanstack/react-router";

import { useProfileState } from "@/components/profile";
import { Storefront } from "@/components/storefront";
import { WelcomeWizard } from "@/components/welcome-wizard";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    browse: search["browse"] === true || search["browse"] === "true" ? (true as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "NovaCharge — Instant game & app top-ups" },
      { name: "description", content: "Top up PUBG, Free Fire, TikTok Coins, subscriptions and mobile data in minutes with NovaCharge." },
      { property: "og:title", content: "NovaCharge — Instant game & app top-ups" },
      { property: "og:description", content: "Top up games, apps, subscriptions and mobile data in minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { profile, ready } = useProfileState();
  const { browse } = Route.useSearch();
  if (!ready) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="h-64 animate-pulse rounded-[2rem] bg-white/5" />
      </main>
    );
  }
  if (!profile && !browse) return <WelcomeWizard />;
  return <Storefront />;
}
