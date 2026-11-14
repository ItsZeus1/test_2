"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Zap } from "lucide-react";

import { useProfileState } from "@/components/profile";
import { useI18n } from "@/lib/i18n";
import { getHeroBanners, onStoreChange } from "@/lib/store/api";
import { useNovaUi } from "@/lib/ui-store";
import { intro } from "@/lib/intro";

const INTERVAL_MS = 5000;

/**
 * Top hero box. Slide 1 is always the signature "Top up the lobby" slide on the
 * animated indigo→cyan grid beam; the admin's offer photos follow, every 5 s.
 */
export function HeroCarousel({ className = "" }: { className?: string }) {
  const { t, isAr } = useI18n();
  const { profile } = useProfileState();
  const openManager = useNovaUi((state) => state.setHeroManagerOpen);
  const [banners, setBanners] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [skipIntro] = useState(() => intro.played);
  const touchX = useRef<number | null>(null);
  // Slide 1: "Charge now" · Slide 2: security & live-support canvas · then the admin offer photos.
  const count = banners.length + 2;
  const isAdmin = profile?.role === "ADMIN";

  useEffect(() => {
    let cancel = false;
    const load = () => {
      void getHeroBanners().then((rows) => {
        if (!cancel) setBanners(rows);
      });
    };
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, []);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  return (
    <section
      className={`hero-frame ${skipIntro ? "no-intro" : ""} relative h-48 w-full overflow-hidden rounded-[1.5rem] sm:h-64 sm:rounded-[2rem] lg:h-80 ${className}`}
      aria-roledescription="carousel"
      aria-label={t.storeTitle}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(event) => {
        touchX.current = event.touches[0]?.clientX ?? null;
        setPaused(true);
      }}
      onTouchEnd={(event) => {
        const start = touchX.current;
        const end = event.changedTouches[0]?.clientX;
        touchX.current = null;
        setPaused(false);
        if (start == null || end == null || Math.abs(end - start) < 40) return;
        const forward = isAr ? end > start : end < start;
        go(index + (forward ? 1 : -1));
      }}
    >
      {/* Track is always LTR so slide order is identical in Arabic and English. */}
      <div
        dir="ltr"
        className="flex h-full transition-transform duration-700 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        <div className="relative h-full w-full shrink-0" aria-hidden={index !== 0} dir={isAr ? "rtl" : "ltr"}>
          <div className="hero-grid-beam aurora-stage" aria-hidden>
            <div className="hero-mesh" />
          </div>
          {/* Aurora-glass stage: perspective horizon grid + levitating glass prisms */}
          <div className="hero-horizon" aria-hidden />
          <div className="hero-prisms" aria-hidden>
            <span className="prism p1" />
            <span className="prism p2" />
            <span className="prism p3" />
          </div>
          <div className="hero-content-in keep-white relative flex h-full flex-col justify-center px-5 text-white sm:px-10">
            <p className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.22em] text-white/80 uppercase sm:text-xs">
              <Zap className="size-3.5" /> {t.storeKicker}
            </p>
            <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:mt-3 sm:text-5xl lg:text-6xl">{t.storeTitle}</h1>
            <p className="mt-2 line-clamp-2 max-w-lg text-xs text-white/85 sm:mt-3 sm:text-base">{t.storeLead}</p>
          </div>
          <span className="hero-content-in telemetry-pill absolute end-3 top-3 sm:end-5 sm:top-5">
            <span className="dot" aria-hidden />
            {t.instantTopup}
          </span>
          {/* Energy core charging up along the bottom rail */}
          <span className="hero-charge-rail" aria-hidden>
            <span />
          </span>
        </div>

        {/* Slide 2 (v26): minimalist trust showcase — one emblem, one headline, one line */}
        <div className={`verified-slide relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden ${index === 1 ? "is-live" : ""}`} aria-hidden={index !== 1} dir={isAr ? "rtl" : "ltr"}>
          <span className="verified-aura" aria-hidden />
          <div className="relative flex max-w-2xl flex-col items-center px-12 text-center sm:px-16">
            <VerifiedEmblem />
            <span className="verified-tag mt-2 sm:mt-3" dir="ltr">ZovaCharge Verified</span>
            <h2 className="verified-title mt-1.5 font-display font-bold text-balance sm:mt-2.5">
              {isAr ? "ثقة كاملة في كل عملية شحن." : "Complete Trust in Every Charge."}
            </h2>
            <p className="verified-sub mt-1 text-pretty sm:mt-2">
              {isAr ? "تنفيذ فوري مدعوم بضمان الرصيد ودعم مباشر على مدار الساعة." : "Instant fulfilment backed by a balance guarantee and live support around the clock."}
            </p>
          </div>
        </div>
        {banners.map((src, position) => (
          <div key={`${position}-${src.slice(0, 40)}`} className="h-full w-full shrink-0 p-1.5 sm:p-2" aria-hidden={index !== position + 2}>
            <img
              src={src}
              alt={`${t.heroOffer} ${position + 1}`}
              className="h-full w-full rounded-2xl object-cover"
              loading={position === 0 ? "eager" : "lazy"}
              draggable={false}
            />
          </div>
        ))}
      </div>

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label={t.heroPrev}
            className="keep-white absolute start-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50 sm:size-11"
          >
            <ChevronLeft className="size-5 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label={t.heroNext}
            className="keep-white absolute end-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50 sm:size-11"
          >
            <ChevronRight className="size-5 rtl:rotate-180" />
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5 sm:bottom-3">
            {Array.from({ length: count }).map((_, dot) => (
              <button
                key={dot}
                type="button"
                onClick={() => go(dot)}
                aria-label={`${t.heroSlide} ${dot + 1}`}
                aria-current={dot === index}
                className="grid h-6 min-w-6 place-items-center"
              >
                <span className={`block h-1.5 rounded-full transition-all ${dot === index ? "w-6 bg-white" : "w-1.5 bg-white/55"}`} />
              </button>
            ))}
          </div>
        </>
      ) : null}

      {isAdmin ? (
        <button
          type="button"
          onClick={() => openManager(true)}
          className="keep-white absolute end-2 bottom-2 z-10 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-black/45 px-3 text-[11px] font-bold text-white backdrop-blur hover:bg-black/60 sm:end-3 sm:bottom-3 sm:text-xs"
        >
          <ImagePlus className="size-3.5" />
          {t.editHeroPhotos}
        </button>
      ) : null}
    </section>
  );
}

