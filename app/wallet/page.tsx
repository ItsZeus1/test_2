import type { Metadata } from "next";

import { WalletPage } from "@/components/wallet-page";

// Private, sign-in-only page: kept out of search results.
export const metadata: Metadata = { title: "Wallet · ZovaCharge", robots: { index: false, follow: true } };

export default function Page() {
  return <WalletPage />;
}
