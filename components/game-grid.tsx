import { Gamepad2 } from "lucide-react";
import { GameCard } from "@/components/game-card";
import type { Game } from "@/lib/types";

export function GameGrid({ games }: { games: Game[] }) {
  if (!games || games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-24 text-center">
        <Gamepad2 className="mb-4 h-12 w-12 text-zinc-700" />
        <h3 className="text-lg font-medium text-zinc-300">No games available yet</h3>
        <p className="mt-1 max-w-sm text-sm text-zinc-500">
          Check back soon — new titles are added regularly. Admins can add games from the admin dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {games.map((game) => (
        <GameCard key={game.id} game={game} />
      ))}
    </div>
  );
}
