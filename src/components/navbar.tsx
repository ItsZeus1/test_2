"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@/lib/nav";
import { Bell, BellRing, CircleCheck, CircleX, Flame, Gamepad2, Home, Hourglass, Menu, MessageCircle, Plus, Receipt, Shield, Smartphone, Tv, Wallet, WalletCards, X, Zap } from "lucide-react";
import { enableNotifications } from "@/components/admin-alerts";
import { ReceiptBadge } from "@/components/receipt-badge";
import { SignOutButton } from "@/components/confirm-dialog";
import { PAYMENT_ICONS } from "@/components/pay-emblem";
import { useSupportUnread } from "@/components/support-pill";
import { RoleBadge } from "@/components/receipt-badge";
import { LanguageToggle } from "@/components/language-toggle";

import { ThemeIconButton, ThemeSegmented } from "@/components/theme-toggle";
import { useProfileState } from "@/components/profile";
import { CurrencyPreviewSwitch } from "@/components/currency-switch";
import { categoryName, useI18n, useMoney } from "@/lib/i18n";
import { CATEGORIES } from "@/lib/store/types";
import { subscribeScroll, useNovaUi } from "@/lib/ui-store";
import { FEED_DAYS, listMyFeed, onStoreChange } from "@/lib/store/api";
import type { FeedItem } from "@/lib/store/types";

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
  // Sits in the calm balance state until the startup skeleton is gone, then starts the cycle.
  const armed = useNovaUi((state) => state.isHydratedAndVisible);
  const [stage, setStage] = useState<0 | 1 | 2 | 3 | 4>(4);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (!armed) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage(4);
      return;
    }
    let timers: number[] = [];
    const run = () => {
      timers.forEach((id) => window.clearTimeout(id));
      setStage(0);
      timers = [
        window.setTimeout(() => setStage(1), 1150),
        window.setTimeout(() => setStage(2), 2300),
        window.setTimeout(() => setStage(3), 3450),
        window.setTimeout(() => {
          setStage(4);
          setCycle((value) => value + 1);
        }, 4600),
      ];
    };
    run();
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [armed]);

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
        <Wallet className="hidden size-4 shrink-0 text-[#1e3a8a] sm:block" aria-hidden />
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
      {/* Stage 2–4: the three payment methods, icon only, centred on the brand colour */}
      <span className="wm-layer wm-sham" aria-hidden>
        <img src={PAYMENT_ICONS.SHAMCASH} alt="" className="wm-icon" draggable={false} />
      </span>
      <span className="wm-layer wm-syriatel" aria-hidden>
        <span className="wm-plate">
          <img src={PAYMENT_ICONS.SYRIATEL_CASH} alt="" className="wm-icon" draggable={false} />
        </span>
      </span>
      <span className="wm-layer wm-mtn" aria-hidden>
        <img src={PAYMENT_ICONS.MTN_CASH} alt="" className="wm-icon" draggable={false} />
      </span>
      {/* Liquid wave that sweeps away the ShamCash layer to reveal stage 3 */}
      {stage === 4 && cycle > 0 ? <span key={cycle} className="wm-wave" aria-hidden /> : null}
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
  // Pinned over the hero + ticker; slides away once the user scrolls down past the
  // "All services" bar on store pages, and comes back on any upward scroll.
  const pathname = usePathname() ?? "/";
  const isStore = pathname === "/" || pathname.startsWith("/category/");
  const dockView = useNovaUi((state) => state.dockView);
  const [navHidden, setNavHidden] = useState(false);
  const hiddenRef = useRef(false);
  useEffect(() => {
    const flip = (next: boolean) => {
      if (hiddenRef.current === next) return;
      hiddenRef.current = next;
      setNavHidden(next);
    };
    if (!isStore) {
      flip(false);
      return;
    }
    return subscribeScroll((y, dy) => {
      const anchor = document.getElementById("services-section-start");
      const limit = anchor ? anchor.getBoundingClientRect().top + y - 64 : Number.POSITIVE_INFINITY;
      if (y < limit || dy < -6) flip(false);
      else if (dy > 0) flip(true);
    });
  }, [isStore]);
  const setFeedOpen = useNovaUi((state) => state.setFeedOpen);
  const feedCount = useFeedCount();
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
    <>
    <header
      className={`nav-glass fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-ink/75 transition-[transform,opacity] duration-300 ease-out ${navHidden && !open && !dockView ? "pointer-events-none -translate-y-full opacity-0" : "translate-y-0 opacity-100"}`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-w-0 shrink items-center gap-2 font-display text-lg font-extrabold tracking-tight">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#0284c7] shadow-[0_0_22px_-6px_rgba(2,132,199,0.85)]">
            <Zap className="size-4 text-white" />
          </span>
          <span className="brand-gradient truncate max-[400px]:hidden">{t.brand}</span>
        </Link>

        <nav className="ms-2 hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex" aria-label="Primary">
          <Link
            to="/"
           
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
            <MessageCircle className="size-[18px] text-[#1e3a8a]" />
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
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#0284c7]/40 bg-[#0284c7]/15 px-3 text-sm font-semibold hover:border-[#0284c7]"
              >
                <Plus className="size-4" />
                {t.addService}
              </button>
              <Link
                to="/admin"
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#0284c7]/40 px-3 text-sm font-semibold text-sky-800 dark:text-sky-200"
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
                    <span className="keep-white grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo to-[#0284c7] text-white">
                      <Zap className="size-4" />
                    </span>
                    <span className="brand-gradient">{t.brand}</span>
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
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <p className="price-num whitespace-nowrap text-base font-extrabold sm:text-lg" dir="ltr">
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


                  {profile ? (
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        setFeedOpen(true);
                      }}
                      className="flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Bell className="lux-icon size-[18px]" strokeWidth={1.75} />
                        {language === "ar" ? "الإشعارات" : "Notifications"}
                      </span>
                      {feedCount > 0 ? (
                        <span className="keep-white grid min-w-6 place-items-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-bold text-white">{feedCount}</span>
                      ) : null}
                    </button>
                  ) : null}

                  <div>
                    <p className="mb-1 px-1 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">{t.menuNav}</p>
                    <nav className="grid gap-1" aria-label={t.menuOpen}>
                      {[
                        { key: "all", icon: Home, label: t.allServices, link: { to: "/" } },
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
                          <span className="grid size-9 place-items-center rounded-xl bg-white/5 text-[#1e3a8a]">
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
                            <span className="grid size-9 place-items-center rounded-xl bg-white/5 text-[#1e3a8a]">
                              <Plus className="size-4" />
                            </span>
                            {t.addService}
                          </button>
                          <Link to="/admin" onClick={close} className="flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold hover:bg-white/5">
                            <span className="grid size-9 place-items-center rounded-xl bg-white/5 text-[#1e3a8a]">
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
                      <MessageCircle className="size-4" strokeWidth={1.75} />
                      {t.supportCenter}
                      {supportUnread > 0 ? (
                        <span className="grid min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-emerald-600">{supportUnread}</span>
                      ) : null}
                    </button>

                    {profile ? <SignOutButton onDone={close} className="w-full" /> : null}
                    <TechRatsCredit />
                  </div>
                </div>
              </aside>
            </div>,
            document.body,
          )
        : null}
      <FeedPanel />
    </header>
    {/* Spacer: the navbar is fixed, so content starts below it */}
    <div className="h-16" aria-hidden />
    </>
  );
}

