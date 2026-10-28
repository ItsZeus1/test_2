import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

import { useProfileState } from "@/components/profile";
import { listMyOrders, onStoreChange } from "@/lib/store/api";
import { formatUsd } from "@/lib/money";
import type { OrderRow } from "@/lib/store/types";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "My Orders · NovaCharge" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const { profile, ready } = useProfileState();
  const [orders, setOrders] = useState<OrderRow[]>([]);

  useEffect(() => {
    if (!profile) return;
    let cancel = false;
    const load = () => {
      void listMyOrders().then((rows) => {
        if (!cancel) setOrders(rows);
      });
    };
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, [profile]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-4xl font-extrabold">
        <span className="text-gradient">My Orders</span>
      </h1>
      {!ready ? <div className="mt-6 h-32 animate-pulse rounded-3xl bg-white/5" /> : null}
      {ready && !profile ? (
        <p className="mt-6 text-muted">
          <Link to="/login" search={{ tab: undefined }} className="font-semibold text-fuchsia">
            Sign in
          </Link>{" "}
          to see receipts.
        </p>
      ) : null}
      {profile && orders.length === 0 ? <p className="mt-6 text-muted">No purchases yet.</p> : null}
      <div className="mt-6 grid gap-3">
        {orders.map((order) => (
          <article key={order.id} className="glass rounded-3xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{order.serviceName}</p>
                <p className="text-sm text-muted">
                  {order.packageName} · {order.targetId}
                </p>
              </div>
              <p className="font-bold tabular-nums">{formatUsd(order.priceCents)}</p>
            </div>
            <p className="mt-2 text-xs text-violet">
              {order.fulfillmentRef} · {order.status}
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
