import type { Metadata } from "next";

import { OrdersPage } from "@/components/orders-page";

export const metadata: Metadata = { title: "My Orders · ZovaCharge" };

export default function Page() {
  return <OrdersPage />;
}
