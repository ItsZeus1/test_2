import type { Metadata } from "next";

import { HomeView } from "@/components/storefront";

/** `/` always answers 200 with the storefront (guests included) — it never redirects. */
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Page() {
  return <HomeView />;
}
