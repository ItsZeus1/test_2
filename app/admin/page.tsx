import { MetricsGrid } from "@/components/admin/MetricsGrid";
import { RecentPurchasesFeed } from "@/components/admin/RecentPurchasesFeed";
import { mockServices, mockTransactions, mockUsers } from "@/lib/mock-data";

export default function AdminOverviewPage() {
  // TODO(supabase): replace with real aggregate queries —
  // active sessions from a presence table or auth.sessions,
  // totalActiveServices from `services where is_active`,
  // totalRevenue from a SUM over `transactions where status = 'SUCCESS'`.
  const metrics = {
    activeSessions: mockUsers.length,
    totalActiveServices: mockServices.filter((s) => s.is_active).length,
    totalRevenue: mockTransactions
      .filter((t) => t.status === "SUCCESS")
      .reduce((sum, t) => sum + t.amount_deducted, 0),
  };

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-2xl font-medium mb-6">Overview</h1>
        <MetricsGrid metrics={metrics} />
      </div>

      <div>
        <h2 className="font-display text-lg font-medium mb-4">Recent purchases</h2>
        <RecentPurchasesFeed transactions={mockTransactions} />
      </div>
    </div>
  );
}
