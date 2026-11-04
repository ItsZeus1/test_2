"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { Toaster } from "sonner";

import { Navbar } from "@/components/navbar";
import { ProfileProvider, ProfileSettingsModal } from "@/components/profile";
import { SupportPill } from "@/components/support-pill";
import { useI18n } from "@/lib/i18n";
import { useNovaUi } from "@/lib/ui-store";

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

function SiteFooter() {
  const { t } = useI18n();
  const setTermsOpen = useNovaUi((state) => state.setTermsOpen);
  return (
    <footer className="mx-auto mt-10 flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-6 text-xs text-muted sm:px-6 lg:px-8">
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
        <div className="app-aura pointer-events-none fixed inset-0" />
        <div className="relative md:pb-20">
          <Navbar />
          {children}
          <SiteFooter />
        </div>
        <SupportPill />
        <OpenModals />
        <ThemedToaster />
      </div>
    </ProfileProvider>
  );
}
