"use client";

import { useProfileState } from "@/components/profile";
import { SyriaGreenFlagIcon } from "@/components/pay-emblem";
import { useI18n } from "@/lib/i18n";
import { useNovaUi } from "@/lib/ui-store";
import type { Currency } from "@/lib/store/types";

/** Quick USD / SYP preview for logged-out visitors. Signed-in users are locked to their account currency. */
export function CurrencyPreviewSwitch({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const { profile, ready } = useProfileState();
  const current = useNovaUi((state) => state.previewCurrency);
  const setPreviewCurrency = useNovaUi((state) => state.setPreviewCurrency);
  if (profile || !ready) return null;
  const options: Array<{ id: Currency; label: string }> = [
    { id: "USD", label: "USD $" },
    { id: "SYP", label: "SYP ل.س" },
  ];
  return (
    <div className={`flex shrink-0 items-center rounded-full border border-white/15 bg-white/5 p-0.5 text-xs font-bold ${className}`} role="group" aria-label={t.currencyPreview}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={current === option.id}
          onClick={() => setPreviewCurrency(option.id)}
          className={`min-h-9 rounded-full px-2.5 ${current === option.id ? "keep-white bg-gradient-to-r from-indigo to-[#0284c7] text-white" : "text-muted"}`}
        >
          <span className="inline-flex items-center gap-1.5">
            {option.id === "SYP" ? <SyriaGreenFlagIcon className="h-3 w-[1.1rem]" /> : null}
            {option.label}
          </span>
        </button>
      ))}
    </div>
  );
}
