"use client";

import { ArrowRight, Clock3, Gamepad2, Headset, ShieldCheck, Smartphone, Tv, UserPlus, WalletCards, Zap } from "lucide-react";

import { HeroCarousel } from "@/components/hero-carousel";
import { OffersTicker } from "@/components/offers-ticker";
import { categoryKicker, categoryName, useI18n } from "@/lib/i18n";
import { Link } from "@/lib/nav";
import { CATEGORIES, type Category } from "@/lib/store/types";

const ICONS: Record<Category, typeof Gamepad2> = {
  games: Gamepad2,
  apps: Tv,
  subscriptions: WalletCards,
  mobile: Smartphone,
};

const COPY = {
  en: {
    title: "Top up games & apps in minutes",
    sub: "UC, diamonds, coins, gift cards and mobile balance, sent straight to your ID.",
    lanes: "Pick your lane",
    lanesSub: "Four sections, one wallet.",
    how: "How it works",
    steps: [
      { title: "Create your account", body: "Free and instant. Choose USD or SYP." },
      { title: "Top up your wallet", body: "Send with ShamCash, we approve fast." },
      { title: "Buy & receive", body: "Paste your player ID. Delivered in under 5 min." },
    ],
    ctaTitle: "Ready to charge the lobby?",
    ctaSub: "Join in seconds. No email confirmation needed.",
    create: "Create free account",
    signIn: "I already have an account",
    browse: "Just browsing? See the catalog",
    games: "Games",
    delivery: "Delivery",
    support: "Support",
  },
  ar: {
    title: "اشحن ألعابك وتطبيقاتك خلال دقائق",
    sub: "شدات، ألماس، عملات، بطاقات هدايا ورصيد موبايل، تصل مباشرة إلى معرّفك.",
    lanes: "اختر قسمك",
    lanesSub: "أربعة أقسام ومحفظة واحدة.",
    how: "كيف تعمل",
    steps: [
      { title: "أنشئ حسابك", body: "مجاني وفوري. اختر الدولار أو الليرة السورية." },
      { title: "اشحن محفظتك", body: "حوّل عبر شام كاش ونوافق بسرعة." },
      { title: "اشترِ واستلم", body: "الصق معرّف اللاعب. يصل خلال أقل من 5 دقائق." },
    ],
    ctaTitle: "جاهز لشحن اللوبي؟",
    ctaSub: "انضم خلال ثوانٍ. بدون تأكيد بريد إلكتروني.",
    create: "إنشاء حساب مجاني",
    signIn: "لدي حساب بالفعل",
    browse: "تتصفح فقط؟ شاهد المتجر",
    games: "لعبة",
    delivery: "التسليم",
    support: "دعم",
  },
} as const;

const STEP_ICONS = [UserPlus, WalletCards, Zap];

