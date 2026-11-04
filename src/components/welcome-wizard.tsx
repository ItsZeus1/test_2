"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Gamepad2, PackageCheck, ShoppingBag, Smartphone, Trophy, Tv, UserPlus, WalletCards, Zap } from "lucide-react";

import { AuthPortal } from "@/components/auth-portal";
import { OffersTicker } from "@/components/offers-ticker";
import { PayEmblem } from "@/components/pay-emblem";
import { categoryKicker, categoryName, useI18n } from "@/lib/i18n";
import { Link } from "@/lib/nav";
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
                <span className="pipe-toast keep-white" role="status">
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

export function WelcomeWizard() {
  const { t } = useI18n();
  const joinRef = useRef<HTMLDivElement>(null);
  const goJoin = () => joinRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10 lg:px-8">
      {/* Block 1: story + 4-level pipeline */}
      <Reveal className="text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-500">
          <Zap className="size-3.5" />
          {t.wjKicker}
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl font-display text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          <span className="text-gradient">{t.wjTitle}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted text-pretty sm:text-lg">{t.wjSub}</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2" aria-hidden>
          <PayEmblem method="SHAMCASH" size="sm" />
          <PayEmblem method="SYRIATEL_CASH" size="sm" />
          <PayEmblem method="MTN_CASH" size="sm" />
        </div>
        <Pipeline />
        <button
          type="button"
          onClick={goJoin}
          className="btn-glow keep-white mt-10 inline-flex min-h-12 items-center gap-2 rounded-2xl px-6 text-sm font-bold text-white"
        >
          {t.createAccount}
          <ArrowDown className="size-4" />
        </button>
      </Reveal>

      <OffersTicker className="mt-10" />

      {/* Block 2: catalog preview */}
      <Reveal className="mt-14 sm:mt-20" delay={80}>
        <div className="mb-4 text-center sm:text-start">
          <h2 className="font-display text-2xl font-extrabold sm:text-3xl">{t.wjExplore}</h2>
          <p className="mt-1 text-sm text-muted">{t.wjExploreSub}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-4">
          {CATEGORIES.map((item, position) => {
            const Icon = CATEGORY_ICONS[item.slug];
            return (
              <Link
                key={item.slug}
                to="/category/$slug"
                params={{ slug: item.slug }}
                style={{ ["--btn-index" as string]: position }}
                className="wave-pill nova-grid-border nova-card group relative flex min-w-0 flex-col items-center overflow-hidden rounded-2xl p-3 text-center transition-transform hover:-translate-y-0.5 sm:items-start sm:rounded-3xl sm:p-5 sm:text-start"
              >
                <span className="wave-sheen" aria-hidden />
                <span className="icon-aura">
                  <span className="keep-white grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/25 sm:size-12">
                    <Icon className="size-5" />
                  </span>
                </span>
                <span className="item-name mt-2 line-clamp-1 text-xs font-bold sm:mt-4 sm:text-lg">{categoryName(t, item.slug)}</span>
                <span className="mt-1 hidden text-sm text-muted sm:line-clamp-2">{categoryKicker(t, item.slug)}</span>
              </Link>
            );
          })}
        </div>
      </Reveal>

      {/* Block 3: sign in / create account */}
      <Reveal className="mt-14 scroll-mt-24 sm:mt-20" delay={120} id="join">
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
