"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Gamepad2,
  Gift,
  Headset,
  MessageCircle,
  Smartphone,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/utils";

export interface Teaser {
  name: string;
  slug: string;
  normal: number;
  vip: number;
}

function Counter({ to, prefix = "", suffix = "" }: { to: number; prefix?: string; suffix?: string }) {
  const value = useMotionValue(0);
  const rounded = useTransform(value, (v) => Math.round(v).toString());
  useEffect(() => {
    const controls = animate(value, to, { duration: 1.5, ease: "easeOut", delay: 0.3 });
    return controls.stop;
  }, [to, value]);
  return (
    <span className="font-tabular">
      {prefix}
      <motion.span>{rounded}</motion.span>
      {suffix}
    </span>
  );
}

const PILLARS = [
  {
    icon: Gamepad2,
    title: "Games Top-Up",
    items: ["PUBG Mobile", "Free Fire", "Valorant", "Mobile Legends", "Jawaker"],
    glow: "from-violet/40",
  },
  {
    icon: MessageCircle,
    title: "Chat & Live Apps",
    items: ["Bigo Live", "TikTok Coins", "Likee", "SoulChill"],
    glow: "from-fuchsia-500/40",
  },
  {
    icon: Gift,
    title: "Subscriptions & Gift Cards",
    items: ["PlayStation", "Steam", "Netflix", "Spotify", "iTunes", "Razer Gold"],
    glow: "from-mint/40",
  },
  {
    icon: Smartphone,
    title: "Mobile Balance & Telecom",
    items: ["Direct balance recharge", "Data bundles"],
    glow: "from-sky-500/40",
  },
];

const STEP_LABELS = ["Welcome", "Services", "Get started"];

export function WelcomeWizard({ teasers }: { teasers: Teaser[] }) {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);

  function go(next: number) {
    setDir(next > step ? 1 : -1);
    setStep(next);
  }

  const variants = {
    enter: (d: number) => ({ opacity: 0, x: d > 0 ? 60 : -60 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d > 0 ? -60 : 60 }),
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#090A0F]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(700px 480px at 12% 8%, rgba(139,92,246,0.28), transparent 60%), radial-gradient(640px 460px at 92% 88%, rgba(16,185,129,0.20), transparent 60%)",
        }}
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-mint text-ink">
            <Zap className="h-4 w-4" />
          </span>
          Nova<span className="text-mint">Charge</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Log in
            </Button>
          </Link>
          <Link href="/register">
            <Button variant="secondary" size="sm">
              Sign up
            </Button>
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex max-w-6xl justify-center gap-2 px-6 pt-2" role="tablist" aria-label="Welcome steps">
        {STEP_LABELS.map((label, i) => (
          <button
            key={label}
            role="tab"
            aria-selected={i === step}
            onClick={() => go(i)}
            className="group flex items-center gap-2 px-1 py-2 text-xs"
          >
            <span
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-10 bg-gradient-to-r from-violet to-mint" : "w-4 bg-white/20 group-hover:bg-white/40"
              }`}
            />
            <span className={i === step ? "text-text" : "text-muted"}>{label}</span>
          </button>
        ))}
      </div>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-16 pt-8">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.section
            key={step}
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="min-h-[60vh]"
          >
            {step === 0 && (
              <div className="flex flex-col items-start justify-center gap-6 pt-10">
                <span className="glass rounded-full px-3 py-1 text-xs font-medium text-mint">
                  The #1 Instant Game &amp; Digital Top-Up Hub
                </span>
                <h1 className="max-w-3xl font-display text-5xl font-bold leading-[1.05] md:text-7xl">
                  Nova
                  <span className="bg-gradient-to-r from-violet via-fuchsia-400 to-mint bg-clip-text text-transparent">
                    Charge
                  </span>
                  <br />
                  <span className="text-3xl font-medium text-white/80 md:text-5xl">
                    Instant top-ups for every game.
                  </span>
                </h1>
                <div className="glass mt-4 grid w-full max-w-2xl grid-cols-3 gap-4 rounded-2xl p-5">
                  <div>
                    <Zap className="mb-2 h-4 w-4 text-violet-soft" />
                    <div className="font-display text-2xl font-bold md:text-3xl">
                      <Counter to={40} suffix="+" />
                    </div>
                    <div className="text-xs text-muted">Games &amp; Apps Supported</div>
                  </div>
                  <div>
                    <Clock className="mb-2 h-4 w-4 text-mint" />
                    <div className="font-display text-2xl font-bold md:text-3xl">
                      &lt; <Counter to={5} suffix=" Min" />
                    </div>
                    <div className="text-xs text-muted">Instant Delivery</div>
                  </div>
                  <div>
                    <Headset className="mb-2 h-4 w-4 text-fuchsia-400" />
                    <div className="font-display text-2xl font-bold md:text-3xl">
                      <Counter to={24} suffix="/7" />
                    </div>
                    <div className="text-xs text-muted">Live Automated Support</div>
                  </div>
                </div>
                <Button variant="glow" size="lg" onClick={() => go(1)}>
                  Explore services <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="font-display text-3xl font-bold md:text-5xl">Four ways to top up.</h2>
                <p className="mt-2 max-w-xl text-muted">One wallet, one checkout, every service you play and use.</p>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {PILLARS.map(({ icon: Icon, title, items, glow }, i) => (
                    <motion.div
                      key={title}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 * i, duration: 0.4 }}
                      whileHover={{ y: -4 }}
                      className="glass relative overflow-hidden rounded-2xl p-6"
                    >
                      <div aria-hidden className={`absolute -right-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br ${glow} to-transparent blur-2xl`} />
                      <Icon className="relative mb-4 h-6 w-6 text-white" />
                      <h3 className="relative font-display text-xl font-medium">{title}</h3>
                      <div className="relative mt-3 flex flex-wrap gap-1.5">
                        {items.map((it) => (
                          <span key={it} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80">
                            {it}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
                <div className="mt-8 flex gap-3">
                  <Button variant="ghost" onClick={() => go(0)}>
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button variant="glow" size="lg" onClick={() => go(2)}>
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="font-display text-3xl font-bold md:text-5xl">Live offers. VIP saves more.</h2>
                <p className="mt-2 max-w-xl text-muted">Popular right now — create a free account to start topping up.</p>

                {teasers.length > 0 && (
                  <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {teasers.map((t) => {
                      const save = t.normal > 0 ? Math.round(((t.normal - t.vip) / t.normal) * 100) : 0;
                      return (
                        <div key={t.slug} className="glass rounded-xl p-4">
                          <div className="truncate text-sm font-semibold">{t.name}</div>
                          <div className="mt-3 text-xs text-muted">Normal</div>
                          <div className="font-tabular text-sm text-white/70">{formatMoney(t.normal)}</div>
                          <div className="mt-2 text-xs text-gold">VIP</div>
                          <div className="font-tabular text-lg font-bold text-gold">{formatMoney(t.vip)}</div>
                          {save > 0 && (
                            <div className="mt-2 inline-block rounded-full bg-mint/15 px-2 py-0.5 text-[10px] font-bold text-mint">
                              Save {save}%
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button variant="ghost" onClick={() => go(1)}>
                    <ArrowLeft className="h-4 w-4" /> Back
                  </Button>
                  <Link href="/register">
                    <Button variant="glow" size="lg">
                      Create Account
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button variant="secondary" size="lg">
                      Login
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </main>
    </div>
  );
}