export function WelcomeWizard() {
  const { t, language } = useI18n();
  const c = COPY[language];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-4 pb-16 sm:px-6 sm:pt-6 lg:px-8">
      <HeroCarousel />
      <OffersTicker className="mt-3" />

      {/* Value proposition */}
      <section className="relative mx-auto mt-10 max-w-3xl text-center sm:mt-14">
        <p className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-500">
          <Zap className="size-3.5" />
          {t.heroKicker}
        </p>
        <h1 className="mt-4 font-display text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
          <span className="text-gradient">{c.title}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted text-pretty sm:text-lg">{c.sub}</p>

        <div className="nova-grid-border glass float-y absolute -start-24 top-6 hidden rounded-2xl px-4 py-3 text-start xl:block">
          <p className="font-display text-2xl font-extrabold">40+</p>
          <p className="text-xs font-semibold text-muted">{c.games}</p>
        </div>
        <div className="nova-grid-border glass float-y float-delay absolute -end-24 bottom-0 hidden rounded-2xl px-4 py-3 text-start xl:block">
          <p className="font-display text-2xl font-extrabold" dir="ltr">
            &lt; 5 min
          </p>
          <p className="text-xs font-semibold text-muted">{c.delivery}</p>
        </div>

        <ul className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-2 text-center">
          {[
            { icon: Gamepad2, value: "40+", label: c.games },
            { icon: Clock3, value: "< 5", label: c.delivery },
            { icon: Headset, value: "24/7", label: c.support },
          ].map((item) => (
            <li key={item.label} className="rounded-2xl border border-white/10 bg-white/5 px-2 py-3">
              <item.icon className="mx-auto size-4 text-violet" />
              <p className="mt-1 font-display text-lg font-extrabold tabular-nums" dir="ltr">
                {item.value}
              </p>
              <p className="text-[11px] font-semibold text-muted">{item.label}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Category showcase: 3 per row on phones */}
      <section className="mt-12 sm:mt-16" aria-labelledby="lanes-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="lanes-title" className="font-display text-xl font-extrabold sm:text-2xl">
              {c.lanes}
            </h2>
            <p className="text-sm text-muted">{c.lanesSub}</p>
          </div>
          <Link to="/" search={{ browse: true }} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-violet">
            {t.browse}
            <ArrowRight className="size-4 rtl:rotate-180" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-4">
          {CATEGORIES.map((item, position) => {
            const Icon = ICONS[item.slug];
            return (
              <Link
                key={item.slug}
                to="/category/$slug"
                params={{ slug: item.slug }}
                style={{ ["--btn-index" as string]: position }}
                className="wave-pill nova-grid-border nova-card group relative flex min-w-0 flex-col items-center overflow-hidden rounded-2xl p-3 text-center transition-transform hover:-translate-y-0.5 sm:items-start sm:rounded-3xl sm:p-5 sm:text-start"
              >
                <span className="wave-sheen" aria-hidden />
                <span className="keep-white grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/25 sm:size-12">
                  <Icon className="size-5" />
                </span>
                <span className="item-name mt-2 line-clamp-1 text-xs font-bold sm:mt-4 sm:text-lg">{categoryName(t, item.slug)}</span>
                <span className="mt-1 hidden text-sm text-muted sm:line-clamp-2">{categoryKicker(t, item.slug)}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 3-step flow */}
      <section className="mt-12 sm:mt-16" aria-labelledby="how-title">
        <h2 id="how-title" className="font-display text-xl font-extrabold sm:text-2xl">
          {c.how}
        </h2>
        <ol className="relative mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <span className="step-line absolute top-9 hidden h-0.5 rounded-full opacity-40 sm:block" style={{ insetInlineStart: "12%", insetInlineEnd: "12%" }} aria-hidden />
          {c.steps.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? Zap;
            return (
              <li key={step.title} className="nova-grid-border glass relative flex items-start gap-3 rounded-3xl p-4 sm:flex-col sm:items-center sm:p-5 sm:text-center">
                <span className="keep-white relative grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white">
                  <Icon className="size-5" />
                  <span className="absolute -end-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[var(--nc-card-solid)] text-[10px] font-extrabold text-indigo-500 shadow">
                    {index + 1}
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="font-bold">{step.title}</p>
                  <p className="mt-0.5 text-sm text-muted">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Call to action */}
      <section className="nova-grid-border glass relative mx-auto mt-12 max-w-xl overflow-hidden rounded-[2rem] p-6 text-center sm:mt-16 sm:p-8">
        <span className="keep-white mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 via-blue-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/30">
          <ShieldCheck className="size-7" />
        </span>
        <h2 className="mt-4 font-display text-2xl font-extrabold sm:text-3xl">{c.ctaTitle}</h2>
        <p className="mt-2 text-sm text-muted">{c.ctaSub}</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Link
            to="/login"
            search={{ tab: "register" }}
            className="btn-glow keep-white inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold text-white"
          >
            <UserPlus className="size-4" />
            {c.create}
          </Link>
          <Link
            to="/login"
            search={{ tab: undefined }}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold hover:border-violet/60"
          >
            {c.signIn}
          </Link>
        </div>
        <Link to="/" search={{ browse: true }} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
          {c.browse}
          <ArrowRight className="size-4 rtl:rotate-180" />
        </Link>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-semibold text-muted">
          <li className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3.5 text-emerald-500" />
            {t.trustSecure}
          </li>
          <li className="inline-flex items-center gap-1">
            <Clock3 className="size-3.5 text-violet" />
            {t.trustFast}
          </li>
          <li className="inline-flex items-center gap-1">
            <Headset className="size-3.5 text-fuchsia" />
            {t.trustSupport}
          </li>
        </ul>
      </section>
    </main>
  );
}
