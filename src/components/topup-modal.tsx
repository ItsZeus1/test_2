"use client";

import { useEffect, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { toast } from "sonner";

import { useProfileState } from "@/components/profile";
import { ActionLoadingOverlay, withMinDelay } from "@/components/action-loading-overlay";
import { ApprovalTimeBadge, ElapsedTimer } from "@/components/topup-timing";
import { requestStatusText, useI18n, useMoney } from "@/lib/i18n";
import {
  getShamcashAddress,
  listMyBalanceRequests,
  submitBalanceRequest,
  topUpUser,
} from "@/lib/store/api";
import { currencyCode, dollarsToCents } from "@/lib/money";
import type { BalanceRequest } from "@/lib/store/types";
import { useNovaUi } from "@/lib/ui-store";

// Quick amounts in major units; the wallet currency decides the scale.
const PACKS: Record<"USD" | "SYP", number[]> = {
  USD: [10, 25, 50, 100, 250],
  SYP: [1000, 2500, 5000, 10000, 25000],
};

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
}

export function TopUpModal() {
  const { t, language } = useI18n();
  const money = useMoney();
  const topUp = useNovaUi((state) => state.topUp);
  const closeTopUp = useNovaUi((state) => state.closeTopUp);
  const { profile } = useProfileState();
  const [busy, setBusy] = useState(false);
  const [sendingTopup, setSendingTopup] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [transferNumber, setTransferNumber] = useState("");
  const [custom, setCustom] = useState("");
  const [packCents, setPackCents] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [mine, setMine] = useState<BalanceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!topUp || topUp.mode !== "self") return;
    let cancel = false;
    void Promise.all([getShamcashAddress(), listMyBalanceRequests()]).then(([nextAddress, rows]) => {
      if (cancel) return;
      setAddress(nextAddress);
      setMine(rows);
    });
    return () => {
      cancel = true;
    };
  }, [topUp]);

  if (!topUp) return null;

  const currency = topUp.mode === "self" ? (profile?.currency ?? "USD") : (topUp.currency ?? "USD");
  const unit = currencyCode(currency, language);

  const amountCents = packCents ?? (custom.trim() ? dollarsToCents(custom) : null);

  async function copyAddress() {
    if (!address) return;
    await copyText(address);
    setCopied(true);
    toast.success(t.copied);
  }

  async function sendRequest() {
    if (amountCents == null || amountCents < 100) {
      setError(t.badAmount);
      return;
    }
    if (senderName.trim().length < 2 || transferNumber.trim().length < 3) {
      setError(t.fillAllFields);
      return;
    }
    setBusy(true);
    setSendingTopup(true);
    setError(null);
    try {
      const result = await withMinDelay(
        submitBalanceRequest({ cents: amountCents, senderName: senderName.trim(), transferNumber: transferNumber.trim() }),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMine((current) => [result.request, ...current]);
      setSenderName("");
      setTransferNumber("");
      setCustom("");
      setPackCents(null);
      toast.success(t.requestSent);
    } finally {
      setBusy(false);
      setSendingTopup(false);
    }
  }

  async function creditUser() {
    if (topUp?.mode !== "user") return;
    const cents = dollarsToCents(custom);
    if (cents == null || cents < 100) {
      setError(t.minDollar);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await topUpUser({ userId: topUp.userId, cents });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`${t.added} ${money(cents, currency)}`);
      setCustom("");
      closeTopUp();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ActionLoadingOverlay action={sendingTopup ? "topup" : null} />
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-3 backdrop-blur-md sm:place-items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-title"
        className="glass relative max-h-[min(92vh,44rem)] w-[95vw] overflow-y-auto rounded-[1.75rem] border border-fuchsia/30 p-5 shadow-[0_0_48px_-14px_rgba(232,121,249,0.85)] sm:max-w-md sm:p-6"
      >
        <div className="pointer-events-none absolute -top-16 -end-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.55),transparent_70%)]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.2em] text-fuchsia uppercase">{t.wallet}</p>
            <h2 id="topup-title" className="font-display text-3xl font-extrabold">
              <span className="text-gradient">{topUp.mode === "self" ? t.topUpTitle : `${t.creditUser} ${topUp.name}`}</span>
            </h2>
            {profile && topUp.mode === "self" ? (
              <p className="mt-1 text-sm text-muted">
                {t.walletIs} <span className="font-semibold text-white tabular-nums">{money(profile.balanceCents, currency)}</span>
              </p>
            ) : null}
          </div>
          <button type="button" aria-label={t.close} onClick={closeTopUp} className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10">
            <X className="size-4" />
          </button>
        </div>

        {topUp.mode === "self" ? (
          <div className="relative mt-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PACKS[currency].map((major) => {
                const pack = { cents: major * 100, label: money(major * 100, currency) };
                const active = packCents === pack.cents;
                return (
                  <button
                    key={pack.cents}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPackCents(pack.cents);
                      setCustom("");
                      setError(null);
                      setCopied(false);
                    }}
                    className={`min-h-16 rounded-2xl text-lg font-extrabold disabled:opacity-60 ${
                      active
                        ? "border border-violet bg-violet/25 shadow-[0_0_22px_-8px_rgba(139,92,246,0.95)]"
                        : "glass hover:border-violet/70"
                    }`}
                  >
                    {pack.label}
                  </button>
                );
              })}
            </div>

            <label className="mt-4 block text-xs font-bold tracking-[0.16em] text-muted uppercase">
              {t.customAmount} ({unit})
              <input
                value={custom}
                onChange={(event) => {
                  setCustom(event.target.value);
                  setPackCents(null);
                  setError(null);
                }}
                placeholder={currency === "SYP" ? "5000" : "20.00"}
                className="field mt-2 font-normal tracking-normal normal-case"
                inputMode="decimal"
                dir="ltr"
              />
            </label>

            {amountCents != null ? (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
                <p className="text-[11px] font-bold tracking-[0.16em] text-fuchsia uppercase">{t.shamcash}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t.shamInstructions}</p>
                <div className="mt-3 flex items-center gap-2">
                  <code dir="ltr" className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold">
                    {address || "…"}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyAddress()}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-white/15 px-3 text-xs font-bold"
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? t.copied : t.copyAddress}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-muted">
                    {t.senderName} <span className="text-rose-500" aria-hidden>*</span>
                    <input
                      value={senderName}
                      required
                      autoComplete="name"
                      onChange={(event) => setSenderName(event.target.value)}
                      placeholder={t.senderNamePh}
                      className="field mt-1.5 font-normal"
                    />
                  </label>
                  <label className="block text-xs font-bold text-muted">
                    {t.transferNumber} <span className="text-rose-500" aria-hidden>*</span>
                    <input
                      value={transferNumber}
                      required
                      dir="ltr"
                      inputMode="text"
                      autoComplete="off"
                      onChange={(event) => setTransferNumber(event.target.value)}
                      placeholder={t.transferNumberPh}
                      className="field mt-1.5 font-normal"
                    />
                  </label>
                </div>
                <ApprovalTimeBadge className="mt-3" />
                <p className="mt-2 text-sm">
                  {t.amount}: <span className="font-semibold tabular-nums">{money(amountCents, currency)}</span>
                  <span className="ms-2 text-amber-100">{t.statusProcessing}</span>
                </p>
                <button
                  type="button"
                  disabled={busy || amountCents == null || senderName.trim().length < 2 || transferNumber.trim().length < 3}
                  onClick={() => void sendRequest()}
                  className="btn-glow mt-3 min-h-11 w-full rounded-full text-sm font-semibold disabled:opacity-60"
                >
                  {busy ? t.wait : t.submitRequest}
                </button>
              </div>
            ) : null}

            <div className="mt-4">
              <p className="text-xs font-bold tracking-[0.16em] text-muted uppercase">{t.yourRequests}</p>
              {mine.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t.noRequests}</p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                  {mine.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate" dir="ltr">
                        {money(item.cents, item.currency)} · {item.transferNumber ? `#${item.transferNumber}` : item.referenceNote}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-violet">
                        {requestStatusText(t, item.status)}
                        {item.status === "PROCESSING" ? (
                          <span className="ms-1 text-amber-500">
                            · <ElapsedTimer since={item.createdAt} />
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="relative mt-5">
            <label className="text-sm font-semibold" htmlFor="admin-credit">
              {t.amount} ({unit})
            </label>
            <input
              id="admin-credit"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder={currency === "SYP" ? "5000" : "25.00"}
              className="field mt-2"
              inputMode="decimal"
              dir="ltr"
            />
            <button type="button" disabled={busy} onClick={() => void creditUser()} className="btn-glow mt-4 min-h-12 w-full rounded-full text-sm font-semibold disabled:opacity-60">
              {busy ? t.wait : t.addToBalance}
            </button>
          </div>
        )}
        {error ? <p className="relative mt-3 text-sm text-rose-200">{error}</p> : null}
      </div>
    </div>
    </>
  );
}
