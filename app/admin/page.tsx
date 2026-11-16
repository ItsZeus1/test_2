import type { Metadata } from "next";

import { AdminDashboard } from "@/components/admin-dashboard";

// Private, sign-in-only page: kept out of search results.
export const metadata: Metadata = { title: "Admin · ZovaCharge", robots: { index: false, follow: true } };

export default function Page() {
  return <AdminDashboard />;
}
