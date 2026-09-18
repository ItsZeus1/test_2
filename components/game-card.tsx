import Link from "next/link";
import Image from "next/image";
import { Gamepad2, ArrowRight } from "lucide-react";
import type { Game } from "@/lib/types";

export function GameCard({ game }: { game: Game }) {
  return (
    <Link
      href={`/game/${game.slug}`}
      className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 transition-all hover:border-emerald-500/50 hover:shadow-glow-emerald"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-800">
        {game.image_url ? (
          <Image
            src={game.image_url}
            alt={game.title}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Gamepad2 className="h-10 w-10 text-zinc-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />
      </div>

      <div className="p-4">
        <h3 className="truncate font-semibold text-white">{game.title}</h3>
        {game.publisher && (
          <p className="truncate text-xs text-zinc-500">{game.publisher}</p>
        )}
        <div className="mt-3 flex items-center gap-1 text-sm font-medium text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100">
          Top up now
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
  );
}
