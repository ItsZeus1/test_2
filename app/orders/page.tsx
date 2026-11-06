import type { Metadata } from "next";

import { OrdersPage } from "@/components/orders-page";

export const metadata: Metadata = { title: "My Orders · NovaCharge" };

export default function Page() {
  return <OrdersPage />;
}
