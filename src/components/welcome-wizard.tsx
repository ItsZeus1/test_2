import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock3, Gamepad2, Headset, Sparkles, Smartphone, Tv, WalletCards, Zap } from "lucide-react";

import { AuthPortal } from "@/components/auth-portal";
import { OffersTicker } from "@/components/offers-ticker";
import { categoryKicker, categoryName, categorySummary, fill, useI18n } from "@/lib/i18n";
import { CATEGORIES, type Category } from "@/lib/store/types";

const ICONS: Record<Category, typeof Gamepad2> = {
  games: Gamepad2,
  apps: Tv,
  subscriptions: WalletCards,
  mobile: Smartphone,
};

function useCount(target: number, active: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1000);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, target]);
  return value;
}

export function WelcomeWizard() {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Category>("games");
  const games = useCount(40, step === 0);
  const minutes = useCount(5, step === 0);
  const support = useCount(24, step === 0);
  const laneName = categoryName(t, picked);

  return (
    <main className="relative mx-auto min-h-[calc(100vh-4rem)] max-w-7xl overflow-hidden px-4 py-8 sm:px-6 sm:py-14 lg:px-8">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-80 w-[min(42rem,100vw)] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.35),transparent_68%)]" />
      <div className="pointer-events-none absolute top-40 -end-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.22),transparent_70%)]" />

      <div className="relative mb-8 flex items-center justify-center gap-2">
        {[0, 1, 2].map((index) => (
          <button
            key={index}
            type="button"
            aria-label={`${t.stepLabel} ${index + 1}`}
            onClick={() => setStep(index)}
            className={`h-2.5 rounded-full transition-all ${step === index ? "w-10 bg-gradient-to-r from-violet to-indigo shadow-[0_0_16px_rgba(99,102,241,0.55)]" : "w-2.5 bg-white/20"}`}
          />
        ))}
      </div>

      {step === 0 ? (
        <>
          <section className="relative mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.2em] text-violet uppercase">
              <Zap className="size-3.5" />
              {t.heroKicker}
            </p>
            <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
              <span className="text-gradient">{t.brand}</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted sm:text-lg">{t.heroLead}</p>

            <div className="relative mx-auto mt-8 grid max-w-2xl grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-3 sm:gap-6">
              <Stat className="float-y" icon={Gamepad2} value={fill(t.statGamesValue, { n: games })} label={t.statGames} ltr />
              <Stat className="float-y float-delay" icon={Clock3} value={fill(t.statDeliveryValue, { n: minutes })} label={t.statDelivery} />
              <Stat className="float-y" icon={Headset} value={fill(t.statSupportValue, { n: support })} label={t.statSupport} ltr />
            </div>

            <div className="glass float-y absolute -start-2 top-16 hidden max-w-[11rem] rounded-2xl px-4 py-3 text-start xl:block">
              <p className="text-[10px] font-bold tracking-[0.18em] text-fuchsia uppercase">{t.liveLane}</p>
              <p className="mt-1 text-sm font-semibold">{t.liveLaneBody}</p>
            </div>
            <div className="glass float-y float-delay absolute -end-2 bottom-24 hidden max-w-[12rem] rounded-2xl px-4 py-3 text-start xl:block">
              <p className="text-[10px] font-bold tracking-[0.18em] text-violet uppercase">{t.walletFirst}</p>
              <p className="mt-1 text-sm font-semibold">{t.walletFirstBody}</p>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-10">
              <button type="button" onClick={() => setStep(1)} className="btn-glow inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold">
                {t.seeLanes}
                <ArrowRight className="size-4 rtl:rotate-180" />
              </button>
              <Link
                to="/"
                search={{ browse: true }}
                className="inline-flex min-h-12 items-center rounded-full border border-white/15 px-6 text-sm font-semibold text-white/90 hover:border-violet/60"
              >
                {t.browse}
              </Link>
            </div>

            <ul className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-muted">
              {[t.trustInstant, t.trustWallet, t.trustNoEmail].map((label) => (
                <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  <span className="size-1.5 rounded-full bg-emerald" />
                  {label}
                </li>
              ))}
            </ul>
          </section>

          <OffersTicker className="relative mx-auto mt-10 max-w-4xl" />
        </>
      ) : null}

      {step === 1 ? (
        <section className="relative mx-auto max-w-5xl">
          <p className="text-center text-xs font-semibold tracking-[0.22em] text-fuchsia uppercase">{t.pickPillar}</p>
          <h2 className="mt-3 text-center font-display text-3xl font-extrabold sm:text-4xl">
            <span className="text-gradient">{t.fourWays}</span>
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
            {CATEGORIES.map((item) => {
              const Icon = ICONS[item.slug];
              const active = picked === item.slug;
              return (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => setPicked(item.slug)}
                  className={`tilt-card glass rounded-3xl p-5 text-start ${active ? "!border-violet/70 shadow-[0_0_32px_-12px_rgba(99,102,241,0.7)]" : ""}`}
                >
                  <span className="keep-white grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet via-indigo to-fuchsia text-white shadow-[0_0_18px_-6px_rgba(99,102,241,0.8)]">
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-4 text-[11px] font-bold tracking-[0.18em] text-violet uppercase">{categoryKicker(t, item.slug)}</p>
                  <h3 className="mt-1 font-display text-xl font-extrabold sm:text-2xl">{categoryName(t, item.slug)}</h3>
                  <p className="mt-2 text-sm text-muted">{categorySummary(t, item.slug)}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-8 flex justify-center">
            <button type="button" onClick={() => setStep(2)} className="btn-glow inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold">
              {t.continueWith} {laneName}
              <ArrowRight className="size-4 rtl:rotate-180" />
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="relative mx-auto grid max-w-5xl grid-cols-1 items-start gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="glass relative overflow-hidden rounded-[2rem] p-5 sm:p-8">
            <div className="pointer-events-none absolute -top-10 -end-8 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.3),transparent_70%)]" />
            <Sparkles className="size-5 text-fuchsia" />
            <h2 className="mt-4 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
              <span className="text-gradient">{t.openWallet}</span>
            </h2>
            <p className="mt-3 text-sm text-muted">
              {t.youPicked} {laneName}. {t.walletBody}
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="glass rounded-2xl px-4 py-3">{t.pointRole}</li>
              <li className="glass float-delay rounded-2xl px-4 py-3">{t.pointWallet}</li>
              <li className="glass rounded-2xl px-4 py-3">{t.pointBuy}</li>
            </ul>
          </div>
          <AuthPortal />
        </section>
      ) : null}
    </main>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  className,
  ltr = false,
}: {
  icon: typeof Gamepad2;
  value: string;
  label: string;
  className?: string;
  ltr?: boolean;
}) {
  return (
    <div className={`glass min-w-0 rounded-3xl px-4 py-5 ${className ?? ""}`}>
      <Icon className="mx-auto size-5 text-fuchsia" />
      <p className="mt-2 break-words font-display text-2xl font-extrabold tabular-nums sm:text-3xl" dir={ltr ? "ltr" : undefined}>
        {value}
      </p>
      <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">{label}</p>
    </div>
  );
}
