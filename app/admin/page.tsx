import type { Metadata } from "next";

import { AdminDashboard } from "@/components/admin-dashboard";

export const metadata: Metadata = { title: "Admin · NovaCharge" };

export default function Page() {
  return <AdminDashboard />;
}
