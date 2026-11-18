"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ImagePlus, Zap } from "lucide-react";

import { useProfileState } from "@/components/profile";
import { useI18n } from "@/lib/i18n";
import { getFlagshipGames, getHeroBanners, onStoreChange, type FlagshipGame } from "@/lib/store/api";
import { useNovaUi } from "@/lib/ui-store";
import { intro } from "@/lib/intro";

const INTERVAL_MS = 5000;

/**
 * Top hero box. Slide 1 is always the signature "Top up the lobby" slide on the
 * animated indigo→cyan grid beam; the admin's offer photos follow, every 5 s.
 */
export function HeroCarousel({ className = "", onGames }: { className?: string; onGames?: () => void }) {
  const { t, isAr } = useI18n();
  const { profile } = useProfileState();
  const openManager = useNovaUi((state) => state.setHeroManagerOpen);
  const [banners, setBanners] = useState<string[]>([]);
  const [games, setGames] = useState<FlagshipGame[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [skipIntro] = useState(() => intro.played);
  const touchX = useRef<number | null>(null);
  // Slide 1: "Charge now" (untouched) · Slide 2: calm gift-pass card · Slide 3: flagship games
  // panorama · then the admin offer photos.
  const count = banners.length + 3;
  const isAdmin = profile?.role === "ADMIN";

  useEffect(() => {
    let cancel = false;
    const load = () => {
      void getHeroBanners().then((rows) => {
        if (!cancel) setBanners(rows);
      });
      void getFlagshipGames().then((rows) => {
        if (!cancel) setGames(rows);
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
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:mt-3 sm:text-5xl lg:text-6xl">{t.storeTitle}</h2>
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

        {/* Slide 2 (v30): calm porcelain & brushed-silver card — two glass passes float softly. */}
        <div className={`calm-slide relative flex h-full w-full shrink-0 items-center overflow-hidden ${index === 1 ? "is-live" : ""}`} aria-hidden={index !== 1} dir={isAr ? "rtl" : "ltr"}>
          <span className="calm-glow" aria-hidden />
          <div className="calm-copy relative z-10 flex h-full flex-col justify-center">
            <span className="calm-pill w-fit">{isAr ? "تجربة شحن هادئة ومباشرة" : "A calm, direct way to top up"}</span>
            <h2 className="calm-title mt-2 text-balance sm:mt-3">
              {isAr ? "كل ما تحتاجه لألعابك وتطبيقاتك، يصلك في ثوانٍ." : "Everything for your games and apps, delivered in seconds."}
            </h2>
            <p className="calm-sub mt-1.5 text-pretty sm:mt-2.5">
              {isAr ? "بطاقات رقمية فورية وشحن مباشر بأسعار مدروسة ودعم يهتم بكل تفصيل." : "Instant digital cards and direct top-ups at fair prices, with support that cares about every detail."}
            </p>
          </div>
          <GiftPasses />
        </div>
        {/* Slide 3 (v31): 3D panoramic fan of the four flagship games → jumps to the games grid. */}
        <div className={`fan-slide keep-white relative flex h-full w-full shrink-0 items-center overflow-hidden ${index === 2 ? "is-live" : ""}`} aria-hidden={index !== 2} dir={isAr ? "rtl" : "ltr"}>
          <span className="fan-glow" aria-hidden />
          <div className="fan-copy relative z-10 flex h-full flex-col justify-center">
            <p className="fan-kicker">{isAr ? "الألعاب الأكثر طلباً" : "Most-loved games"}</p>
            <h2 className="fan-title mt-1.5 text-balance sm:mt-2.5">
              {isAr ? "أشهر الألعاب العالمية — شحن فوري بأفضل الأسعار" : "The world's favourite games — instant top-ups at the best prices"}
            </h2>
            {onGames ? (
              <button type="button" tabIndex={index === 2 ? 0 : -1} onClick={onGames} className="fan-cta mt-4 hidden w-fit items-center gap-1.5 lg:inline-flex">
                {isAr ? "تصفّح الألعاب" : "Browse games"}
                {isAr ? <ArrowLeft className="size-4" strokeWidth={2} aria-hidden /> : <ArrowRight className="size-4" strokeWidth={2} aria-hidden />}
              </button>
            ) : (
              <a href="/category/games" tabIndex={index === 2 ? 0 : -1} className="fan-cta mt-4 hidden w-fit items-center gap-1.5 lg:inline-flex">
                {isAr ? "تصفّح الألعاب" : "Browse games"}
                {isAr ? <ArrowLeft className="size-4" strokeWidth={2} aria-hidden /> : <ArrowRight className="size-4" strokeWidth={2} aria-hidden />}
              </a>
            )}
          </div>
          <GameFan games={games} isAr={isAr} />
          {/* Phones / tablets: the whole slide is the "browse games" target (the button shows on desktop). */}
          <button
            type="button"
            tabIndex={index === 2 ? 0 : -1}
            onClick={() => (onGames ? onGames() : window.location.assign("/category/games"))}
            aria-label={isAr ? "تصفّح الألعاب" : "Browse games"}
            className="fan-hit absolute inset-0 z-20 lg:hidden"
          />
        </div>
        {banners.map((src, position) => (
          <div key={`${position}-${src.slice(0, 40)}`} className="h-full w-full shrink-0 p-1.5 sm:p-2" aria-hidden={index !== position + 3}>
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
 * Four portrait game cards on a shallow 3D arc: perspective(900px), outer cards turned
 * further (rotateY) and set lower, inner ones closer. Always laid out left→right so the arc
 * reads the same in Arabic and English. Live store artwork, crest-style fallback otherwise.
 */
function GameFan({ games, isAr }: { games: FlagshipGame[]; isAr: boolean }) {
  return (
    <div className="fan-stage" dir="ltr" aria-hidden>
      {games.map((game, position) => (
        <figure
          key={game.key}
          className={`fan-card fan-card-${position + 1} -mx-2 h-[142px] w-[108px] shrink-0 rounded-[20px] sm:-mx-3 sm:h-[196px] sm:w-[152px] md:h-[224px] md:w-[176px]`}
        >
          <span className="fan-card-art">
            {game.imageUrl ? (
              <img src={game.imageUrl} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" />
            ) : (
              <span className="fan-card-emblem">{game.name.charAt(0)}</span>
            )}
          </span>
          <figcaption className="fan-card-name">{isAr ? game.nameAr : game.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/**
 * Two overlapping translucent passes: brushed silver behind, ice-blue glass in front.
 * Pure CSS shapes (no text inside), so they read the same in Arabic and English.
 */
function GiftPasses() {
  return (
    <div className="calm-cards" aria-hidden>
      <div className="calm-card calm-card-silver">
        <span className="calm-card-chip" />
        <span className="calm-card-line w-3/5" />
        <span className="calm-card-line w-2/5" />
      </div>
      <div className="calm-card calm-card-ice">
        <svg className="calm-card-crest" viewBox="0 0 64 64" focusable="false">
          <rect width="64" height="64" rx="16" fill="#0F172A" />
          <path d="M17 17h30v6H17zM17 41h30v6H17zM40.5 23H47L23.5 41H17z" fill="#F8FAFC" />
          <path d="M43.75 23 20.25 41" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="calm-card-code">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="calm-card-check">
          <svg viewBox="0 0 20 20" focusable="false">
            <path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}
