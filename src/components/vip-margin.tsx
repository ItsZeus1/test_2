"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { useProfileState } from "@/components/profile";
import { useI18n } from "@/lib/i18n";
import { setVipProfitMargin } from "@/lib/store/api";

const STEPS = [0, 5, 10, 15, 20, 25];

/** Selling price a VIP would charge their own customer. */
export function sellingPrice(costCents: number, margin: number): number {
  return Math.round(costCents * (1 + margin / 100));
}

/** VIP-only selector (0–25 %). Renders nothing for other roles. */
export function VipMarginPicker({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { profile, setProfile } = useProfileState();
  const [value, setValue] = useState(profile?.vipProfitMargin ?? 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(profile?.vipProfitMargin ?? 0);
  }, [profile?.vipProfitMargin]);

  if (!profile || profile.role !== "VIP") return null;

  async function save(next: number) {
    setValue(next);
    setBusy(true);
    try {
      const result = await setVipProfitMargin({ margin: next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setProfile(result.profile);
      if (!compact) toast.success(t.vipMarginSaved);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`rounded-3xl border border-amber-300/40 bg-gradient-to-br from-amber-300/15 to-transparent ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-bold">
          <TrendingUp className="size-4 text-amber-500" />
          {t.vipMarginTitle}
        </p>
        <span className="font-display text-lg font-extrabold text-amber-500 tabular-nums" dir="ltr">
          +{value}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={25}
        step={1}
        value={value}
        disabled={busy}
        aria-label={t.vipMarginTitle}
        onChange={(event) => setValue(Number(event.target.value))}
        onPointerUp={() => void save(value)}
        onKeyUp={() => void save(value)}
        className="mt-3 w-full accent-amber-500"
        dir="ltr"
      />
      <div className="mt-2 flex flex-wrap gap-1.5" dir="ltr">
        {STEPS.map((step) => (
          <button
            key={step}
            type="button"
            disabled={busy}
            aria-pressed={value === step}
            onClick={() => void save(step)}
            className={`min-h-9 min-w-12 rounded-full px-2.5 text-xs font-bold ${value === step ? "keep-white bg-amber-500 text-white" : "border border-white/15 bg-white/5"}`}
          >
            {step}%
          </button>
        ))}
      </div>
      {!compact ? <p className="mt-2 text-xs text-muted">{t.vipMarginHint}</p> : null}
    </section>
  );
}
