// app/game/[slug]/page.tsx
// export const dynamic = "force-dynamic";
// import { notFound } from "next/navigation";
// import { prisma } from "@/lib/db";
// import { TopUpFlow } from "@/components/game-topup/topup-flow";

// type AccountField = { key: string; label: string; placeholder: string; helpText: string };

// export default async function GameTopUpPage({ params }: { params: { slug: string } }) {
//   const game = await prisma.game.findUnique({
//     where: { slug: params.slug },
//     include: {
//       products: { orderBy: { priceCents: "asc" } },
//     },
//   });

//   if (!game) notFound();

//   return (
//     <main className="min-h-screen bg-zinc-950">
//       <TopUpFlow
//         game={{
//           id: game.id,
//           slug: game.slug,
//           name: game.name,
//           publisher: game.publisher,
//           coverImage: game.coverImage,
//           accountFields: game.accountFields as AccountField[],
//           products: game.products.map((p) => ({
//             id: p.id,
//             name: p.name,
//             amount: p.amount,
//             bonusAmount: p.bonusAmount,
//             priceCents: p.priceCents,
//             currency: p.currency,
//             isPopular: p.isPopular,
//           })),
//         }}
//       />
//     </main>
//   );
// }

// export async function generateStaticParams() {
//   const games = await prisma.game.findMany({ select: { slug: true } });
//   return games.map((g) => ({ slug: g.slug }));
// }
 

export default function GamePage({ params }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-10">
      <h1 className="text-4xl font-bold text-emerald-400 mb-4">
        Game Top-Up
      </h1>
      <p className="text-zinc-400">
        You are viewing the page for: <span className="text-white font-mono">{params.slug}</span>
      </p>
      <p className="mt-8 text-sm text-zinc-500">
        (The database connection has been temporarily paused to allow Vercel to build).
      </p>
    </div>
  );
}