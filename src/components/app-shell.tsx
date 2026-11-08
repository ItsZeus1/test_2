"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { House, LayoutGrid, ReceiptText, UserRound } from "lucide-react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Toaster } from "sonner";

import { Navbar } from "@/components/navbar";
import { MeView, ProfileProvider, ProfileSettingsModal, useProfileState } from "@/components/profile";
import { GroupsView } from "@/components/storefront";
import { SupportPill } from "@/components/support-pill";
import { PearlBackdrop } from "@/components/pearl-backdrop";
import { AdminAlerts, CustomerAlerts, NotifyOptInBar } from "@/components/admin-alerts";
import { useI18n } from "@/lib/i18n";
import { useNovaUi } from "@/lib/ui-store";
import { markIntroPlayedSoon } from "@/lib/intro";

// Heavy modals: their code is downloaded only the first time they are opened,
// and they are only in the DOM while open.
const TopUpModal = dynamic(() => import("@/components/topup-modal").then((m) => m.TopUpModal), { ssr: false });
const ServiceFormModal = dynamic(() => import("@/components/service-form-modal").then((m) => m.ServiceFormModal), { ssr: false });
const HeroManagerModal = dynamic(() => import("@/components/hero-manager").then((m) => m.HeroManagerModal), { ssr: false });
const TermsModal = dynamic(() => import("@/components/terms-modal").then((m) => m.TermsModal), { ssr: false });

function ThemedToaster() {
  const theme = useNovaUi((state) => state.theme);
  return <Toaster theme={theme} richColors position="top-center" />;
}

function OpenModals() {
  const topUp = useNovaUi((state) => state.topUp);
  const serviceModal = useNovaUi((state) => state.serviceModal);
  const profileOpen = useNovaUi((state) => state.profileOpen);
  const heroOpen = useNovaUi((state) => state.heroManagerOpen);
  const termsOpen = useNovaUi((state) => state.termsOpen);
  return (
    <>
      {topUp ? <TopUpModal /> : null}
      {serviceModal ? <ServiceFormModal /> : null}
      {profileOpen ? <ProfileSettingsModal /> : null}
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

type DockTab = "home" | "groups" | "orders" | "me";

/**
 * Floating glass capsule with 4 tabs and one gradient pill that glides to the active tab.
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
  const [visible, setVisible] = useState(true);
  const buttons = useRef<Record<DockTab, HTMLButtonElement | null>>({ home: null, groups: null, orders: null, me: null });
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  const active: DockTab | null =
    dockView === "groups" ? "groups" : dockView === "me" ? "me" : pathname.startsWith("/orders") || pathname.startsWith("/wallet") ? "orders" : pathname === "/" || pathname.startsWith("/category/") ? "home" : null;

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y < 60) setVisible(true);
        else if (y > last + 6) setVisible(true); // scrolling down → pop up
        else if (y < last - 6) setVisible(false); // scrolling up → glide away
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Close dock views when the route changes.
  useEffect(() => {
    setDockView(null);
  }, [pathname, setDockView]);

  useLayoutEffect(() => {
    const node = active ? buttons.current[active] : null;
    setPill(node ? { left: node.offsetLeft, width: node.offsetWidth } : null);
  }, [active, language]);

  const go = (tab: DockTab) => {
    if (tab === "home") {
      setDockView(null);
      if (pathname !== "/") router.push("/");
      else window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (tab === "orders") {
      setDockView(null);
      router.push("/orders");
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
    { id: "orders", label: ar ? "طلباتي" : "Orders", icon: ReceiptText },
    { id: "me", label: ar ? "حسابي" : "Me", icon: UserRound },
  ];
  const shown = visible || dockView !== null;

  return (
    <nav
      aria-label={ar ? "التنقل السفلي" : "Bottom navigation"}
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
              className={`relative z-10 flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 rounded-full px-3 text-[10px] font-bold transition-colors sm:min-w-16 sm:flex-row sm:gap-1.5 sm:text-xs ${on ? "keep-white text-white" : "text-muted"}`}
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
    <div className="dock-view fixed inset-x-0 top-16 bottom-0 z-[60] overflow-y-auto overscroll-contain bg-ink">
      {dockView === "groups" ? <GroupsView /> : <MeView />}
    </div>
  );
}

function SiteFooter() {
  const { t } = useI18n();
  const setTermsOpen = useNovaUi((state) => state.setTermsOpen);
  return (
    <footer className="mx-auto mt-auto flex w-full max-w-7xl shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 pt-6 pb-24 text-xs text-muted sm:px-6 lg:px-8">
      <span>
        © {new Date().getFullYear()} {t.brand}
      </span>
      <button type="button" onClick={() => setTermsOpen(true)} className="min-h-10 font-semibold underline-offset-4 hover:text-fg hover:underline">
        {t.termsTitle}
      </button>
    </footer>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ProfileProvider>
      <div className="relative min-h-screen overflow-x-clip bg-ink text-fg">
        <PearlBackdrop />
        <AnimationGate />
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
        <CustomerAlerts />
        <OpenModals />
        <ThemedToaster />
      </div>
    </ProfileProvider>
  );
}
