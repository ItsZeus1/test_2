"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useProfileState } from "@/components/profile";
import { useNovaUi } from "@/lib/ui-store";

import { AuthPortal } from "@/components/auth-portal";
import { useI18n } from "@/lib/i18n";

export function LoginPage() {
  const tab = useSearchParams().get("tab");
  const { t } = useI18n();
  const router = useRouter();
  const { profile, ready } = useProfileState();
  const authLoading = useNovaUi((state) => state.authLoading);
  // Signed-in users never see /login or /register (which redirects here).
  useEffect(() => {
    if (ready && profile && !authLoading) router.replace("/");
  }, [ready, profile, authLoading, router]);
  if (!ready) return null;
  if (profile && !authLoading) return null;
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] place-items-center px-0 py-10">
      <div className="flex w-full flex-col items-center">
        <p className="mb-3 text-center font-display text-3xl font-extrabold tracking-tight">{t.welcomeBack}</p>
        <AuthPortal initialTab={tab === "register" ? "register" : "login"} />
      </div>
    </main>
  );
}
