import { Card, StatusBadge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/utils";

export interface FeedRow {
  id: string;
  service_name: string;
  buyer: string;
  size_name: string;
  amount_paid: number;
  created_at: string;
  user_ip: string | null;
  status: string;
}

export function RecentPurchasesFeed({ rows }: { rows: FeedRow[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 bg-panel text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3 font-medium">Buyer</th>
              <th className="px-4 py-3 font-medium">Charge size</th>
              <th className="px-4 py-3 font-medium">Price paid</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">IP address</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  No purchases yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="px-4 py-3 font-medium">{r.service_name}</td>
                <td className="px-4 py-3 text-muted">{r.buyer}</td>
                <td className="px-4 py-3">{r.size_name}</td>
                <td className="px-4 py-3 font-tabular">{formatMoney(r.amount_paid)}</td>
                <td className="px-4 py-3 text-xs text-muted">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{r.user_ip ?? "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
