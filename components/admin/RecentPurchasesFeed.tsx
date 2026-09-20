import { Card, Badge } from "@/components/ui/primitives";
import { formatCurrency } from "@/lib/pricing";
import type { Transaction } from "@/types";

export function RecentPurchasesFeed({ transactions }: { transactions: Transaction[] }) {
  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-muted text-xs">
            <th className="px-4 py-3 font-medium">Service</th>
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium">Size</th>
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">IP Address</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-b border-line last:border-0">
              <td className="px-4 py-3">{t.service_name}</td>
              <td className="px-4 py-3 text-muted">{t.user_name}</td>
              <td className="px-4 py-3">{t.size_name}</td>
              <td className="px-4 py-3 font-tabular">{formatCurrency(t.amount_deducted)}</td>
              <td className="px-4 py-3 text-muted font-tabular">{t.ip_address}</td>
              <td className="px-4 py-3">
                <Badge tone={t.status === "SUCCESS" ? "success" : "default"}>{t.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
