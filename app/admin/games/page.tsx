import { createClient } from "@/utils/supabase/server";
import { AddGameForm } from "@/components/admin/add-game-form";
import { AddProductForm } from "@/components/admin/add-product-form";
import { GamesTable } from "@/components/admin/games-table";
import type { Game } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminGamesPage() {
  const supabase = await createClient();

  const { data: games } = await supabase
    .from("games")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Manage Games</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Add games and their top-up packages.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AddGameForm />
        <AddProductForm games={(games as Game[]) ?? []} />
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">Existing games</h2>
        <GamesTable games={(games as Game[]) ?? []} />
      </div>
    </div>
  );
}
