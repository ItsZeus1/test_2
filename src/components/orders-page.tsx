"use client";

import { useEffect, useState } from "react";
import { Link } from "@/lib/nav";
import { ReceiptBadge } from "@/components/receipt-badge";
import { VaultReveal } from "@/components/vault-reveal";
import { claimVault, listMyVault, type RevealedPiece } from "@/lib/vault-client";

import { useProfileState } from "@/components/profile";
import { listMyOrders, markVaultDelivered, onStoreChange } from "@/lib/store/api";
import { orderStatusText, useI18n, useMoney } from "@/lib/i18n";
import type { OrderRow } from "@/lib/store/types";

export function OrdersPage() {
  const { profile, ready } = useProfileState();
  const { t } = useI18n();
  const money = useMoney();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [vault, setVault] = useState<Record<string, RevealedPiece>>({});

  // Vault pieces come from the server (never from the shared data row). Unfinished vault
  // orders are retried once here.
  useEffect(() => {
    if (!orders.length) return;
    let cancel = false;
    void (async () => {
      const mine = await listMyVault();
      const byOrder: Record<string, RevealedPiece> = {};
      for (const piece of mine) if (piece.orderId) byOrder[piece.orderId] = piece;
      for (const order of orders.filter((item) => item.status === "PENDING_VAULT" && !byOrder[item.id])) {
        const claimed = await claimVault(order.id);
        if (claimed.ok) {
          byOrder[order.id] = { ...claimed.item, receiptNumber: order.receiptNumber };
          void markVaultDelivered(order.id);
        }
      }
      if (!cancel) setVault(byOrder);
    })();
    return () => {
      cancel = true;
    };
  }, [orders.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-display text-4xl font-extrabold">
        <span className="text-gradient">{t.orders}</span>
      </h1>
      <Link to="/wallet" className="mt-3 inline-flex min-h-10 items-center rounded-full border border-violet/40 px-4 text-sm font-semibold text-violet">
        {t.openWalletView}
      </Link>
      {!ready ? <div className="mt-6 h-32 animate-pulse rounded-3xl bg-white/5" /> : null}
      {ready && !profile ? (
        <p className="mt-6 text-muted">
          <Link to="/login" search={{ tab: undefined }} className="font-semibold text-fuchsia">
            {t.signIn}
          </Link>{" "}
          {t.signInReceipts}
        </p>
      ) : null}
      {profile && orders.length === 0 ? <p className="mt-6 text-muted">{t.noOrders}</p> : null}
      <div className="mt-6 grid gap-3">
        {orders.map((order) => (
          <article key={order.id} className="nova-grid-border glass rounded-3xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{order.serviceName}</p>
                <p className="text-sm text-muted">
                  {order.packageName} · {order.targetId}
                </p>
              </div>
              <p className="font-bold tabular-nums">{money(order.priceCents, order.currency)}</p>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-violet">
              <ReceiptBadge value={order.receiptNumber || order.fulfillmentRef} />
              <span>{orderStatusText(t, order.status)}</span>
            </p>
            {vault[order.id] ? <VaultReveal piece={vault[order.id]} compact /> : null}
          </article>
        ))}
      </div>
    </main>
  );
}
