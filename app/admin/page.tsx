import type { Metadata } from "next";

import { AdminDashboard } from "@/components/admin-dashboard";

export const metadata: Metadata = { title: "Admin · ZovaCharge" };

export default function Page() {
  return <AdminDashboard />;
}
