"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Cookie, Gamepad2, Heart, House, LayoutGrid, ReceiptText, Smartphone, UserRound, Wifi } from "lucide-react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Lenis from "lenis";
import { Toaster } from "sonner";

import { Navbar, TelegramNudge } from "@/components/navbar";
import { MeView, ProfileProvider, useProfileState } from "@/components/profile";
import { GroupsView } from "@/components/storefront";
import { SupportPill } from "@/components/support-pill";
import { PearlBackdrop } from "@/components/pearl-backdrop";
import { AdminAlerts, CustomerAlerts, NotifyOptInBar } from "@/components/admin-alerts";
import { CompleteProfileGate } from "@/components/auth-portal";
import { useI18n } from "@/lib/i18n";
import { subscribeScroll, useNovaUi } from "@/lib/ui-store";
import { SEO_SECTIONS } from "@/lib/store/data";
import { markIntroPlayedSoon } from "@/lib/intro";
import { joinPresence } from "@/lib/store/api";

// Heavy modals: their code is downloaded only the first time they are opened,
// and they are only in the DOM while open.
const TopUpModal = dynamic(() => import("@/components/topup-modal").then((m) => m.TopUpModal), { ssr: false });
const ServiceFormModal = dynamic(() => import("@/components/service-form-modal").then((m) => m.ServiceFormModal), { ssr: false });
const HeroManagerModal = dynamic(() => import("@/components/hero-manager").then((m) => m.HeroManagerModal), { ssr: false });
const TermsModal = dynamic(() => import("@/components/terms-modal").then((m) => m.TermsModal), { ssr: false });

/**
 * v25 — Lenis smooth scroll, site-wide. Wheel/trackpad gets inertial easing (lerp 0.1);
 * touch stays 100% native (syncTouch: false) so phones keep their own 60 fps scrolling.
 * Lenis ignores anything inside [data-lenis-prevent] or a dialog, and stands down entirely
 * while a modal has locked the page (body overflow: hidden), so inner panels scroll on their own.
 */
function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const locked = () => document.body.style.overflow === "hidden" || document.documentElement.style.overflow === "hidden";
    const lenis = new Lenis({
      lerp: 0.1,
      duration: 1.05,
      smoothWheel: true,
      syncTouch: false,
      autoRaf: true,
      prevent: (node: HTMLElement) => locked() || Boolean(node.closest?.("[data-lenis-prevent], [role='dialog']")),
    });
    // v30: popups (useScrollLock) stop / restart smooth scrolling through this handle.
    (window as Window & { __zovaLenis?: Lenis }).__zovaLenis = lenis;
    return () => {
      delete (window as Window & { __zovaLenis?: Lenis }).__zovaLenis;
      lenis.destroy();
    };
  }, []);
  return null;
}

/**
 * v33 — tells the admin who is online right now: 3 s after boot (so first paint is untouched),
 * a signed-in visitor joins a Supabase Realtime presence channel with their account id only —
 * no database reads, no polling. Leaves when the tab closes or they sign out.
 */
function OnlinePresence() {
  const { profile } = useProfileState();
  const userId = profile?.userId ?? "";
  useEffect(() => {
    if (!userId) return;
    let leave: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      leave = joinPresence(userId);
    }, 3000);
    return () => {
      window.clearTimeout(timer);
      leave?.();
    };
  }, [userId]);
  return null;
}

/**
 * v26 — keeps the service worker warm for signed-in users (a tiny ping every 25 s while any tab
 * is open, visible or not). Alerts with the screen off still come from server Web Push.
 */
