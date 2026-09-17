// app/game/[slug]/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TopUpFlow } from "@/components/game-topup/topup-flow";

type AccountField = { key: string; label: string; placeholder: string; helpText: string };

export default async function GameTopUpPage({ params }: { params: { slug: string } }) {
  const game = await prisma.game.findUnique({
    where: { slug: params.slug },
    include: {
      products: { orderBy: { priceCents: "asc" } },
    },
  });

  if (!game) notFound();

  return (
    <main className="min-h-screen bg-zinc-950">
      <TopUpFlow
        game={{
          id: game.id,
          slug: game.slug,
          name: game.name,
          publisher: game.publisher,
          coverImage: game.coverImage,
          accountFields: game.accountFields as AccountField[],
          products: game.products.map((p) => ({
            id: p.id,
            name: p.name,
            amount: p.amount,
            bonusAmount: p.bonusAmount,
            priceCents: p.priceCents,
            currency: p.currency,
            isPopular: p.isPopular,
          })),
        }}
      />
    </main>
  );
}

export async function generateStaticParams() {
  const games = await prisma.game.findMany({ select: { slug: true } });
  return games.map((g) => ({ slug: g.slug }));
}
