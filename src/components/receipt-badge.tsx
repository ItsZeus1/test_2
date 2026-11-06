"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

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
    "border-fuchsia-300/50 bg-gradient-to-r from-fuchsia-500/25 to-violet-500/20 text-fuchsia-100 shadow-[0_0_18px_-6px_rgba(217,70,239,0.85)]",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-bold tracking-[0.16em] ${ROLE_STYLES[role]}`}>
      {role}
    </span>
  );
}
