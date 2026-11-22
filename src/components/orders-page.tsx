"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Receipt, RefreshCw, ScrollText, SlidersHorizontal } from "lucide-react";
import { Link } from "@/lib/nav";
import { ReceiptBadge, ReceiptModal, type ReceiptData } from "@/components/receipt-badge";
import { VaultReveal, type VoucherMeta } from "@/components/vault-reveal";
import { claimVault, listMyVault, type RevealedPiece } from "@/lib/vault-client";

import { useProfileState } from "@/components/profile";
import { listMyLedger, listMyOrders, markVaultDelivered, onStoreChange, pokeMegaOrders } from "@/lib/store/api";
import { orderStatusText, useI18n, useMoney } from "@/lib/i18n";
import type { OrderRow, WalletLedgerEntry } from "@/lib/store/types";

export function OrdersPage() {
  const { profile, ready } = useProfileState();
  const { t } = useI18n();
  const money = useMoney();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [vault, setVault] = useState<Record<string, RevealedPiece>>({});
  const [open, setOpen] = useState<OrderRow | null>(null);
  const { language } = useI18n();
  const ar = language === "ar";
  // v35: "orders" | "statement" (كشف حساب المحفظة) — /orders?view=statement opens the statement.
  const [view, setView] = useState<"orders" | "statement">("orders");
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "statement") setView("statement");
  }, []);
  function pickView(next: "orders" | "statement") {
    setView(next);
    const url = new URL(window.location.href);
    if (next === "statement") url.searchParams.set("view", "statement");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  const voucherMeta = (order: OrderRow): VoucherMeta => ({
    serviceName: order.serviceName,
    packageName: order.packageName,
    orderRef: order.receiptNumber || order.fulfillmentRef,
    date: new Date(order.resolvedAt ?? order.createdAt).toLocaleString(ar ? "ar-SY-u-nu-latn" : "en-US", { dateStyle: "medium", timeStyle: "short" }),
  });
  const toReceipt = (order: OrderRow): ReceiptData => ({
    receipt: order.receiptNumber || order.fulfillmentRef,
    kind: order.status === "PENDING_VAULT" || vault[order.id] ? (ar ? "خزنة رقمية" : "Digital vault") : ar ? "طلب شحن" : "Top-up order",
    title: order.serviceName,
    amount: money(order.priceCents, order.currency),
    status: orderStatusText(t, order.status),
    tone: order.status === "DECLINED" || order.status === "failed" ? "bad" : order.status.startsWith("PENDING") || order.status === "PROCESSING" ? "wait" : "ok",
    lines: [
      { label: ar ? "الباقة / الكمية" : "Package / amount", value: order.packageName },
      // v31: every custom field the customer filled in, or the single ID.
      ...(order.fields?.length
        ? order.fields.map((field) => ({ label: (ar ? field.labelAr || field.labelEn : field.labelEn || field.labelAr) || "—", value: field.value }))
        : [{ label: ar ? "المعرّف / الرقم" : "Player ID / phone", value: order.targetId, ltr: true }]),
      { label: ar ? "العملة" : "Currency", value: order.currency },
    ],
    createdAt: order.createdAt,
    completedAt: order.resolvedAt ?? (order.status.startsWith("PENDING") ? null : order.createdAt),
  });

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

  // v37: while an automatic (Mega) order is still running, ask the server to check it every 15 s.
  const running = orders.some((order) => order.tracking && order.status === "processing");
  useEffect(() => {
    if (!running) return;
    pokeMegaOrders();
    const timer = window.setInterval(pokeMegaOrders, 15_000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!profile) return;
    let cancel = false;
    const load = () => {
      void listMyOrders().then((rows) => {
        if (!cancel) setOrders(rows);
      });
      void listMyLedger().then((rows) => {
        if (!cancel) setLedger(rows);
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
      <Link to="/wallet" className="mt-3 inline-flex min-h-10 items-center rounded-full border border-[#0284c7]/40 px-4 text-sm font-semibold text-[#1e3a8a]">
        {t.openWalletView}
      </Link>
      {!ready ? <div className="mt-6 h-32 animate-pulse rounded-3xl bg-white/5" /> : null}
      {ready && !profile ? (
        <p className="mt-6 text-muted">
          <Link to="/login" search={{ tab: undefined }} className="font-semibold text-[#1e3a8a]">
            {t.signIn}
          </Link>{" "}
          {t.signInReceipts}
        </p>
      ) : null}
      {profile ? (
        <div role="tablist" aria-label={ar ? "طلباتي وكشف الحساب" : "Orders and statement"} className="ledger-tabs mt-5 grid grid-cols-2 gap-1 rounded-[18px] p-1 sm:max-w-md">
          {([
            ["orders", ar ? "طلباتي" : "My orders", Receipt],
            ["statement", ar ? "📊 كشف حساب المحفظة" : "📊 Wallet Statement", ScrollText],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => pickView(id)}
              className={`seg-pill inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[14px] px-3 text-sm font-bold ${view === id ? "is-on" : ""}`}
            >
              {id === "orders" ? <Icon className="size-4" aria-hidden /> : null}
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {profile && view === "statement" ? <WalletStatement entries={ledger} ar={ar} money={(cents) => money(cents, profile.currency)} balance={money(profile.balanceCents, profile.currency)} /> : null}
      {profile && view === "orders" && orders.length === 0 ? <p className="mt-6 text-muted">{t.noOrders}</p> : null}
      <div className={`mt-6 grid gap-3 ${view === "orders" ? "" : "hidden"}`}>
        {orders.map((order) => (
          <article
            key={order.id}
            role="button"
            tabIndex={0}
            onClick={() => setOpen(order)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") setOpen(order);
            }}
            className="nova-grid-border glass cursor-pointer rounded-3xl p-4 transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{order.serviceName}</p>
                <p className="text-sm text-muted">
                  {order.packageName} · {order.targetId}
                </p>
              </div>
              <p className="font-bold tabular-nums">{money(order.priceCents, order.currency)}</p>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#1e3a8a]">
              <ReceiptBadge value={order.receiptNumber || order.fulfillmentRef} />
              <span>{orderStatusText(t, order.status)}</span>
            </p>
            {order.tracking ? <OrderTracking order={order} ar={ar} compact /> : null}
            {vault[order.id] ? <VaultReveal piece={vault[order.id]} compact /> : null}
          </article>
        ))}
      </div>
      <ReceiptModal data={open ? toReceipt(open) : null} onClose={() => setOpen(null)}>
        {/* v30: the purchased code / account stays here for good, with copy + voucher photo. */}
        {open && vault[open.id] ? (
          <div className="pb-2">
            <VaultReveal piece={vault[open.id]} meta={voucherMeta(open)} />
          </div>
        ) : null}
        {open?.tracking ? (
          <div className="px-5 pb-3">
            <OrderTracking order={open} ar={ar} />
          </div>
        ) : null}
      </ReceiptModal>
    </main>
  );
}

/** v35 · كشف حساب المحفظة: every +top-up, −purchase and +refund with the balance after each line. */
function WalletStatement({ entries, ar, money, balance }: { entries: WalletLedgerEntry[]; ar: boolean; money: (cents: number) => string; balance: string }) {
  const stamp = (iso: string) => new Date(iso).toLocaleString(ar ? "ar-SY-u-nu-latn" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  const icon = (entry: WalletLedgerEntry) =>
    entry.type === "PURCHASE" ? ArrowUpRight : entry.type === "REFUND" ? RefreshCw : entry.type === "ADMIN_ADJUST" ? SlidersHorizontal : ArrowDownLeft;
  return (
    <section className="mt-5" aria-labelledby="statement-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="statement-title" className="font-display text-lg font-extrabold">
          {ar ? "كشف حساب المحفظة" : "Wallet statement"}
        </h2>
        <p className="text-sm text-muted">
          {ar ? "الرصيد الحالي" : "Current balance"}:{" "}
          <span className="price-num font-extrabold text-[color:inherit]" dir="ltr">
            {balance}
          </span>
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="ledger-row mt-3 rounded-[18px] px-4 py-8 text-center text-sm text-muted">{ar ? "لا توجد حركات على المحفظة بعد." : "No wallet activity yet."}</p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {entries.map((entry) => {
            const Icon = icon(entry);
            const positive = entry.amountUsd > 0;
            return (
              <li key={entry.id} className="ledger-row grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] px-3 py-3 sm:px-4">
                <span className={`grid size-10 place-items-center rounded-[12px] ${positive ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" : "bg-sky-500/12 text-sky-700 dark:text-sky-300"}`}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{ar ? entry.labelAr : entry.labelEn}</span>
                  <span className="block text-[11px] text-muted">
                    {stamp(entry.createdAt)}
                    {entry.referenceId && /^(TOP|ZC|NC)-/.test(entry.referenceId) ? (
                      <>
                        {" · "}
                        <span dir="ltr">#{entry.referenceId}</span>
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="text-end">
                  <span className={`price-num block text-sm font-extrabold ${positive ? "ledger-in" : "ledger-out"}`} dir="ltr">
                    {positive ? "+" : "−"}
                    {money(Math.abs(entry.amountUsd))}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {ar ? "الرصيد بعدها" : "Balance after"}:{" "}
                    <span className="price-num" dir="ltr">
                      {money(entry.balanceAfterUsd)}
                    </span>
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** v37 · automatic order tracking: paid → sent → processing → completed (+ codes) / refunded. */
const TRACK_STEPS = ["queued", "processing", "completed"] as const;

function trackLabel(status: string, ar: boolean): string {
  const labels: Record<string, [string, string]> = {
    queued: ["تم الدفع", "Paid"],
    unknown: ["جارٍ التأكيد", "Confirming"],
    processing: ["قيد التنفيذ", "Processing"],
    pending: ["قيد الانتظار", "Pending"],
    awaiting_response: ["بانتظار مراجعة", "Under review"],
    completed: ["تم التنفيذ", "Completed"],
    cancelled: ["أُلغي وأُعيد المبلغ", "Cancelled · refunded"],
    error: ["قيد المراجعة اليدوية", "Manual review"],
  };
  const row = labels[status];
  return row ? (ar ? row[0] : row[1]) : status;
}

function OrderTracking({ order, ar, compact = false }: { order: OrderRow; ar: boolean; compact?: boolean }) {
  const track = order.tracking!;
  const failed = track.status === "cancelled" || track.status === "error" || track.status === "awaiting_response";
  const reached = track.status === "completed" ? 2 : ["processing", "pending", "unknown", "awaiting_response", "error"].includes(track.status) ? 1 : track.status === "cancelled" ? 1 : 0;
  return (
    <div className={compact ? "mt-3" : "mt-1"} onClick={(event) => event.stopPropagation()}>
      <ol className="flex items-center gap-1.5" aria-label={ar ? "مراحل الطلب" : "Order steps"}>
        {TRACK_STEPS.map((stepName, index) => {
          const done = index < reached || (index === reached && track.status === "completed");
          const current = index === reached;
          const bad = failed && current;
          return (
            <li key={stepName} className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold ${
                  bad ? "bg-rose-500 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400"
                } ${current && !bad && track.status !== "completed" ? "animate-pulse" : ""}`}
                aria-hidden
              >
                {bad ? "!" : done ? "✓" : index + 1}
              </span>
              <span className={`min-w-0 truncate text-[11px] font-bold ${current ? "" : "text-muted"}`}>
                {current ? trackLabel(track.status, ar) : trackLabel(stepName, ar)}
              </span>
              {index < TRACK_STEPS.length - 1 ? <span className={`h-0.5 min-w-3 flex-1 rounded ${index < reached ? "bg-emerald-500" : "bg-slate-200 dark:bg-white/10"}`} aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
      {track.codes?.length ? (
        <div className="mt-2 grid gap-1.5">
          {track.codes.map((code) => (
            <div key={code} className="flex items-center gap-2 rounded-[12px] bg-emerald-500/10 px-3 py-2">
              <code dir="ltr" className="min-w-0 flex-1 truncate text-sm font-extrabold tracking-wide">
                {code}
              </code>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(code)}
                className="min-h-9 shrink-0 rounded-full border border-emerald-500/40 px-3 text-xs font-bold text-emerald-700 dark:text-emerald-300"
              >
                {ar ? "نسخ" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {!compact && track.note ? <p className="mt-2 text-xs text-muted" dir="auto">{track.note}</p> : null}
      {!compact && track.history.length ? (
        <ol className="mt-2 grid gap-0.5 text-[11px] text-muted">
          {track.history.map((item, index) => (
            <li key={index} dir="auto">
              {new Date(item.at).toLocaleString(ar ? "ar-SY-u-nu-latn" : "en-US", { dateStyle: "short", timeStyle: "short" })} · {trackLabel(item.status, ar)}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