/* ============================ Notifications center (5-day feed) ============================ */

function useFeed(enabled: boolean): FeedItem[] {
  const { language } = useI18n();
  const [items, setItems] = useState<FeedItem[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancel = false;
    const load = () => {
      void listMyFeed(language === "ar" ? "ar" : "en").then((rows) => {
        if (!cancel) setItems(rows);
      });
    };
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, [enabled, language]);
  return items;
}

/** Count for the side-menu badge (signed-in users only). */
function useFeedCount(): number {
  const { profile } = useProfileState();
  return useFeed(Boolean(profile)).length;
}

function FeedPanel() {
  const { language } = useI18n();
  const ar = language === "ar";
  const open = useNovaUi((state) => state.feedOpen);
  const setOpen = useNovaUi((state) => state.setFeedOpen);
  const items = useFeed(open);
  const [permission, setPermission] = useState<string>("default");

  useEffect(() => {
    if (!open) return;
    setPermission(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open || typeof document === "undefined") return null;
  const stamp = (iso: string) => new Date(iso).toLocaleString(ar ? "ar-SY-u-nu-latn" : "en-US", { dateStyle: "short", timeStyle: "short" });

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md" role="presentation">
      <button type="button" aria-label={ar ? "إغلاق" : "Close"} className="absolute inset-0 cursor-default" onClick={() => setOpen(false)} />
      <section role="dialog" aria-modal="true" aria-label={ar ? "الإشعارات" : "Notifications"} className="feed-panel modal-pop relative flex max-h-[86vh] w-full max-w-md flex-col overflow-hidden rounded-3xl">
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Bell className="size-5 text-indigo-500" />
          <h2 className="min-w-0 flex-1 font-display text-lg font-extrabold">{ar ? "الإشعارات" : "Notifications"}</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label={ar ? "إغلاق" : "Close"} className="grid min-h-[40px] min-w-[40px] place-items-center rounded-xl border border-white/10">
            <X className="size-4" />
          </button>
        </header>
        <div className="px-4 pt-3">
          {permission === "granted" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-bold text-emerald-500">
              <BellRing className="size-3.5" strokeWidth={1.75} />
              {ar ? "✓ إشعارات الجهاز مفعلة" : "✓ Device notifications on"}
            </span>
          ) : permission === "unsupported" ? (
            <p className="text-xs text-muted">{ar ? "هذا المتصفح لا يدعم الإشعارات." : "This browser doesn't support notifications."}</p>
          ) : (
            <button
              type="button"
              onClick={() => void enableNotifications().then(setPermission)}
              className="notify-bar keep-white flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-start text-sm font-semibold text-white"
            >
              <BellRing className="size-4 shrink-0 text-sky-300" strokeWidth={1.75} />
              {ar ? "الإشعارات غير مفعلة — اضغط هنا لتفعيل تنبيهات الشحن والعروض" : "Notifications are off — tap to turn on top-up & offer alerts"}
            </button>
          )}
        </div>
        <ul className="mt-3 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-3">
          {items.length === 0 ? <li className="py-8 text-center text-sm text-muted">{ar ? "لا توجد إشعارات خلال آخر 5 أيام." : "No notifications in the last 5 days."}</li> : null}
          {items.map((item) => (
            <li key={item.id} className="feed-item rounded-2xl px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="flex min-w-0 items-center gap-2 text-sm font-bold">
                  <FeedIcon item={item} />
                  {item.title}
                </p>
                <span className="shrink-0 text-[11px] text-muted">{stamp(item.createdAt)}</span>
              </div>
              {item.body ? <p className="mt-0.5 text-xs text-muted">{item.body}</p> : null}
              {item.receiptNumber ? <ReceiptBadge value={item.receiptNumber} className="mt-1.5" /> : null}
            </li>
          ))}
        </ul>
        <footer className="border-t border-white/10 px-4 py-2.5 text-center text-[11px] text-muted">
          {ar ? `يتم الاحتفاظ بالإشعارات لآخر ${FEED_DAYS} أيام فقط ثم تُحذف تلقائياً` : `Notifications are kept for the last ${FEED_DAYS} days only, then removed automatically`}
        </footer>
      </section>
    </div>,
    document.body,
  );
}

