"use client";

import { useSearchParams } from "next/navigation";

import { AuthPortal } from "@/components/auth-portal";
import { useI18n } from "@/lib/i18n";

export function LoginPage() {
  const tab = useSearchParams().get("tab");
  const { t } = useI18n();
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] place-items-center px-0 py-10">
      <div className="flex w-full flex-col items-center">
        <p className="mb-3 text-center font-display text-3xl font-extrabold tracking-tight">{t.welcomeBack}</p>
        <AuthPortal initialTab={tab === "register" ? "register" : "login"} />
      </div>
    </main>
  );
}
