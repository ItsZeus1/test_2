import { Users, Package, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { formatCurrency } from "@/lib/pricing";
import type { AdminMetrics } from "@/types";

export function MetricsGrid({ metrics }: { metrics: AdminMetrics }) {
  const items = [
    { icon: Users, label: "Active Sessions", value: metrics.activeSessions.toString() },
    { icon: Package, label: "Active Services", value: metrics.totalActiveServices.toString() },
    { icon: TrendingUp, label: "Total Revenue", value: formatCurrency(metrics.totalRevenue) },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {items.map(({ icon: Icon, label, value }) => (
        <Card key={label} className="p-5">
          <Icon className="w-4 h-4 text-ember mb-3" strokeWidth={2} />
          <div className="font-display text-2xl font-medium font-tabular">{value}</div>
          <div className="text-muted text-xs mt-1">{label}</div>
        </Card>
      ))}
    </div>
  );
}
