"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { useI18n } from "@/lib/i18n";

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
