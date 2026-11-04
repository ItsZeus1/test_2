"use client";

import { useSearchParams } from "next/navigation";

import { useProfileState } from "@/components/profile";
import { Storefront } from "@/components/storefront";
import { WelcomeWizard } from "@/components/welcome-wizard";

export function Home() {
  const { profile, ready } = useProfileState();
  const params = useSearchParams();
  const browse = params.get("browse") === "true";
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
