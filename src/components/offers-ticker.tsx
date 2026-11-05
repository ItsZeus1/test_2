"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { useNovaUi } from "@/lib/ui-store";
import { getOffersTicker, onStoreChange, type OffersTicker as Ticker } from "@/lib/store/api";

/** Breaking-news style offers bar. Text is edited by the admin in the control center. */
export function OffersTicker({ className = "" }: { className?: string }) {
  const { t, isAr } = useI18n();
  const armed = useNovaUi((state) => state.isHydratedAndVisible);
  const [ticker, setTicker] = useState<Ticker | null>(null);

  useEffect(() => {
    let cancel = false;
    const load = () => {
      void getOffersTicker().then((next) => {
        if (!cancel) setTicker(next);
      });
    };
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, []);

  const text = ticker ? (isAr ? ticker.textAr : ticker.text) : "";
  if (!text) return <div className={`ticker-bar h-12 ${className}`} aria-hidden />;

  return (
    <div className={`ticker-bar ${className}`} role="region" aria-label={t.tickerBadge}>
      {/* The label collapses after 2.5 s, leaving the 🔥; hover / tap / focus shows it again. */}
      <span className={`ticker-badge z-10 shrink-0 ${armed ? "is-armed" : ""}`} tabIndex={0} title={t.tickerBadge.replace("🔥", "").trim()}>
        <span className="ticker-fire" aria-hidden>
          🔥
        </span>
        <span className="ticker-label">{t.tickerBadge.replace("🔥", "").trim()}</span>
      </span>
      <div className="ticker-viewport" dir="ltr">
        <div className={`ticker-track ${isAr ? "ticker-rtl" : ""}`}>
          {[0, 1].map((copy) => (
            <span key={copy} className="ticker-item" dir={isAr ? "rtl" : "ltr"} aria-hidden={copy === 1}>
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