function ServiceWorkerKeepAlive() {
  const { profile } = useProfileState();
  const signedIn = Boolean(profile);
  useEffect(() => {
    if (!signedIn || !("serviceWorker" in navigator)) return;
    const ping = () => navigator.serviceWorker.controller?.postMessage({ type: "ping" });
    ping();
    const timer = window.setInterval(ping, 25_000);
    const onVisible = () => {
      ping();
      // Coming back from a locked screen: ask the worker to fetch anything missed right away.
      if (document.visibilityState === "visible") navigator.serviceWorker.controller?.postMessage({ type: "catch-up" });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn]);
  return null;
}

function ThemedToaster() {
  const theme = useNovaUi((state) => state.theme);
  // Toasts start below the fixed navbar (top-20) so they never cover the wallet pill.
  return <Toaster theme={theme} richColors position="top-center" offset={{ top: 80 }} mobileOffset={{ top: 76 }} />;
}

function OpenModals() {
  const topUp = useNovaUi((state) => state.topUp);
  const serviceModal = useNovaUi((state) => state.serviceModal);
  const heroOpen = useNovaUi((state) => state.heroManagerOpen);
  const termsOpen = useNovaUi((state) => state.termsOpen);
  return (
    <>
      {topUp ? <TopUpModal /> : null}
      {serviceModal ? <ServiceFormModal /> : null}
      {heroOpen ? <HeroManagerModal /> : null}
      {termsOpen ? <TermsModal /> : null}
    </>
  );
}

/**
 * The storefront arms entrance animations itself when its skeleton fades out.
 * Every other page has no skeleton, so it arms them straight away.
 */
function AnimationGate() {
  const pathname = usePathname() ?? "/";
  const armed = useNovaUi((state) => state.isHydratedAndVisible);
  const setArmed = useNovaUi((state) => state.setHydratedAndVisible);
  const isStore = pathname === "/" || pathname.startsWith("/category/");
  useEffect(() => {
    if (!armed && !isStore) setArmed(true);
  }, [armed, isStore, setArmed]);
  useEffect(() => {
    if (armed) markIntroPlayedSoon();
  }, [armed]);
  return null;
}

/* ============================ Floating bottom dock ============================ */

type DockTab = "home" | "groups" | "favorites" | "orders" | "me";

/**
 * Floating glass capsule with 5 tabs and one gradient pill that glides to the active tab.
 * Appears when scrolling down, glides away when scrolling up (always shown near the top).
 */
function BottomDock() {
  const { language } = useI18n();
  const ar = language === "ar";
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { profile } = useProfileState();
  const dockView = useNovaUi((state) => state.dockView);
  const setDockView = useNovaUi((state) => state.setDockView);
  const [visible, setVisible] = useState(false);
  const buttons = useRef<Record<DockTab, HTMLButtonElement | null>>({ home: null, groups: null, favorites: null, orders: null, me: null });
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  const active: DockTab | null =
    dockView === "groups" ? "groups" : dockView === "me" ? "me" : pathname.startsWith("/favorites") ? "favorites" : pathname.startsWith("/orders") || pathname.startsWith("/wallet") ? "orders" : pathname === "/" || pathname.startsWith("/category/") ? "home" : null;

  // Hidden at startup. Any scroll / touch-move / wheel shows it and (re)starts a 3 s timer;
  // after 3 s of stillness it glides away. Hovering or touching the dock pauses the timer.
  // It also appears briefly after every page change, so short pages (e.g. /orders) still get it.
  const visibleRef = useRef(false);
  const hoverRef = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const firstRoute = useRef(true);
  const show = useCallback(() => {
    if (!visibleRef.current) {
      visibleRef.current = true;
      setVisible(true);
    }
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (hoverRef.current) return;
      visibleRef.current = false;
      setVisible(false);
    }, 3000);
  }, []);
  useEffect(() => {
    const unsubscribe = subscribeScroll(() => show());
    const onMove = () => show();
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("wheel", onMove, { passive: true });
    return () => {
      unsubscribe();
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("wheel", onMove);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [show]);
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    show();
  }, [pathname, show]);
  const holdOpen = (held: boolean) => {
    hoverRef.current = held;
    if (!held) show();
  };

  // Close dock views when the route changes.
  useEffect(() => {
    setDockView(null);
  }, [pathname, setDockView]);

  // The pill is measured from the active button. Re-measure whenever layout can move the buttons:
  // first paint, language / RTL flips (the <html dir> attribute changes after mount), resize and font load.
  // (Measuring only once caused "حسابي" to look active on launch: the tabs flipped sides after the first measure.)
  useLayoutEffect(() => {
    const measure = () => {
      const node = active ? buttons.current[active] : null;
      setPill(node ? { left: node.offsetLeft, width: node.offsetWidth } : null);
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new MutationObserver(measure);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["dir", "lang", "class"] });
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active, language]);

  const go = (tab: DockTab) => {
    if (tab === "home") {
      setDockView(null);
      if (pathname !== "/") router.push("/");
      else window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (tab === "orders") {
      setDockView(null);
      router.push("/orders");
    } else if (tab === "favorites") {
      setDockView(null);
      router.push("/favorites");
    } else if (tab === "groups") {
      setDockView("groups");
    } else {
      if (profile) setDockView("me");
      else router.push("/login");
    }
  };

  const tabs: Array<{ id: DockTab; label: string; icon: typeof House }> = [
    { id: "home", label: ar ? "الرئيسية" : "Home", icon: House },
    { id: "groups", label: ar ? "الأقسام" : "Services", icon: LayoutGrid },
    // v38.2: favourites are for signed-in accounts only.
    ...(profile ? [{ id: "favorites" as const, label: ar ? "المفضلة" : "Favourites", icon: Heart }] : []),
    { id: "orders", label: ar ? "طلباتي" : "Orders", icon: ReceiptText },
    { id: "me", label: ar ? "حسابي" : "Me", icon: UserRound },
  ];
  const shown = visible || dockView !== null;

  return (
    <nav
      aria-label={ar ? "التنقل السفلي" : "Bottom navigation"}
      onPointerEnter={() => holdOpen(true)}
      onPointerLeave={() => holdOpen(false)}
      onTouchStart={() => holdOpen(true)}
      onTouchEnd={() => holdOpen(false)}
      className={`bottom-dock fixed bottom-4 left-1/2 z-[90] w-auto max-w-[92vw] rounded-full px-2 py-1.5 transition-all duration-300 ease-out ${shown ? "is-shown" : "is-hidden"}`}
    >
      <div className="relative flex items-center gap-0.5">
        {pill ? <span className="dock-pill absolute inset-y-0 rounded-full" style={{ left: pill.left, width: pill.width }} aria-hidden /> : null}
        {tabs.map((tab) => {
          const on = active === tab.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                buttons.current[tab.id] = node;
              }}
              type="button"
              aria-current={on ? "page" : undefined}
              onClick={() => go(tab.id)}
              className={`relative z-10 flex min-h-11 min-w-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-full px-2 text-[10px] sm:px-3 font-bold transition-colors sm:min-w-16 sm:flex-row sm:gap-1.5 sm:text-xs ${on ? "keep-white text-white" : "text-muted"}`}
            >
              <tab.icon className="size-[18px]" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Full-screen views opened from the dock, under the top navbar. */
function DockViews() {
  const dockView = useNovaUi((state) => state.dockView);
  if (!dockView) return null;
  return (
    <div data-lenis-prevent className="dock-view fixed inset-x-0 top-16 bottom-0 z-[60] overflow-y-auto overscroll-contain bg-ink">
      {dockView === "groups" ? <GroupsView /> : <MeView />}
    </div>
  );
}

/* ============================ Cookie consent ============================ */

const CONSENT_KEY = "zovacharge_cookie_consent";

function CookieBanner() {
  const { language } = useI18n();
  const ar = language === "ar";
  const openPolicy = useNovaUi((state) => state.openPolicy);
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(!window.localStorage.getItem(CONSENT_KEY));
    } catch {
      setShow(false);
    }
  }, []);
  if (!show) return null;
  const choose = (value: "all" | "essential") => {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      /* ignore */
    }
    setShow(false);
  };
  return (
    <div className="cookie-banner fixed inset-x-3 bottom-24 z-[95] max-w-md rounded-3xl p-4 sm:inset-x-auto sm:end-5 sm:bottom-6" role="dialog" aria-label={ar ? "ملفات تعريف الارتباط" : "Cookies"}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-indigo-500/10 text-indigo-600">
          <Cookie className="size-5" strokeWidth={1.75} />
        </span>
        <p className="text-sm text-slate-700 dark:text-slate-200">
          {ar
            ? "نستخدم ملفات تعريف الارتباط (Cookies) لحفظ جلستك وتفضيلات العملة وتحسين سرعة المتجر."
            : "We use cookies to keep you signed in, remember your currency preference and keep the store fast."}{" "}
          <button type="button" onClick={() => openPolicy("cookies")} className="font-semibold text-indigo-600 underline underline-offset-4">
            {ar ? "سياسة ملفات تعريف الارتباط" : "Cookie Policy"}
          </button>
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => choose("essential")} className="min-h-11 rounded-2xl border border-slate-300 text-xs font-bold text-slate-800 dark:border-white/15 dark:text-slate-100">
          {ar ? "الضرورية فقط" : "Essential Only"}
        </button>
        <button type="button" onClick={() => choose("all")} className="btn-glow keep-white min-h-11 rounded-2xl text-xs font-bold text-white">
          {ar ? "موافقة" : "Accept All"}
        </button>
      </div>
    </div>
  );
}

