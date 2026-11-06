"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { RoleBadge } from "@/components/role-badge";
import { BalanceEditor, PasswordSetter } from "@/components/admin-boxes";
import { ReceiptBadge } from "@/components/receipt-badge";
import { orderStatusText, requestStatusText, useI18n, useMoney } from "@/lib/i18n";
import { getUserDossier } from "@/lib/store/api";
import type { UserDossier } from "@/lib/store/types";

/** Admin-only full user inspector. Passwords are hashed and never shown. */
export function UserDossierModal({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { t, language } = useI18n();
  const money = useMoney();
  const [dossier, setDossier] = useState<UserDossier | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancel = false;
    setDossier(null);
    setError(null);
    void getUserDossier({ userId }).then((result) => {
      if (cancel) return;
      if (result.ok) setDossier(result.dossier);
      else setError(result.error);
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancel = true;
      window.removeEventListener("keydown", onKey);
    };
  }, [userId, onClose]);

  if (!userId || typeof document === "undefined") return null;
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleString(language === "ar" ? "ar-SY-u-nu-latn" : "en-US") : "—";
  const user = dossier?.user;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-md sm:p-6" role="presentation">
      <button type="button" aria-label={t.close} className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.dossierTitle}
        className="modal-pop relative max-h-[90vh] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-[var(--nc-card-solid)] p-4 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.16em] text-violet uppercase">{t.dossierTitle}</p>
            <h2 className="mt-1 truncate font-display text-2xl font-extrabold">{user?.name ?? "…"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t.close} className="grid min-h-[40px] min-w-[40px] place-items-center rounded-xl border border-white/10 hover:bg-white/5">
            <X className="size-4" />
          </button>
        </div>

        {error ? <p className="mt-4 text-sm text-rose-500">{error}</p> : null}
        {!user && !error ? <div className="mt-4 h-40 animate-pulse rounded-2xl bg-white/5" /> : null}

        {user ? (
          <>
            <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label={t.name} value={user.name} />
              <Field label={t.email} value={user.email} ltr />
              <Field label={t.passwordLabel} value={user.hasPassword ? t.passwordHashed : "—"} />
              <Field label={t.mobileNumber} value={user.phone || "—"} ltr />
              <Field label="IP" value={user.lastIp || "—"} ltr />
              <Field label={t.regDate} value={date(user.createdAt)} />
              <Field label={t.currencyShort} value={user.currency} ltr />
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <dt className="text-[11px] font-bold text-muted">{t.role}</dt>
                <dd className="mt-1">
                  <RoleBadge role={user.role} />
                </dd>
              </div>
              <Field label={t.accountStatus} value={user.isBlocked ? t.statusBlocked : t.statusActive} tone={user.isBlocked ? "bad" : "good"} />
              <Field label={t.currentBalance} value={money(user.balanceCents, user.currency)} ltr />
            </dl>

            <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 sm:grid-cols-2">
              <BalanceEditor userId={user.userId} currency={user.currency} />
              {user.role !== "ADMIN" ? <PasswordSetter userId={user.userId} /> : null}
            </div>

            <h3 className="mt-6 font-display text-lg font-extrabold">
              {t.purchases} <span className="text-sm text-muted">({dossier.orders.length})</span>
            </h3>
            <ul className="mt-2 grid gap-2">
              {dossier.orders.length === 0 ? <li className="text-sm text-muted">{t.noPurchases}</li> : null}
              {dossier.orders.map((order) => (
                <li key={order.id} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold">
                      <ReceiptBadge value={order.receiptNumber} />
                      {order.serviceName} · {order.packageName}
                    </span>
                    <span className="font-bold tabular-nums">{money(order.priceCents, order.currency)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    ID <span dir="ltr">{order.targetId}</span> · {date(order.createdAt)} · IP <span dir="ltr">{order.ipAddress || "—"}</span> ·{" "}
                    {orderStatusText(t, order.status)}
                  </p>
                </li>
              ))}
            </ul>

            <h3 className="mt-6 font-display text-lg font-extrabold">
              {t.topups} <span className="text-sm text-muted">({dossier.requests.length})</span>
            </h3>
            <ul className="mt-2 grid gap-2">
              {dossier.requests.length === 0 ? <li className="text-sm text-muted">{t.noRequests}</li> : null}
              {dossier.requests.map((item) => (
                <li key={item.id} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold">
                      <ReceiptBadge value={item.receiptNumber} />
                      {item.senderName || item.senderPhone || item.referenceNote}
                    </span>
                    <span className="font-bold tabular-nums">{money(item.cents, item.currency)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    #<span dir="ltr">{item.transferNumber || "—"}</span> · {date(item.createdAt)} · {requestStatusText(t, item.status)}
                    {item.processedAt ? ` · ${date(item.processedAt)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, value, ltr = false, tone }: { label: string; value: string; ltr?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
      <dt className="text-[11px] font-bold text-muted">{label}</dt>
      <dd
        className={`mt-0.5 truncate text-sm font-semibold ${tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-rose-500" : ""}`}
        dir={ltr ? "ltr" : undefined}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
