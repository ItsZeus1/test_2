import { createClient } from "@/utils/supabase/server";
import { HeroSection } from "@/components/hero-section";
import { GameGrid } from "@/components/game-grid";
import type { Game } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();

  const { data: games, error } = await supabase
    .from("games")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  return (
    <>
      <HeroSection />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Browse games</h2>
            <p className="mt-1 text-sm text-zinc-500">Pick a title to see top-up packages.</p>
          </div>
        </div>
        <GameGrid games={(games as Game[]) ?? []} />
        {error && (
          <p className="mt-4 text-sm text-red-400">
            Couldn&apos;t load games right now — please refresh.
          </p>
        )}
      </section>
    </>
  );
}
