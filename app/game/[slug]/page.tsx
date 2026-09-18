import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/utils/supabase/server";
import { PurchaseFlow } from "@/components/checkout/purchase-flow";
import { Gamepad2 } from "lucide-react";
import type { Game, Product } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single<Game>();

  if (!game) {
    notFound();
  }

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("game_id", game.id)
    .eq("is_active", true)
    .order("price", { ascending: true });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          {game.image_url ? (
            <Image src={game.image_url} alt={game.title} fill className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Gamepad2 className="h-8 w-8 text-zinc-600" />
            </div>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{game.title}</h1>
          {game.publisher && <p className="text-sm text-zinc-500">{game.publisher}</p>}
        </div>
      </div>

      {game.description && (
        <p className="mb-8 max-w-2xl text-sm text-zinc-400">{game.description}</p>
      )}

      <PurchaseFlow
        products={(products as Product[]) ?? []}
        isLoggedIn={!!user}
        gameTitle={game.title}
      />
    </div>
  );
}
