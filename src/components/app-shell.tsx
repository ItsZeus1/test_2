import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { Navbar } from "@/components/navbar";
import { ProfileProvider, ProfileSettingsModal } from "@/components/profile";
import { ServiceFormModal } from "@/components/service-form-modal";
import { SupportPill } from "@/components/support-pill";
import { TopUpModal } from "@/components/topup-modal";
import { useNovaUi } from "@/lib/ui-store";

export function AppShell({ children }: { children: ReactNode }) {
  const theme = useNovaUi((state) => state.theme);
  return (
    <ProfileProvider>
      <div className="relative min-h-screen overflow-x-clip bg-ink text-fg">
        <div className="page-glow pointer-events-none fixed inset-0" />
        <div className="relative">
          <Navbar />
          {children}
        </div>
        <SupportPill />
        <TopUpModal />
        <ServiceFormModal />
        <ProfileSettingsModal />
        <Toaster theme={theme} />
      </div>
    </ProfileProvider>
  );
}
