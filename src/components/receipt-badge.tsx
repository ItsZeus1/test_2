"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardCopy, Copy, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import type { Role } from "@/lib/store/types";

/** "#NC-849201" chip with 1-tap copy. */
export function ReceiptBadge({ value, className = "" }: { value: string; className?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          })
          .catch(() => undefined);
      }}
      title={t.copyReceipt}
      aria-label={`${t.copyReceipt}: ${value}`}
      className={`receipt-badge inline-flex min-h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-bold ${className}`}
      dir="ltr"
    >
      <span className="price-num text-[11px]">#{value}</span>
      {copied ? <Check className="size-3" /> : <Copy className="size-3 opacity-60" />}
    </button>
  );
}

/** Role pill (NORMAL / VIP / ADMIN). */
const ROLE_STYLES: Record<Role, string> = {
  NORMAL: "border-white/15 bg-white/5 text-white/80",
  VIP: "border-amber-200/50 bg-gradient-to-r from-amber-300/25 to-yellow-100/10 text-amber-100 shadow-[0_0_18px_-8px_rgba(251,191,36,0.9)]",
  ADMIN:
    "border-fuchsia-300/50 bg-gradient-to-r from-fuchsia-500/25 to-violet-500/20 text-fuchsia-100 shadow-[0_0_18px_-6px_rgba(56,189,248,0.85)]",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold tracking-[0.16em] ${ROLE_STYLES[role]}`}>
      {role}
    </span>
  );
}

/* ============================ Full receipt inspector ============================ */

export type ReceiptLine = { label: string; value: string; ltr?: boolean };
export type ReceiptData = {
  receipt: string;
  kind: string;
  title: string;
  amount: string;
  status: string;
  tone: "ok" | "wait" | "bad";
  lines: ReceiptLine[];
  createdAt: string;
  completedAt?: string | null;
};

/** Luxury ticket-style receipt with every transaction detail and a copy-for-support action. */
export function ReceiptModal({ data, onClose, children }: { data: ReceiptData | null; onClose: () => void; children?: ReactNode }) {
  const { language } = useI18n();
  const ar = language === "ar";
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!data) return;
    setCopied(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data?.receipt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || typeof document === "undefined") return null;
  const stamp = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString(ar ? "ar-SY-u-nu-latn" : "en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";
  const copyForSupport = () => {
    void navigator.clipboard
      ?.writeText(`#${data.receipt}`)
      .then(() => setCopied(true))
      .catch(() => undefined);
  };
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md" role="presentation">
      <button type="button" aria-label={ar ? "إغلاق" : "Close"} className="absolute inset-0 cursor-default" onClick={onClose} />
      <article role="dialog" aria-modal="true" aria-label={ar ? "تفاصيل الإيصال الكاملة" : "Full receipt"} className="receipt-ticket modal-pop relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-3xl">
        <header className="flex items-start gap-3 p-5 pb-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-[0.16em] text-muted uppercase">{ar ? "تفاصيل الإيصال الكاملة" : "Full receipt"}</p>
            <p className="mt-1 text-xs font-semibold text-muted">{data.kind}</p>
            <h2 className="item-name mt-0.5 text-lg font-extrabold">{data.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={ar ? "إغلاق" : "Close"} className="grid min-h-[40px] min-w-[40px] place-items-center rounded-xl border border-white/10 hover:bg-white/5">
            <X className="size-4" />
          </button>
        </header>
        <div className="px-5">
          <p className="price-num text-3xl" dir="ltr">
            {data.amount}
          </p>
          <span className={`receipt-status mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold is-${data.tone}`}>
            <span className="size-1.5 rounded-full bg-current" />
            {data.status}
          </span>
        </div>
        <div className="receipt-perforation my-4" aria-hidden />
        <dl className="grid gap-2.5 px-5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{ar ? "رقم العملية" : "Transaction #"}</dt>
            <dd className="price-num text-sm" dir="ltr">
              #{data.receipt}
            </dd>
          </div>
          {data.lines.map((line) => (
            <div key={line.label} className="flex items-start justify-between gap-3">
              <dt className="shrink-0 text-muted">{line.label}</dt>
              <dd className="min-w-0 text-end font-semibold break-words" dir={line.ltr ? "ltr" : undefined}>
                {line.value || "—"}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{ar ? "تاريخ الإنشاء" : "Created"}</dt>
            <dd className="font-semibold">{stamp(data.createdAt)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{ar ? "تاريخ الإنجاز" : "Completed"}</dt>
            <dd className="font-semibold">{stamp(data.completedAt)}</dd>
          </div>
        </dl>
        {children ? <div className="px-5 pt-3">{children}</div> : null}
        <div className="p-5">
          <button type="button" onClick={copyForSupport} className="receipt-copy keep-white flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-white">
            {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
            {ar ? "نسخ رقم العملية للدعم الفني" : "Copy Transaction # for Support"}
          </button>
          {copied ? (
            <p className="mt-2 text-center text-xs font-semibold text-emerald-500" role="status">
              {ar ? "✓ تم نسخ رقم العملية — يمكنك لصقه في محادثة الدعم" : "✓ Copied — paste it into your support chat"}
            </p>
          ) : null}
        </div>
      </article>
    </div>,
    document.body,
  );
}

