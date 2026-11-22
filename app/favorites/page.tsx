import type { Metadata } from "next";

import { FavoritesView } from "@/components/storefront";

export const metadata: Metadata = { title: "المفضلة · Favourites · ZovaCharge", robots: { index: false, follow: true } };

export default function Page() {
  return <FavoritesView />;
}
