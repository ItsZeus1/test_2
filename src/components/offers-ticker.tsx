import { useEffect, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { getOffersTicker, onStoreChange, type OffersTicker as Ticker } from "@/lib/store/api";

/** Breaking-news style offers bar. Text is edited by the admin in the control center. */
export function OffersTicker({ className = "" }: { className?: string }) {
  const { t, isAr } = useI18n();
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
      <span className="ticker-badge z-10 shrink-0">
        <span className="pulse-dot size-2 rounded-full bg-current" />
        {t.tickerBadge}
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
