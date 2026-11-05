"use client";

import { useParams } from "next/navigation";

import { ServiceCheckout } from "@/components/service-checkout";

export function ServicePage() {
  const slug = String(useParams<{ slug: string }>().slug ?? "");
  return <ServiceCheckout slug={slug} />;
}
