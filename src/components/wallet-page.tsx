"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus, ShoppingBag, Wallet } from "lucide-react";

import { useProfileState } from "@/components/profile";
import { ApprovalTimeBadge, ElapsedTimer } from "@/components/topup-timing";
import { useI18n, useMoney } from "@/lib/i18n";
import { Link } from "@/lib/nav";
import { listMyBalanceRequests, listMyTransactions, onStoreChange } from "@/lib/store/api";
import type { BalanceRequest, WalletTxn } from "@/lib/store/types";
import { useNovaUi } from "@/lib/ui-store";

type Preset = "all" | "month" | "30d" | "custom";

const iso = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

export function WalletPage() {
  const { t, language } = useI18n();
  const money = useMoney();
  const { profile, ready } = useProfileState();
  const openSelfTopUp = useNovaUi((state) => state.openSelfTopUp);
  const [txns, setTxns] = useState<WalletTxn[]>([]);
  const [requests, setRequests] = useState<BalanceRequest[]>([]);
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!profile) return;
    let cancel = false;
    const load = () => {
      void Promise.all([listMyTransactions(), listMyBalanceRequests()]).then(([rows, reqs]) => {
        if (cancel) return;
        setTxns(rows);
        setRequests(reqs);
      });
    };
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, [profile?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyPreset(next: Preset) {
    setPreset(next);
    const today = new Date();
    if (next === "all") {
      setFrom("");
      setTo("");
    } else if (next === "month") {
      setFrom(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
      setTo(iso(today));
    } else if (next === "30d") {
      setFrom(iso(new Date(today.getTime() - 29 * 86_400_000)));
      setTo(iso(today));
    }
  }

  const filtered = useMemo(() => {
    return txns.filter((txn) => {
      const day = iso(new Date(txn.createdAt));
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }, [txns, from, to]);

  const totals = useMemo(() => {
    let topups = 0;
    let purchases = 0;
    for (const txn of filtered) {
      if (txn.kind === "purchase") purchases += Math.abs(txn.cents);
      else if (txn.cents > 0) topups += txn.cents;
    }
    return { topups, purchases };
  }, [filtered]);

  if (!ready) {
    return <main className="mx-auto max-w-5xl px-4 py-10"><div className="h-40 animate-pulse rounded-3xl bg-white/5" /></main>;
  }
  if (!profile) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <Wallet className="mx-auto size-8 text-violet" />
        <h1 className="mt-3 font-display text-2xl font-extrabold">{t.walletTitle}</h1>
        <Link to="/login" search={{ tab: undefined }} className="btn-glow keep-white mt-6 inline-flex min-h-12 items-center rounded-2xl px-6 text-sm font-bold text-white">
          {t.signIn}
        </Link>
      </main>
    );
  }

  const currency = profile.currency;
  const pending = requests.filter((item) => item.status === "PROCESSING");
  const kindLabel = (kind: WalletTxn["kind"]) =>
    kind === "purchase" ? t.kindPurchase : kind === "admin_topup" ? t.kindAdminTopup : kind === "refund" ? t.kindRefund : t.kindTopup;
  const presets: Array<{ id: Preset; label: string }> = [
    { id: "all", label: t.allTime },
    { id: "month", label: t.thisMonth },
    { id: "30d", label: t.last30 },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
          <span className="text-gradient">{t.walletTitle}</span>
        </h1>
        <button type="button" onClick={openSelfTopUp} className="btn-glow keep-white inline-flex min-h-11 items-center gap-1.5 rounded-2xl px-4 text-sm font-bold text-white">
          <Plus className="size-4" />
          {t.topUpShort}
        </button>
      </div>

      <ApprovalTimeBadge className="mt-4" />

      {/* Summary */}
      <section className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard icon={Wallet} label={t.currentBalance} value={money(profile.balanceCents, currency)} accent="from-indigo-500 to-cyan-500" />
        <StatCard icon={ArrowDownLeft} label={t.totalTopups} value={money(totals.topups, currency)} accent="from-emerald-500 to-teal-500" />
        <StatCard icon={ShoppingBag} label={t.totalPurchases} value={money(totals.purchases, currency)} accent="from-violet-500 to-fuchsia-500" />
      </section>

      {/* Date range */}
      <section className="glass mt-5 rounded-3xl p-4">
        <div className="flex flex-wrap gap-2">
          {presets.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={preset === item.id}
              onClick={() => applyPreset(item.id)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${preset === item.id ? "keep-white bg-gradient-to-r from-indigo-500 to-violet-500 text-white" : "border border-white/10 bg-white/5 text-muted"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-muted">
            {t.fromDate}
            <input
              type="date"
              className="field mt-1"
              dir="ltr"
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setFrom(event.target.value);
                setPreset("custom");
              }}
            />
          </label>
          <label className="block text-xs font-semibold text-muted">
            {t.toDate}
            <input
              type="date"
              className="field mt-1"
              dir="ltr"
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setTo(event.target.value);
                setPreset("custom");
              }}
            />
          </label>
        </div>
      </section>

      {pending.length ? (
        <section className="mt-5">
          <h2 className="font-display text-lg font-extrabold">{t.pendingTopups}</h2>
          <ul className="mt-2 grid gap-2">
            {pending.map((item) => (
              <li key={item.id} className="glass flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm">
                <span className="font-semibold tabular-nums">{money(item.cents, item.currency)}</span>
                <span className="text-muted" dir="ltr">
                  {item.receiptNumber ? `#${item.receiptNumber}` : `#${item.transferNumber || item.referenceNote}`}
                </span>
                <span className="inline-flex items-center gap-1 text-amber-500">
                  {t.pendingFor} <ElapsedTimer since={item.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="font-display text-lg font-extrabold">{t.activity}</h2>
        {filtered.length === 0 ? (
          <p className="glass mt-2 rounded-2xl px-4 py-8 text-center text-sm text-muted">{t.noActivity}</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {filtered.map((txn) => {
              const positive = txn.cents > 0;
              return (
                <li key={txn.id} className="glass flex min-w-0 items-center gap-3 rounded-2xl px-3 py-3 sm:px-4">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${positive ? "bg-emerald-500/12 text-emerald-500" : "bg-violet-500/12 text-violet"}`}>
                    {positive ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{kindLabel(txn.kind)} · {txn.note}</p>
                    <p className="text-xs text-muted">{new Date(txn.createdAt).toLocaleString(language === "ar" ? "ar-SY-u-nu-latn" : "en-US")}</p>
                  </div>
                  <span className={`shrink-0 font-display text-sm font-extrabold tabular-nums ${positive ? "text-emerald-500" : ""}`} dir="ltr">
                    {positive ? "+" : "−"}
                    {money(Math.abs(txn.cents), currency)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Wallet; label: string; value: string; accent: string }) {
  return (
    <div className="nova-grid-border glass rounded-3xl p-4 sm:p-5">
      <span className={`keep-white grid size-10 place-items-center rounded-xl bg-gradient-to-br ${accent} text-white`}>
        <Icon className="size-5" />
      </span>
      <p className="mt-3 text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 truncate font-display text-2xl font-extrabold tabular-nums" dir="ltr">
        {value}
      </p>
    </div>
  );
}
