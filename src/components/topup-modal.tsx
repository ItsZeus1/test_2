"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Copy, X } from "lucide-react";
import { toast } from "sonner";

import { useProfileState } from "@/components/profile";
import { useActionHud } from "@/components/action-loading-overlay";
import { ApprovalTimeBadge, ElapsedTimer } from "@/components/topup-timing";
import { requestStatusText, useI18n, useMoney } from "@/lib/i18n";
import {
  getPaymentAddresses,
  listMyBalanceRequests,
  submitBalanceRequest,
  topUpUser,
} from "@/lib/store/api";
import { currencyCode, dollarsToCents } from "@/lib/money";
import type { BalanceRequest, PaymentAddresses, PaymentMethod } from "@/lib/store/types";
import { PayEmblem, methodLabel } from "@/components/pay-emblem";
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
  const hud = useActionHud();
  const [senderName, setSenderName] = useState("");
  const [transferNumber, setTransferNumber] = useState("");
  const [custom, setCustom] = useState("");
  const [packCents, setPackCents] = useState<number | null>(null);
  const [addresses, setAddresses] = useState<PaymentAddresses | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [senderPhone, setSenderPhone] = useState("");
  const [copied, setCopied] = useState(false);
  const [mine, setMine] = useState<BalanceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!topUp || topUp.mode !== "self") return;
    let cancel = false;
    void Promise.all([getPaymentAddresses(), listMyBalanceRequests()]).then(([nextAddresses, rows]) => {
      if (cancel) return;
      setAddresses(nextAddresses);
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
    const address = method && addresses ? addresses[method] : "";
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
    if (!method) {
      setError(t.choosePayment);
      return;
    }
    const senderOk = method === "SHAMCASH" ? senderName.trim().length >= 2 : /^09\d{8}$/.test(senderPhone.replace(/[\s-]/g, ""));
    if (!senderOk || transferNumber.trim().length < 3) {
      setError(method === "SHAMCASH" ? t.fillAllFields : `${t.senderPhone}: 09XXXXXXXX`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await hud.run(
        "topup",
        `${methodLabel(t, method)} · ${money(amountCents, currency)}`,
        submitBalanceRequest({
          cents: amountCents,
          method,
          senderName: senderName.trim(),
          senderPhone: senderPhone.trim(),
          transferNumber: transferNumber.trim(),
        }),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMine((current) => [result.request, ...current]);
      setSenderName("");
      setSenderPhone("");
      setTransferNumber("");
      setMethod(null);
      setCustom("");
      setPackCents(null);
      toast.success(result.request?.receiptNumber ? `${t.requestSent} · #${result.request.receiptNumber}` : t.requestSent);
    } finally {
      setBusy(false);
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

  if (typeof document === "undefined") return null;
  // Portal to <body> so no transformed / blurred parent can pin it to the bottom.
  return createPortal(
    <>
      {hud.element}
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-md" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-title"
        className="glass relative my-auto max-h-[86vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-[#0284c7]/30 p-5 shadow-2xl sm:p-6"
      >
        <div className="pointer-events-none absolute -top-16 -end-10 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(14,165,233,0.55),transparent_70%)]" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#1e3a8a] uppercase">{t.wallet}</p>
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
            <p className="mb-2 text-xs font-bold tracking-[0.16em] text-muted uppercase">{t.stepAmount}</p>
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
                        ? "border border-[#0284c7] bg-[#0284c7]/25 shadow-[0_0_22px_-8px_rgba(14,165,233,0.95)]"
                        : "glass hover:border-[#0284c7]/70"
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
              <div className="mt-5">
                <p className="text-xs font-bold tracking-[0.16em] text-muted uppercase">{t.stepMethod}</p>
                <div className="mt-2 grid gap-2">
                  {(["SHAMCASH", "SYRIATEL_CASH", "MTN_CASH"] as const).map((id) => {
                    const open = method === id;
                    const sham = id === "SHAMCASH";
                    return (
                      <div key={id} className={`pay-card pay-${id.toLowerCase()} ${open ? "is-open" : ""}`}>
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => {
                            setMethod(open ? null : id);
                            setCopied(false);
                            setError(null);
                          }}
                          className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-start"
                        >
                          <PayEmblem method={id} />
                          <span className="min-w-0 flex-1 font-bold">{methodLabel(t, id)}</span>
                          <ChevronDown className="pay-chevron size-4 shrink-0 text-muted" />
                        </button>
                        <div className="pay-body">
                          <div className="min-h-0 overflow-hidden">
                            <div className="px-3 pb-3">
                              <p className="text-xs font-semibold text-muted">{t.walletAddressFor}</p>
                              <div className="mt-1.5 flex items-center gap-2">
                                <code dir="ltr" className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold">
                                  {addresses?.[id] ?? "…"}
                                </code>
                                <button
                                  type="button"
                                  tabIndex={open ? 0 : -1}
                                  onClick={() => void copyAddress()}
                                  className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-white/15 px-3 text-xs font-bold"
                                >
                                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                                  {copied ? t.copied : t.copyAddress}
                                </button>
                              </div>
                              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {sham ? (
                                  <label className="block text-xs font-bold text-muted">
                                    {t.senderName} <span className="text-rose-500" aria-hidden>*</span>
                                    <input
                                      value={senderName}
                                      tabIndex={open ? 0 : -1}
                                      autoComplete="name"
                                      onChange={(event) => setSenderName(event.target.value)}
                                      placeholder={t.senderNamePh}
                                      className="field mt-1.5 font-normal"
                                    />
                                  </label>
                                ) : (
                                  <label className="block text-xs font-bold text-muted">
                                    {t.senderPhone} <span className="text-rose-500" aria-hidden>*</span>
                                    <input
                                      value={senderPhone}
                                      tabIndex={open ? 0 : -1}
                                      dir="ltr"
                                      type="tel"
                                      inputMode="numeric"
                                      maxLength={10}
                                      autoComplete="tel-national"
                                      onChange={(event) => setSenderPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                                      placeholder={t.senderPhonePh}
                                      className="field mt-1.5 font-normal"
                                    />
                                  </label>
                                )}
                                <label className="block text-xs font-bold text-muted">
                                  {t.transferNumber} <span className="text-rose-500" aria-hidden>*</span>
                                  <input
                                    value={transferNumber}
                                    tabIndex={open ? 0 : -1}
                                    dir="ltr"
                                    autoComplete="off"
                                    onChange={(event) => setTransferNumber(event.target.value)}
                                    placeholder={t.transferNumberPh}
                                    className="field mt-1.5 font-normal"
                                  />
                                </label>
                              </div>
                              <ApprovalTimeBadge className="mt-3" />
                              <p className="mt-2 text-sm">
                                {t.amount}: <span className="price-num">{money(amountCents, currency)}</span>
                              </p>
                              <button
                                type="button"
                                tabIndex={open ? 0 : -1}
                                disabled={
                                  busy ||
                                  transferNumber.trim().length < 3 ||
                                  (sham ? senderName.trim().length < 2 : senderPhone.length !== 10)
                                }
                                onClick={() => void sendRequest()}
                                className="btn-glow keep-white mt-3 min-h-11 w-full rounded-full text-sm font-semibold text-white disabled:opacity-60"
                              >
                                {busy ? t.wait : t.submitRequest}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                        {money(item.cents, item.currency)} · {item.receiptNumber ? `#${item.receiptNumber}` : item.transferNumber ? `#${item.transferNumber}` : item.referenceNote}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-[#1e3a8a]">
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
    </>,
    document.body,
  );
}