/** Seed catalog, computed once (static data). */
const SECTION_ICONS = [Gamepad2, Smartphone, Wifi, UserRound] as const;

/**
 * v30 — footer: one quiet, compact row of the main store sections only (no per-service list).
 * Plain <a href> links so crawlers see the exact section URLs for Sitelinks.
 */
function StoreDirectory() {
  const { language } = useI18n();
  const ar = language === "ar";
  return (
    <nav aria-label={ar ? "أقسام متجر زوفا شارج" : "ZovaCharge store sections"} className="store-directory mx-auto mt-auto w-full max-w-7xl shrink-0 px-4 pt-8 sm:px-6 lg:px-8">
      <p className="mb-2 text-[11px] font-extrabold tracking-[0.14em] text-slate-600 uppercase dark:text-slate-300">{ar ? "أقسام المتجر" : "Store sections"}</p>
      <ul className="flex flex-wrap gap-2">
        {SEO_SECTIONS.map((section, index) => {
          const Icon = SECTION_ICONS[index] ?? Gamepad2;
          return (
            <li key={section.path}>
              <a href={section.path} className="directory-chip inline-flex items-center gap-1.5 rounded-full px-3.5 text-xs font-bold">
                <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                {ar ? section.name : section.nameEn}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SiteFooter() {
  const { t, language } = useI18n();
  const openPolicy = useNovaUi((state) => state.openPolicy);
  return (
    <>
    <StoreDirectory />
    <footer className="mx-auto mt-6 flex w-full max-w-7xl shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 pt-6 pb-24 text-xs text-muted sm:px-6 lg:px-8">
      <span>
        © {new Date().getFullYear()} {t.brand}
      </span>
      <span className="flex flex-wrap items-center gap-x-4">
        <button type="button" onClick={() => openPolicy("terms")} className="min-h-10 font-semibold underline-offset-4 hover:text-fg hover:underline">
          {t.termsTitle}
        </button>
        <button type="button" onClick={() => openPolicy("cookies")} className="min-h-10 font-semibold underline-offset-4 hover:text-fg hover:underline">
          {language === "ar" ? "سياسة ملفات تعريف الارتباط" : "Cookie Policy"}
        </button>
        <a href="https://techrats-pied.vercel.app/" target="_blank" rel="noopener noreferrer" className="min-h-10 inline-flex items-center font-semibold underline-offset-4 hover:text-fg hover:underline">
          {language === "ar" ? "تطوير وحماية TechRats" : "Designed & Secured by TechRats"}
        </a>
      </span>
    </footer>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ProfileProvider>
      <div className="relative min-h-screen overflow-x-clip bg-ink text-fg">
        {/* Shared gradient for luxury icon strokes (.lux-icon) */}
        <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
          <defs>
            <linearGradient id="lux-stroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
        </svg>
        <PearlBackdrop />
        <AnimationGate />
        <SmoothScroll />
        <ServiceWorkerKeepAlive />
        <OnlinePresence />
        {/* Column layout: content grows, footer is pinned to the bottom even on short pages */}
        <div className="relative flex min-h-screen flex-col justify-between">
          <Navbar />
          <NotifyOptInBar />
          <div className="flex-1 pb-24">{children}</div>
          <SiteFooter />
        </div>
        <DockViews />
        <BottomDock />
        <SupportPill />
        <AdminAlerts />
        <CompleteProfileGate />
        <CookieBanner />
        <CustomerAlerts />
        <TelegramNudge />
        <OpenModals />
        <ThemedToaster />
      </div>
    </ProfileProvider>
  );
}
