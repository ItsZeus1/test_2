import { useEffect, useMemo, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { getStoreSettings, onStoreChange } from "@/lib/store/api";
import { DEFAULT_OFFERS_TICKER, DEFAULT_OFFERS_TICKER_AR } from "@/lib/store/data";

const REPEAT = 2;

/**
 * Live offers "TV news" ticker. The text comes from the admin-controlled store settings;
 * `enText` / `arText` let the admin panel preview a draft before saving.
 */
export function OffersTicker({ enText, arText, className = "" }: { enText?: string; arText?: string; className?: string }) {
  const { t, isAr } = useI18n();
  const [saved, setSaved] = useState({ en: DEFAULT_OFFERS_TICKER, ar: DEFAULT_OFFERS_TICKER_AR });
  const preview = enText !== undefined || arText !== undefined;

  useEffect(() => {
    if (preview) return;
    let cancel = false;
    const load = () => {
      void getStoreSettings()
        .then((settings) => {
          if (!cancel) setSaved({ en: settings.offersTickerText, ar: settings.offersTickerTextAr });
        })
        .catch(() => undefined);
    };
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, [preview]);

  const raw = isAr ? (arText ?? saved.ar) : (enText ?? saved.en);
  const offers = useMemo(() => {
    const list = raw
      .split(/\n|\|/)
      .map((item) => item.trim())
      .filter(Boolean);
    return list.length > 0 ? list : [isAr ? DEFAULT_OFFERS_TICKER_AR : DEFAULT_OFFERS_TICKER];
  }, [raw, isAr]);

  const chars = offers.reduce((sum, item) => sum + item.length + 6, 0) * REPEAT;
  const duration = Math.min(180, Math.max(24, Math.round(chars * 0.23)));
  const group = Array.from({ length: REPEAT }).flatMap((_, round) =>
    offers.map((offer, index) => (
      <span key={`${round}-${index}`} className="ticker-item text-fg" dir={isAr ? "rtl" : "ltr"}>
        {offer}
        <span aria-hidden className="text-rose-500">
          ◆
        </span>
      </span>
    )),
  );

  return (
    <section aria-label={t.tickerAria} className={`ticker ${className}`} tabIndex={0}>
      <span className="ticker-badge">
        <span className="pulse-dot size-2 shrink-0 rounded-full bg-white" />
        <span className="relative">{t.tickerBadge}</span>
      </span>
      <div className="ticker-viewport">
        <div className="ticker-track" style={{ ["--ticker-duration" as string]: `${duration}s` }}>
          <div className="ticker-group">{group}</div>
          <div className="ticker-group" aria-hidden>
            {group}
          </div>
        </div>
      </div>
    </section>
  );
}
