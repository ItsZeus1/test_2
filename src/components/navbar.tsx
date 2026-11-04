"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@/lib/nav";
import { Gamepad2, Home, Menu, MessageCircle, Plus, Receipt, Shield, Smartphone, Tv, Wallet, WalletCards, X, Zap } from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { useSupportUnread } from "@/components/support-pill";
import { RoleBadge } from "@/components/role-badge";
import { LanguageToggle } from "@/components/language-toggle";

import { ThemeIconButton, ThemeSegmented } from "@/components/theme-toggle";
import { useProfileState } from "@/components/profile";
import { CurrencyPreviewSwitch } from "@/components/currency-switch";
import { categoryName, useI18n, useMoney } from "@/lib/i18n";
import { CATEGORIES } from "@/lib/store/types";
import { useNovaUi } from "@/lib/ui-store";

/**
 * Cinematic 5-stage wallet pill so visitors see every way to pay:
 * 1) "+ Top Up" → 2) ShamCash (emerald) → 3) Syriatel Cash (red) → 4) MTN Cash (yellow)
 * → 5) liquid-wave reveal of balance + "+ Top Up" badge.
 * Plays on load, then every 20 s. Any tap opens the top-up modal.
 */
function WalletPill() {
  const { t } = useI18n();
  const money = useMoney();
  const { profile } = useProfileState();
  const openSelfTopUp = useNovaUi((state) => state.openSelfTopUp);
  const [stage, setStage] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage(4);
      return;
    }
    let timers: number[] = [];
    const run = () => {
      timers.forEach((id) => window.clearTimeout(id));
      setStage(0);
      timers = [
        window.setTimeout(() => setStage(1), 1400),
        window.setTimeout(() => setStage(2), 2800),
        window.setTimeout(() => setStage(3), 4200),
        window.setTimeout(() => {
          setStage(4);
          setCycle((value) => value + 1);
        }, 5600),
      ];
    };
    run();
    const loop = window.setInterval(run, 20_000);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.clearInterval(loop);
    };
  }, []);

  if (!profile) return null;
  const balance = money(profile.balanceCents, profile.currency);
  return (
    <button
      type="button"
      onClick={openSelfTopUp}
      data-stage={stage}
      aria-label={`${t.walletTitle}: ${balance} · ${t.chargeCta}`}
      className="wallet-morph relative isolate flex min-h-10 min-w-0 items-center overflow-hidden rounded-full"
    >
      {/* Stage 5 (and the element that sizes the pill) */}
      <span className="wm-combo flex min-w-0 items-center gap-1.5 py-1 ps-3 pe-1">
        <Wallet className="hidden size-4 shrink-0 text-violet sm:block" aria-hidden />
        <span className="price-num min-w-0 max-w-[6.5rem] truncate text-xs sm:max-w-none sm:text-sm" dir="ltr">
          {balance}
        </span>
        <span className="btn-glow keep-white inline-flex min-h-8 shrink-0 items-center rounded-full px-2.5 text-xs font-bold text-white">
          {t.chargeCta}
        </span>
      </span>
      {/* Stage 1 */}
      <span className="wm-layer wm-charge keep-white" aria-hidden>
        {t.chargeCta}
      </span>
      {/* Stage 2–4: the three payment methods */}
      <span className="wm-layer wm-sham keep-white" aria-hidden>
        {t.shamcashName}
      </span>
      <span className="wm-layer wm-syriatel keep-white" aria-hidden>
        🔴 {t.methodSyriatel}
      </span>
      <span className="wm-layer wm-mtn" aria-hidden>
        🟡 {t.methodMtn}
      </span>
      {/* Liquid wave that sweeps away the ShamCash layer to reveal stage 3 */}
      {stage === 4 ? <span key={cycle} className="wm-wave" aria-hidden /> : null}
    </button>
  );
}

function ProfileAvatar() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { profile } = useProfileState();
  const openProfile = useNovaUi((state) => state.openProfile);
  if (!profile) return null;
  const admin = profile.role === "ADMIN";
  return (
    <button
      type="button"
      aria-label={admin ? t.admin : t.profile}
      title={admin ? t.admin : t.profile}
      className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-white/15 bg-white/10 text-sm font-bold"
      onClick={() => {
        if (admin) void navigate({ to: "/admin" });
        else openProfile();
      }}
    >
      {profile.avatarUrl ? (
        <img src={profile.avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        profile.name.slice(0, 1).toUpperCase()
      )}
    </button>
  );
}

