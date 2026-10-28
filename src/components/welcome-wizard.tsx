import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock3, Gamepad2, Headset, Sparkles, Smartphone, Tv, WalletCards } from "lucide-react";

import { AuthPortal } from "@/components/auth-portal";
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
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Category>("games");
  const games = useCount(40, step === 0);
  const minutes = useCount(5, step === 0);
  const support = useCount(24, step === 0);
  const lane = CATEGORIES.find((item) => item.slug === picked) ?? CATEGORIES[0];

  return (
    <main className="relative mx-auto min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden px-4 py-10 sm:py-16">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.45),transparent_68%)]" />
      <div className="pointer-events-none absolute top-40 -right-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(232,121,249,0.35),transparent_70%)]" />

      <div className="relative mb-8 flex items-center justify-center gap-2">
        {[0, 1, 2].map((index) => (
          <button
            key={index}
            type="button"
            aria-label={`Step ${index + 1}`}
            onClick={() => setStep(index)}
            className={`h-2.5 rounded-full transition-all ${step === index ? "w-10 bg-gradient-to-r from-violet to-fuchsia shadow-[0_0_16px_rgba(232,121,249,0.8)]" : "w-2.5 bg-white/20"}`}
          />
        ))}
      </div>

      {step === 0 ? (
        <section className="relative mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold tracking-[0.28em] text-violet uppercase">Instant game top-up</p>
          <h1 className="mt-4 font-display text-5xl font-extrabold tracking-tight sm:text-7xl">
            <span className="bg-gradient-to-br from-white via-violet-100 to-fuchsia bg-clip-text text-transparent">
              NovaCharge
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted sm:text-lg">
            UC, diamonds, coins, and mobile data — priced for your role and sent to the player ID you paste.
          </p>

          <div className="relative mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-3">
            <Stat className="float-y" icon={Gamepad2} value={`${games}+`} label="Games" />
            <Stat className="float-y float-delay" icon={Clock3} value={`< ${minutes} Min`} label="Delivery" />
            <Stat className="float-y" icon={Headset} value={`${support}/7`} label="Support" />
          </div>

          <div className="glass float-y absolute -left-2 top-16 hidden max-w-[11rem] rounded-2xl px-4 py-3 text-left lg:block">
            <p className="text-[10px] font-bold tracking-[0.18em] text-fuchsia uppercase">Live lane</p>
            <p className="mt-1 text-sm font-semibold">PUBG · Free Fire · MLBB</p>
          </div>
          <div className="glass float-y float-delay absolute -right-2 bottom-24 hidden rounded-2xl px-4 py-3 text-left lg:block">
            <p className="text-[10px] font-bold tracking-[0.18em] text-violet uppercase">Wallet first</p>
            <p className="mt-1 text-sm font-semibold">Top up, then one-tap buy</p>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button type="button" onClick={() => setStep(1)} className="btn-glow inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold">
              See the lanes
              <ArrowRight className="size-4" />
            </button>
            <Link
              to="/"
              search={{ browse: true }}
              className="inline-flex min-h-12 items-center rounded-full border border-white/15 px-6 text-sm font-semibold text-white/90 hover:border-violet/60 hover:shadow-[0_0_24px_-8px_rgba(139,92,246,0.9)]"
            >
              Browse catalog
            </Link>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="relative mx-auto max-w-5xl">
          <p className="text-center text-xs font-semibold tracking-[0.22em] text-fuchsia uppercase">Pick a pillar</p>
          <h2 className="mt-3 text-center font-display text-4xl font-extrabold">
            <span className="text-gradient">Four ways in</span>
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {CATEGORIES.map((item) => {
              const Icon = ICONS[item.slug];
              const active = picked === item.slug;
              return (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => setPicked(item.slug)}
                  className={`tilt-card glass rounded-3xl p-5 text-left ${active ? "border-violet/70 shadow-[0_0_32px_-8px_rgba(139,92,246,0.95)]" : ""}`}
                >
                  <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet/80 via-fuchsia/70 to-indigo shadow-[0_0_18px_-6px_rgba(232,121,249,0.9)]">
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-4 text-[11px] font-bold tracking-[0.18em] text-violet uppercase">{item.kicker}</p>
                  <h3 className="mt-1 font-display text-2xl font-extrabold">{item.label}</h3>
                  <p className="mt-2 text-sm text-muted">{item.summary}</p>
                </button>
              );
            })}
          </div>
          <div className="mt-8 flex justify-center">
            <button type="button" onClick={() => setStep(2)} className="btn-glow inline-flex min-h-12 items-center gap-2 rounded-full px-6 text-sm font-semibold">
              Continue with {lane.label}
              <ArrowRight className="size-4" />
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="relative mx-auto grid max-w-5xl items-start gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="glass relative overflow-hidden rounded-[2rem] p-6 sm:p-8">
            <div className="pointer-events-none absolute -top-10 -right-8 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgba(232,121,249,0.45),transparent_70%)]" />
            <Sparkles className="size-5 text-fuchsia" />
            <h2 className="mt-4 font-display text-4xl font-extrabold leading-tight">
              <span className="text-gradient">Open your wallet</span>
            </h2>
            <p className="mt-3 text-sm text-muted">
              You highlighted {lane.label}. Sign in or create an account — registration is instant, no email confirmation.
              VIP and admin accounts see the VIP price only.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="glass rounded-2xl px-4 py-3">Role badge on every session</li>
              <li className="glass float-delay rounded-2xl px-4 py-3">Balance stays on this device and in the cloud when Supabase is set</li>
              <li className="glass rounded-2xl px-4 py-3">Purchases log the player ID, price, and your IP</li>
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
}: {
  icon: typeof Gamepad2;
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={`glass rounded-3xl px-4 py-5 ${className ?? ""}`}>
      <Icon className="mx-auto size-5 text-fuchsia" />
      <p className="mt-2 font-display text-3xl font-extrabold tabular-nums">{value}</p>
      <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">{label}</p>
    </div>
  );
}
