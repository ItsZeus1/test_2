"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleCheck, Gamepad2, Hourglass, Mail, PackageCheck, PartyPopper, ShoppingBag, Smartphone, Trophy, Tv, UserPlus, WalletCards, Zap } from "lucide-react";

import { AuthPortal, GoogleButton } from "@/components/auth-portal";
import { OffersTicker } from "@/components/offers-ticker";
import { PAYMENT_ICONS } from "@/components/pay-emblem";
import { categoryKicker, categoryName, useI18n } from "@/lib/i18n";
import { Link } from "@/lib/nav";
import { useNovaUi } from "@/lib/ui-store";
import { CATEGORIES, type Category } from "@/lib/store/types";

const CATEGORY_ICONS: Record<Category, typeof Gamepad2> = {
  games: Gamepad2,
  apps: Tv,
  subscriptions: WalletCards,
  mobile: Smartphone,
};

/** Fades a block in (slide-up) the first time it scrolls into view. */
function Reveal({ children, className = "", delay = 0, id }: { children: ReactNode; className?: string; delay?: number; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <section id={id} ref={ref} className={`reveal ${visible ? "is-visible" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </section>
  );
}

/**
 * Level 0–3 light the nodes one by one; level 4 celebrates on the last node; level 5 holds; then it restarts.
 * Respects reduced motion (shows the finished state, no loop).
 */
function usePipelineLevel(): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLevel(3);
      return;
    }
    const timer = window.setInterval(() => setLevel((value) => (value + 1) % 7), 1100);
    return () => window.clearInterval(timer);
  }, []);
  return level;
}

function Pipeline() {
  const { t } = useI18n();
  const level = usePipelineLevel();
  const reached = Math.min(level, 3);
  const progress = (reached / 3) * 100;
  const celebrating = level === 4 || level === 5;
  const steps = [
    { icon: UserPlus, label: t.wjStep1 },
    { icon: WalletCards, label: t.wjStep2 },
    { icon: ShoppingBag, label: t.wjStep3 },
    { icon: PackageCheck, label: t.wjStep4 },
  ];

  return (
    <div className="pipeline relative mx-auto mt-10 w-full max-w-4xl">
      {/* Horizontal path (tablet / desktop) */}
      <div className="pipe-track pipe-track-h hidden sm:block" aria-hidden>
        <span className="pipe-fill" style={{ width: `${progress}%` }} />
        <span className="pipe-beam" style={{ insetInlineStart: `${progress}%` }} />
      </div>
      {/* Vertical path (phones) */}
      <div className="pipe-track pipe-track-v sm:hidden" aria-hidden>
        <span className="pipe-fill" style={{ height: `${progress}%` }} />
        <span className="pipe-beam" style={{ top: `${progress}%` }} />
      </div>

      <ol className="relative grid grid-cols-1 gap-5 sm:grid-cols-4 sm:gap-2">
        {steps.map((step, index) => {
          const active = index <= reached && level < 6;
          const last = index === 3;
          return (
            <li key={step.label} className={`pipe-node flex items-center gap-3 sm:flex-col sm:text-center ${active ? "is-active" : ""} ${last ? "is-final" : ""}`}>
              <span className={`pipe-dot relative grid size-12 shrink-0 place-items-center rounded-2xl ${last && celebrating ? "is-celebrating" : ""}`}>
                <step.icon className="size-5" />
                {last && celebrating ? (
                  <>
                    <span className="pipe-burst" aria-hidden />
                    <span className="pipe-trophy keep-white" aria-hidden>
                      <Trophy className="size-3" />
                    </span>
                  </>
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-bold text-muted">0{index + 1}</span>
                <span className="item-name block text-sm font-bold sm:text-base">{step.label}</span>
              </span>
              {last && celebrating ? (
                <span className="pipe-toast keep-white inline-flex items-center gap-1.5" role="status">
                  <PartyPopper className="size-3.5" strokeWidth={1.75} aria-hidden />
                  {t.wjDone}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Live preview: a top-up moving from "processing" to "delivered", on a loop. */
function LivePreview() {
  const { language } = useI18n();
  const ar = language === "ar";
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase(2);
      return;
    }
    const timer = window.setInterval(() => setPhase((value) => (value + 1) % 4), 1400);
    return () => window.clearInterval(timer);
  }, []);
  const done = phase >= 2;
  const steps = ar ? ["تأكيد الطلب", "التحقق من الرصيد", "تم التسليم"] : ["Order confirmed", "Balance verified", "Delivered"];
  return (
    <div className="preview-card relative w-full max-w-sm justify-self-center rounded-[2rem] p-5 lg:justify-self-end" aria-hidden>
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-white">
          <Gamepad2 className="size-6" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="item-name text-sm font-bold">PUBG Mobile · 660 UC</p>
          <p className="price-num text-xs text-muted" dir="ltr">
            ID 5123456789
          </p>
        </div>
        <span className="price-num text-lg">$9.99</span>
      </div>
      <ol className="mt-5 space-y-2.5">
        {steps.map((label, index) => {
          const reached = phase >= index;
          return (
            <li key={label} className={`preview-step flex items-center gap-3 text-sm ${reached ? "is-on" : ""}`}>
              <span className="preview-tick grid size-6 shrink-0 place-items-center rounded-full">
                {reached ? <CircleCheck className="size-4" strokeWidth={2} /> : <span className="size-1.5 rounded-full bg-current opacity-40" />}
              </span>
              <span className="font-semibold">{label}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-200/70" dir="ltr">
        <span className="preview-bar block h-full rounded-full" style={{ transform: `scaleX(${Math.min(1, (phase + 1) / 3)})` }} />
      </div>
      <p className={`mt-3 inline-flex items-center gap-1.5 text-xs font-bold ${done ? "text-emerald-600" : "text-amber-600"}`}>
        {done ? <PackageCheck className="size-4" strokeWidth={1.75} /> : <Hourglass className="size-4" strokeWidth={1.75} />}
        {done ? (ar ? "وصلت الشدات خلال 38 ثانية" : "Delivered in 38 seconds") : ar ? "جارٍ التنفيذ…" : "Processing…"}
      </p>
    </div>
  );
}

export function WelcomeWizard() {
  const { t, language } = useI18n();
  const ar = language === "ar";
  const armed = useNovaUi((state) => state.isHydratedAndVisible);
  const joinRef = useRef<HTMLDivElement>(null);
  const goJoin = () => joinRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const words = ar ? ["اشحن.", "استلم.", "العب."] : ["Top up.", "Receive.", "Play."];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-12 sm:px-6 sm:pt-12 lg:px-8">
      {/* Editorial hero: asymmetric type + live preview */}
      <Reveal className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-700">
            <Zap className="size-3.5" strokeWidth={1.75} />
            {t.wjKicker}
          </p>
          <h1 className="editorial-title mt-5 font-display font-black tracking-tight">
            {words.map((word, index) => (
              <span key={word} className={`block ${index === 1 ? "text-gradient ps-[8%]" : index === 2 ? "ps-[16%]" : ""}`}>
                {word}
              </span>
            ))}
          </h1>
          <p className="mt-5 max-w-md text-base text-muted text-pretty sm:text-lg">{t.wjSub}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2" aria-hidden>
            {/* v25: same markup as the signed-in navbar pill (white .wm-plate for Syriatel) */}
            <span className="welcome-pay chamber-syriatel">
              <span className="wm-plate">
                <img src={PAYMENT_ICONS.SYRIATEL_CASH} alt="" className="wm-icon" draggable={false} />
              </span>
            </span>
            <span className="welcome-pay chamber-sham-navy">
              <img src={PAYMENT_ICONS.SHAMCASH} alt="" className="wm-icon" draggable={false} />
            </span>
            <span className="welcome-pay chamber-mtn">
              <img src={PAYMENT_ICONS.MTN_CASH} alt="" className="wm-icon" draggable={false} />
            </span>
          </div>
          <div className="mt-7 grid max-w-md gap-2 sm:grid-cols-2">
            <GoogleButton />
            <button type="button" onClick={goJoin} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white/70 px-4 text-sm font-bold text-slate-800 dark:border-white/15 dark:bg-white/5 dark:text-slate-100">
              <Mail className="size-4" strokeWidth={1.75} />
              {ar ? "التسجيل بالبريد" : "Sign up with email"}
            </button>
          </div>
        </div>
        <LivePreview />
      </Reveal>

      {/* 4-level pipeline with the finale burst */}
      <Reveal className="mt-16 text-center sm:mt-24" delay={60}>
        <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{t.wjTitle}</h2>
        <Pipeline />
      </Reveal>

      <OffersTicker className="mt-14" />

      {/* Bento category showcase */}
      <Reveal className="mt-16 sm:mt-24" delay={80}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{t.wjExplore}</h2>
            <p className="mt-1 text-sm text-muted">{t.wjExploreSub}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:grid-rows-2 sm:gap-4">
          {CATEGORIES.map((item, position) => {
            const Icon = CATEGORY_ICONS[item.slug];
            const hero = position === 0;
            return (
              <Link
                key={item.slug}
                to="/category/$slug"
                params={{ slug: item.slug }}
                style={{ ["--btn-index" as string]: position }}
                className={`bento-card wave-pill nova-grid-border relative flex min-w-0 flex-col overflow-hidden rounded-3xl p-4 sm:p-6 ${hero ? "col-span-2 row-span-2 min-h-56 sm:min-h-0" : "min-h-32"}`}
              >
                {armed ? <span className="wave-sheen" aria-hidden /> : null}
                <span className={`keep-white grid place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 text-white ${hero ? "size-14" : "size-11"}`}>
                  <Icon className={hero ? "size-7" : "size-5"} strokeWidth={1.75} />
                </span>
                <span className={`item-name mt-auto pt-4 font-extrabold ${hero ? "text-2xl sm:text-4xl" : "text-base sm:text-lg"}`}>{categoryName(t, item.slug)}</span>
                <span className={`mt-1 text-muted ${hero ? "text-sm sm:text-base" : "hidden text-xs sm:block"}`}>{categoryKicker(t, item.slug)}</span>
              </Link>
            );
          })}
        </div>
      </Reveal>

      {/* Fast entry: Google or email */}
      <Reveal className="mt-16 scroll-mt-24 sm:mt-24" delay={100} id="join">
        <div ref={joinRef} className="scroll-mt-24 text-center">
          <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{t.wjJoin}</h2>
          <p className="mt-1 text-sm text-muted">{t.wjJoinSub}</p>
        </div>
        <div className="mt-5 flex justify-center">
          <AuthPortal initialTab="register" />
        </div>
      </Reveal>
    </main>
  );
}
