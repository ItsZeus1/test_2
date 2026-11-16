import type { Metadata } from "next";

import { ServicePage } from "@/components/service-page";

export const metadata: Metadata = { title: "Checkout · ZovaCharge" };

export default function Page() {
  return <ServicePage />;
}