/* ============================ Studio credit ============================ */

function TechRatsCredit() {
  const { language } = useI18n();
  return (
    <a
      href="https://techrats-pied.vercel.app/"
      target="_blank"
      rel="noopener noreferrer"
      className="techrats group mt-2 flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-transform hover:-translate-y-0.5"
    >
      <svg viewBox="0 0 48 48" className="size-10 shrink-0" aria-hidden>
        <defs>
          <linearGradient id="tr-badge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e3a8a" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          <linearGradient id="tr-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        {/* metallic navy hexagon badge */}
        <path d="M24 2 43 13v22L24 46 5 35V13z" fill="url(#tr-badge)" stroke="#cbd5e1" strokeWidth="1.2" />
        {/* geometric cyber-rat: pointed snout, round ear, circuit tail */}
        <path d="M12 29c2-6 8-10 15-10 4 0 7 2 9 5l-4 1-2 3c-2 2-6 3-10 3H15z" fill="none" stroke="url(#tr-line)" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="27" cy="17.5" r="3.2" fill="none" stroke="url(#tr-line)" strokeWidth="1.6" />
        <circle cx="31.5" cy="24" r="1.2" fill="#67e8f9" />
        <path d="M15 31c-2 3-1 6 2 7h6v3" fill="none" stroke="url(#tr-line)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="23" cy="41" r="1.4" fill="#67e8f9" />
      </svg>
      <div className="min-w-0">
        <p className="text-xs font-bold">{language === "ar" ? "تم التطوير والحماية بواسطة فريق TechRats" : "Designed & Secured by TechRats"}</p>
        <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-sky-500 uppercase">
          <Shield className="size-3" /> Verified Architecture
        </p>
      </div>
    </a>
  );
}

/** Status-aware fine-line icon for a feed entry. */
function FeedIcon({ item }: { item: FeedItem }) {
  const bad = item.status === "REJECTED" || item.status === "DECLINED";
  const wait = item.status === "PROCESSING" || item.status.startsWith("PENDING");
  const tone = item.kind === "offer" ? "text-orange-500" : bad ? "text-rose-500" : wait ? "text-amber-500" : "text-emerald-500";
  const Icon = item.kind === "offer" ? Flame : item.kind === "topup" ? Wallet : bad ? CircleX : wait ? Hourglass : CircleCheck;
  return <Icon className={`size-4 shrink-0 ${tone}`} strokeWidth={1.75} aria-hidden />;
}

