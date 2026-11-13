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

        {/* Slide 2 (v25): Editorial Security & Live Concierge canvas — asymmetric, one composition */}
        <div className={`vault-slide relative h-full w-full shrink-0 overflow-hidden ${index === 1 ? "is-live" : ""}`} aria-hidden={index !== 1} dir={isAr ? "rtl" : "ltr"}>
          <div className="vault-stripes" aria-hidden />
          <VaultEmblem />
          <div className="vault-copy relative flex h-full flex-col justify-center ps-12 pe-[30%] sm:ps-16 sm:pe-[40%] lg:pe-[32%]">
            <h2 className="vault-title font-display font-black tracking-tight text-balance">
              {isAr ? "رصيدك في أمان تام، وفريقنا معك لحظة بلحظة." : "Your Balance is Fully Protected, and Our Team is With You Every Second."}
            </h2>
            <p className="vault-sub mt-1.5 line-clamp-2 max-w-xl text-pretty sm:mt-3">
              {isAr
                ? "عمليات شحن مؤمّنة بالكامل مع ضمان فوري للرصيد ودعم فني مباشر يرافقك حتى اكتمال طلبك."
                : "Fully secured top-ups with an instant balance guarantee and live human support until your order is complete."}
            </p>
            <p className="vault-status mt-2 flex min-w-0 items-center gap-2 sm:mt-4">
              <span className="vault-live-dot" aria-hidden />
              <span className="min-w-0 truncate">
                {isAr ? "حماية كاملة للمعاملات • دعم فني بشري مباشر • ضمان الرصيد 100%" : "Full transaction protection • Live human support • 100% balance guarantee"}
              </span>
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
 * Armored vault door + live pulse. Pure SVG, two transform/opacity animations (dial turn,
 * pulse ring) and one stroke draw — all paused unless slide 2 is on screen.
 */
function VaultEmblem() {
  return (
    <svg className="vault-emblem" viewBox="0 0 220 220" aria-hidden focusable="false">
      <defs>
        <linearGradient id="vault-chrome" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.45" stopColor="#E2E8F0" />
          <stop offset="1" stopColor="#CBD5E1" />
        </linearGradient>
        <linearGradient id="vault-door" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F8FAFC" />
          <stop offset="1" stopColor="#E2E8F0" />
        </linearGradient>
        <linearGradient id="vault-navy" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1E3A8A" />
          <stop offset="1" stopColor="#0F172A" />
        </linearGradient>
      </defs>
      {/* outer armour ring */}
      <circle cx="110" cy="110" r="100" fill="url(#vault-chrome)" stroke="#CBD5E1" strokeWidth="2" />
      <circle cx="110" cy="110" r="100" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="160 470" strokeLinecap="round" opacity="0.9" />
      {/* rotating combination dial with 8 locking bolts */}
      <g className="vault-dial">
        <circle cx="110" cy="110" r="86" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="1.5 7" />
        {Array.from({ length: 8 }).map((_, bolt) => {
          const angle = (Math.PI / 4) * bolt;
          return <circle key={bolt} cx={110 + 86 * Math.cos(angle)} cy={110 + 86 * Math.sin(angle)} r="5" fill="#E2E8F0" stroke="#1E3A8A" strokeWidth="1.75" />;
        })}
      </g>
      {/* door */}
      <circle cx="110" cy="110" r="68" fill="url(#vault-door)" stroke="url(#vault-navy)" strokeWidth="3" />
      <circle cx="110" cy="110" r="58" fill="none" stroke="#CBD5E1" strokeWidth="1" />
      {/* shield + keyhole */}
      <path d="M110 70 L141 82 V107 C141 128 127 141 110 149 C93 141 79 128 79 107 V82 Z" fill="url(#vault-navy)" />
      <path d="M110 76 L135 86 V107 C135 124 124 135 110 142" fill="none" stroke="#38BDF8" strokeWidth="1.5" opacity="0.6" />
      <circle cx="110" cy="103" r="8" fill="#38BDF8" />
      <rect x="106.5" y="106" width="7" height="18" rx="3" fill="#38BDF8" />
      {/* live concierge pulse */}
      <polyline className="vault-ecg" points="22,196 70,196 80,178 92,212 104,186 112,196 198,196" fill="none" stroke="#0284C7" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="vault-ping" cx="182" cy="40" r="15" fill="none" stroke="#0EA5E9" strokeWidth="2.5" />
      <circle cx="182" cy="40" r="11" fill="#0284C7" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M176 40 h4 l2 -4 l3 8 l2 -4 h4" fill="none" stroke="#FFFFFF" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