/**
 * Anodized-silver squircle with an ice-blue glass core and the Z crest.
 * Concentric corners: shell rx 26 with 7px wall → glass rx 19.
 */
function VerifiedEmblem() {
  return (
    <svg className="verified-emblem" viewBox="0 0 96 96" aria-hidden focusable="false">
      <defs>
        <linearGradient id="ve-shell" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.5" stopColor="#E2E8F0" />
          <stop offset="1" stopColor="#B6C2D3" />
        </linearGradient>
        <linearGradient id="ve-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E0F2FE" />
          <stop offset="0.55" stopColor="#7DD3FC" />
          <stop offset="1" stopColor="#0284C7" />
        </linearGradient>
        <linearGradient id="ve-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="92" height="92" rx="26" fill="url(#ve-shell)" stroke="#CBD5E1" strokeWidth="1.2" />
      <rect x="2.6" y="2.6" width="90.8" height="90.8" rx="25.4" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.9" />
      <rect x="9" y="9" width="78" height="78" rx="19" fill="url(#ve-glass)" />
      <rect x="9" y="9" width="78" height="36" rx="19" fill="url(#ve-shine)" opacity="0.55" />
      <path d="M33 32 H63 L41 61 H64" fill="none" stroke="#0F172A" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M33 32 H63 L41 61 H64" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <circle cx="72" cy="72" r="11" fill="#0F172A" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M67.2 72.2 l3.2 3.2 6.2 -6.6" fill="none" stroke="#38BDF8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
