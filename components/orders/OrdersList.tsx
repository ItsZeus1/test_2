"use client";

import { useState } from "react";
import { Printer, Receipt } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, StatusBadge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/utils";
import type { TransactionRow } from "@/lib/types";

export function OrdersList({ orders }: { orders: TransactionRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (orders.length === 0) {
    return <p className="py-16 text-center text-muted">No orders yet. Your purchases will show up here.</p>;
  }

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <Card key={o.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">
                {o.service_name} · {o.size_name}
              </div>
              <div className="text-xs text-muted">
                {new Date(o.created_at).toLocaleString()} · Account {o.target_account_id}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-tabular font-semibold">{formatMoney(o.amount_paid)}</span>
              <StatusBadge status={o.status} />
              <Button variant="secondary" size="sm" onClick={() => setOpenId(openId === o.id ? null : o.id)}>
                <Receipt className="h-3.5 w-3.5" /> Receipt
              </Button>
            </div>
          </div>

          {openId === o.id && (
            <div className="mt-4 rounded-xl border border-dashed border-white/20 p-4 text-sm">
              <div className="mb-3 font-display text-base font-medium">NovaCharge — Digital Receipt</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
                <dt className="text-muted">Order ID</dt><dd className="break-all font-mono text-xs">{o.id}</dd>
                <dt className="text-muted">Service</dt><dd>{o.service_name}</dd>
                <dt className="text-muted">Package</dt><dd>{o.size_name}</dd>
                <dt className="text-muted">Target account</dt><dd>{o.target_account_id}</dd>
                <dt className="text-muted">Amount paid</dt><dd className="font-tabular">{formatMoney(o.amount_paid)}</dd>
                <dt className="text-muted">Status</dt><dd>{o.status}</dd>
                <dt className="text-muted">Date</dt><dd>{new Date(o.created_at).toLocaleString()}</dd>
              </dl>
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" /> Print
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
