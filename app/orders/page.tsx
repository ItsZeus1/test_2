import type { Metadata } from "next";
import { Suspense } from "react";

import { OrdersPage } from "@/components/orders-page";

// Private, sign-in-only page: kept out of search results.
export const metadata: Metadata = { title: "My Orders · ZovaCharge", robots: { index: false, follow: true } };

export default function Page() {
  // Suspense: the page reads ?view=statement from the address.
  return (
    <Suspense fallback={null}>
      <OrdersPage />
    </Suspense>
  );
}
