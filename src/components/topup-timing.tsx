"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { getTopupTiming, onStoreChange } from "@/lib/store/api";
import type { TopupTiming } from "@/lib/store/types";

export function useTopupTiming(): TopupTiming | null {
  const [timing, setTiming] = useState<TopupTiming | null>(null);
  useEffect(() => {
    let cancel = false;
    const load = () => {
      void getTopupTiming().then((value) => {
        if (!cancel) setTiming(value);
      });
    };
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, []);
  return timing;
}

/** Visible to everyone: real average from recent approvals, or the admin's fallback. */
export function ApprovalTimeBadge({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const timing = useTopupTiming();
  let value: string;
  if (timing?.averageMinutes != null) {
    value = `~${Math.max(1, Math.round(timing.averageMinutes))} ${t.minutesShort}`;
  } else if (timing) {
    const base = Math.max(1, Math.round(timing.fallbackMinutes));
    value = `${Math.max(1, base - 1)}–${base + 2} ${t.minutesShort}`;
  } else {
    value = "…";
  }
  return (
    <p className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold ${className}`}>
      <span className="inline-flex items-center gap-1.5">
        <Timer className="size-3.5 shrink-0 text-emerald-600" strokeWidth={1.75} aria-hidden />
        {t.avgApproval}
      </span>
      <span className="font-display text-sm font-extrabold text-emerald-500 tabular-nums" dir="ltr">
        {value}
      </span>
    </p>
  );
}

/** Live mm:ss since an ISO timestamp, ticking every second. */
export function ElapsedTimer({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const text = `${h > 0 ? `${h}:` : ""}${String(m).padStart(h > 0 ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
  return (
    <span className="font-mono tabular-nums" dir="ltr">
      {text}
    </span>
  );
}
