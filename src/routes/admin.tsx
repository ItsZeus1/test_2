import { createFileRoute } from "@tanstack/react-router";

import { AdminDashboard } from "@/components/admin-dashboard";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin · NovaCharge" }] }),
  component: AdminPage,
});

function AdminPage() {
  return <AdminDashboard />;
}
