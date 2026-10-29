import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { Navbar } from "@/components/navbar";
import { ProfileProvider, ProfileSettingsModal } from "@/components/profile";
import { ServiceFormModal } from "@/components/service-form-modal";
import { SupportPill } from "@/components/support-pill";
import { TopUpModal } from "@/components/topup-modal";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ProfileProvider>
      <div className="relative min-h-screen bg-ink text-fg">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.28),transparent_55%)]" />
        <div className="relative">
          <Navbar />
          {children}
        </div>
        <SupportPill />
        <TopUpModal />
        <ServiceFormModal />
        <ProfileSettingsModal />
        <Toaster theme="dark" />
      </div>
    </ProfileProvider>
  );
}
