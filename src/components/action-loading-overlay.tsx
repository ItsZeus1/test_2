"use client";

import { createPortal } from "react-dom";

import { useI18n } from "@/lib/i18n";

export type LoadingAction = "login" | "register" | "purchase" | "topup";

const TEXT: Record<LoadingAction, { ar: string; en: string }> = {
  login: { ar: "جاري تسجيل الدخول...", en: "Signing you in..." },
  register: { ar: "جاري إنشاء حسابك...", en: "Creating your account..." },
  purchase: { ar: "جاري تنفيذ طلب الشحن...", en: "Processing your top-up..." },
  topup: { ar: "جاري إرسال طلب شام كاش...", en: "Sending your ShamCash request..." },
};

export const MIN_LOADING_MS = 3000;

/** Resolves with the request's result, but never before `ms` has passed. */
export async function withMinDelay<T>(request: Promise<T>, ms = MIN_LOADING_MS): Promise<T> {
  const [result] = await Promise.all([request, new Promise((resolve) => setTimeout(resolve, ms))]);
  return result;
}

/** Colorful kinetic loading capsule shown while login, purchase or top-up requests run. */
export function ActionLoadingOverlay({ action }: { action: LoadingAction | null }) {
  const { language } = useI18n();
  if (!action || typeof document === "undefined") return null;
  const text = TEXT[action][language === "ar" ? "ar" : "en"];
  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-6 backdrop-blur-md" role="status" aria-live="polite" aria-busy="true">
      <div className="loader-capsule modal-pop w-full max-w-xs rounded-[2rem] px-6 pt-7 pb-6 text-center">
        <div className="loader-orbits mx-auto" aria-hidden>
          <span className="aurora-core" />
          <span className="orbit o1" />
          <span className="orbit o2" />
          <span className="orbit o3" />
        </div>
        <p className="mt-5 text-sm font-bold text-fg">{text}</p>
        <div className="loader-bar mt-4" aria-hidden>
          <span />
        </div>
      </div>
    </div>,
    document.body,
  );
}
