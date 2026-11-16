"use client";

import { useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";

import { ReceiptBadge } from "@/components/receipt-badge";
import { useI18n } from "@/lib/i18n";
import type { RevealedPiece } from "@/lib/vault-client";

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <div className="vault-row flex min-w-0 items-center gap-2 rounded-xl px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-muted">{label}</p>
        <p className="price-num truncate text-sm select-all" dir="ltr" title={value}>
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard?.writeText(value).then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1400);
          })
        }
        aria-label={`${t.copied}: ${label}`}
        className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-white/15 px-2.5 text-xs font-bold"
      >
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {done ? t.copied : ""}
      </button>
    </div>
  );
}

/** High-security reveal card for a purchased vault piece (email + password + extra info). */
export function VaultReveal({ piece, compact = false }: { piece: RevealedPiece; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <section className={`vault-card ${compact ? "mt-2 p-3" : "mt-3 p-4"} rounded-2xl`}>
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="size-4 text-emerald-500" />
        <h3 className="text-sm font-extrabold">{t.vaultRevealTitle}</h3>
        {piece.receiptNumber ? <ReceiptBadge value={piece.receiptNumber} className="ms-auto" /> : null}
      </div>
      <div className="mt-2 grid gap-1.5">
        <CopyRow label={t.vaultEmail} value={piece.email} />
        <CopyRow label={t.vaultPassword} value={piece.password} />
        <CopyRow label={t.vaultExtra} value={piece.extraInfo} />
      </div>
      {!compact ? <p className="mt-2 text-xs text-muted">{t.vaultKeep}</p> : null}
    </section>
  );
}
