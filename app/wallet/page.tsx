import type { Metadata } from "next";

import { WalletPage } from "@/components/wallet-page";

export const metadata: Metadata = { title: "Wallet · NovaCharge" };

export default function Page() {
  return <WalletPage />;
}