export function Navbar() {
  const { t } = useI18n();
  const setSupportOpen = useNovaUi((state) => state.setSupportOpen);
  const supportOpen = useNovaUi((state) => state.supportOpen);
  const supportUnread = useSupportUnread();
  const { profile, ready, authPending } = useProfileState();
  const openCreateService = useNovaUi((state) => state.openCreateService);
  const openSelfTopUp = useNovaUi((state) => state.openSelfTopUp);
  const [open, setOpen] = useState(false);
  const isAdmin = profile?.role === "ADMIN";

  const close = () => setOpen(false);
  const money = useMoney();
  const { language } = useI18n();

  // Esc closes the drawer; lock page scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        <Link to="/" search={{ browse: true }} className="flex min-w-0 shrink items-center gap-2 font-display text-lg font-extrabold tracking-tight">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet via-fuchsia to-indigo shadow-[0_0_22px_-6px_rgba(139,92,246,0.9)]">
            <Zap className="size-4 text-white" />
          </span>
          <span className="truncate text-gradient max-[400px]:hidden">{t.brand}</span>
        </Link>

        <nav className="ms-2 hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex" aria-label="Primary">
          <Link
            to="/"
            search={{ browse: true }}
            className="shrink-0 rounded-full px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-white"
            activeOptions={{ exact: true, includeSearch: false }}
            activeProps={{ className: "shrink-0 rounded-full px-3 py-2 text-sm text-white bg-white/10" }}
          >
            {t.allServices}
          </Link>
          {CATEGORIES.map((category) => (
            <Link
              key={category.slug}
              to="/category/$slug"
              params={{ slug: category.slug }}
              className="shrink-0 rounded-full px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-white"
              activeProps={{ className: "shrink-0 rounded-full px-3 py-2 text-sm text-white bg-white/10" }}
            >
              {categoryName(t, category.slug)}
            </Link>
          ))}
          <Link
            to="/orders"
            className="shrink-0 rounded-full px-3 py-2 text-sm text-muted hover:bg-white/5 hover:text-white"
            activeProps={{ className: "shrink-0 rounded-full px-3 py-2 text-sm text-white bg-white/10" }}
          >
            {t.orders}
          </Link>
        </nav>

        <div className="ms-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          {authPending || (profile === null && !ready) ? (
            <div className="h-10 w-24 animate-pulse rounded-full bg-white/10" />
          ) : profile ? (
            <WalletPill />
          ) : (
            <Link
              to="/login"
              search={{ tab: undefined }}
              className="btn-glow hidden min-h-11 items-center rounded-full px-4 text-sm font-semibold sm:inline-flex"
            >
              {t.signIn}
            </Link>
          )}

          <button
            type="button"
            onClick={() => setSupportOpen(!supportOpen)}
            aria-label={t.supportCenter}
            aria-expanded={supportOpen}
            className="relative grid size-10 shrink-0 place-items-center rounded-full border border-white/10 md:hidden"
          >
            <MessageCircle className="size-[18px] text-violet" />
            <span className={`absolute end-1.5 top-1.5 size-2 rounded-full ring-2 ring-[var(--nc-ink)] ${supportUnread > 0 ? "bg-rose-500" : "bg-emerald-400"}`} />
          </button>

          {profile ? (
            <span className="hidden sm:block">
              <ProfileAvatar />
            </span>
          ) : null}
          <CurrencyPreviewSwitch className="hidden lg:flex" />
          <ThemeIconButton />

          {isAdmin ? (
            <div className="hidden items-center gap-2 lg:flex">
              <button
                type="button"
                onClick={openCreateService}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-violet/40 bg-violet/15 px-3 text-sm font-semibold hover:border-violet"
              >
                <Plus className="size-4" />
                {t.addService}
              </button>
              <Link
                to="/admin"
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-fuchsia/40 px-3 text-sm font-semibold text-fuchsia-100"
              >
                <Shield className="size-4" />
                {t.admin}
              </Link>
            </div>
          ) : null}

          <button
            type="button"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 sm:size-11"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? t.menuClose : t.menuOpen}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[90]">
              <button type="button" aria-label={t.menuClose} className="fade-in absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={close} />
              <aside
                role="dialog"
                aria-modal="true"
                aria-label={t.menuOpen}
                className="drawer-in absolute inset-y-0 end-0 flex w-[min(88vw,24rem)] flex-col border-s border-white/10 bg-[rgb(255_255_255/0.95)] text-fg shadow-2xl backdrop-blur-xl dark:bg-[rgb(15_23_42/0.95)]"
              >
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                  <span className="flex items-center gap-2 font-display text-lg font-extrabold">
                    <span className="keep-white grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo to-violet text-white">
                      <Zap className="size-4" />
                    </span>
                    <span className="text-gradient">{t.brand}</span>
                  </span>
                  <button
                    type="button"
                    onClick={close}
                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-semibold hover:bg-white/10"
                  >
                    <X className="size-4" />
                    <span>{language === "ar" ? "إغلاق" : "Close"}</span>
                  </button>
                </div>

                <div className="flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4">
                  {profile ? (
                    <section className="rounded-3xl border border-indigo-400/25 bg-gradient-to-br from-indigo-500/10 via-transparent to-cyan-500/10 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate font-semibold">{profile.name}</p>
                        <RoleBadge role={profile.role} />
                      </div>
                      <p className="mt-3 text-xs font-semibold text-muted">{t.wallet}</p>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate font-display text-2xl font-extrabold tabular-nums" dir="ltr">
                          {money(profile.balanceCents, profile.currency)}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            close();
                            openSelfTopUp();
                          }}
                          className="btn-glow keep-white inline-flex min-h-11 shrink-0 items-center gap-1 rounded-2xl px-4 text-sm font-bold text-white"
                        >
                          <Plus className="size-4" />
                          {t.topUpShort}
                        </button>
                      </div>
                    </section>
                  ) : ready ? (
                    <section className="grid grid-cols-2 gap-2">
                      <Link to="/login" search={{ tab: undefined }} onClick={close} className="btn-glow keep-white flex min-h-12 items-center justify-center rounded-2xl text-sm font-bold text-white">
                        {t.signIn}
                      </Link>
                      <Link to="/login" search={{ tab: "register" }} onClick={close} className="flex min-h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-sm font-semibold">
                        {t.createAccount}
                      </Link>
                    </section>
                  ) : null}


                  <div>
                    <p className="mb-1 px-1 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">{t.menuNav}</p>
                    <nav className="grid gap-1" aria-label={t.menuOpen}>
                      {[
                        { key: "all", icon: Home, label: t.allServices, link: { to: "/", search: { browse: true } } },
                        ...CATEGORIES.map((category) => ({
                          key: category.slug,
                          icon: { games: Gamepad2, apps: Tv, subscriptions: WalletCards, mobile: Smartphone }[category.slug],
                          label: categoryName(t, category.slug),
                          link: { to: "/category/$slug", params: { slug: category.slug } },
                        })),
                        { key: "orders", icon: Receipt, label: t.orders, link: { to: "/orders" } },
                        { key: "wallet", icon: Wallet, label: t.walletTitle, link: { to: "/wallet" } },
                      ].map((item) => (
                        <Link
                          key={item.key}
                          {...item.link}
                          onClick={close}
                          className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold hover:bg-white/5"
                        >
                          <span className="grid size-9 place-items-center rounded-xl bg-white/5 text-violet">
                            <item.icon className="size-4" />
                          </span>
                          {item.label}
                        </Link>
                      ))}
                      {isAdmin ? (
                        <>
                          <button
                            type="button"
                            className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-start text-sm font-semibold hover:bg-white/5"
                            onClick={() => {
                              close();
                              openCreateService();
                            }}
                          >
                            <span className="grid size-9 place-items-center rounded-xl bg-white/5 text-violet">
                              <Plus className="size-4" />
                            </span>
                            {t.addService}
                          </button>
                          <Link to="/admin" onClick={close} className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold hover:bg-white/5">
                            <span className="grid size-9 place-items-center rounded-xl bg-white/5 text-fuchsia">
                              <Shield className="size-4" />
                            </span>
                            {t.admin}
                          </Link>
                        </>
                      ) : null}
                    </nav>
                  </div>

                  {/* Settings & help live at the bottom of the panel */}
                  <div className="mt-auto space-y-3 border-t border-white/10 pt-4">
                    <p className="px-1 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">{t.menuSettings}</p>
                    <ThemeSegmented />
                    <div className="flex flex-wrap items-center gap-2">
                      <LanguageToggle />
                      <CurrencyPreviewSwitch />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        setSupportOpen(true);
                      }}
                      className="keep-white flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-sm font-bold text-white shadow-[0_12px_28px_-14px_rgba(16,185,129,0.9)]"
                    >
                      {t.supportCenter}
                      {supportUnread > 0 ? (
                        <span className="grid min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-emerald-600">{supportUnread}</span>
                      ) : null}
                    </button>

                    {profile ? <SignOutButton onDone={close} className="w-full" /> : null}
                  </div>
                </div>
              </aside>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}
