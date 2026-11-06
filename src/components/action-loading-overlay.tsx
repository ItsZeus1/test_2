"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ShieldCheck } from "lucide-react";

import { useI18n } from "@/lib/i18n";

export type LoadingAction = "login" | "register" | "purchase" | "topup";

const TITLE: Record<LoadingAction, { ar: string; en: string }> = {
  login: { ar: "جاري تسجيل الدخول", en: "Signing you in" },
  register: { ar: "جاري إنشاء حسابك", en: "Creating your account" },
  purchase: { ar: "جاري تنفيذ طلب الشحن", en: "Processing your top-up" },
  topup: { ar: "جاري إرسال طلب الشحن", en: "Sending your wallet request" },
};

const STEPS = [
  { ar: "تأمين الاتصال المشفر", en: "Securing Encrypted Channel" },
  { ar: "التحقق من بيانات الحساب والرصيد", en: "Verifying Account & Balance" },
  { ar: "إتمام العملية وتحديث المحفظة", en: "Finalizing Transaction" },
];

const SEGMENTS = 20;
/** How long the HUD stays at 100% before closing (just enough to read "done"). */
export const HUD_FINISH_MS = 420;

/**
 * Live progress: eases toward ~92% while the request runs (never pretending to be done),
 * then completes to 100% the moment the request resolves.
 */
function useHudProgress(active: boolean, done: boolean): number {
  const [progress, setProgress] = useState(0);
  const start = useRef(0);
  const doneAt = useRef<{ time: number; from: number } | null>(null);
  const progressRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      progressRef.current = 0;
      doneAt.current = null;
      return;
    }
    start.current = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      let value: number;
      if (doneAt.current) {
        const t = Math.min(1, (now - doneAt.current.time) / 260);
        value = doneAt.current.from + (100 - doneAt.current.from) * (1 - (1 - t) ** 3);
      } else {
        value = 92 * (1 - Math.exp(-(now - start.current) / 650));
      }
      progressRef.current = value;
      setProgress(value);
      if (value < 100) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    if (active && done && !doneAt.current) doneAt.current = { time: performance.now(), from: progressRef.current };
  }, [active, done]);

  return progress;
}

/** Command-telemetry HUD shown while login, purchase or top-up requests run. */
export function ActionLoadingOverlay({ action, summary, done = false }: { action: LoadingAction | null; summary?: string; done?: boolean }) {
  const { language } = useI18n();
  const lang = language === "ar" ? "ar" : "en";
  const progress = useHudProgress(Boolean(action), done);
  if (!action || typeof document === "undefined") return null;
  const pct = Math.round(progress);
  const reached = [progress >= 28, progress >= 62, done && progress >= 99];
  const filled = Math.round((progress / 100) * SEGMENTS);

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-5 backdrop-blur-sm" role="status" aria-live="polite" aria-busy={!done}>
      <div className="hud-card modal-pop w-full max-w-sm rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="hud-badge grid size-11 shrink-0 place-items-center rounded-2xl">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold tracking-[0.2em] text-muted uppercase">NovaCharge · Secure</p>
            <h2 className="font-display text-base font-extrabold sm:text-lg">
              {TITLE[action][lang]}
              {done ? "" : "…"}
            </h2>
            {summary ? (
              <p className="mt-0.5 truncate text-xs font-semibold text-muted" title={summary}>
                {summary}
              </p>
            ) : null}
          </div>
          <span className="price-num shrink-0 text-xl tabular-nums" dir="ltr">
            {pct}%
          </span>
        </div>

        <ol className="mt-4 space-y-2">
          {STEPS.map((step, index) => {
            const ok = reached[index];
            const current = !ok && (index === 0 || reached[index - 1]);
            return (
              <li key={step.en} className={`hud-step flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${ok ? "is-done" : current ? "is-current" : ""}`}>
                <span className="hud-tick grid size-5 shrink-0 place-items-center rounded-full">
                  {ok ? <Check className="size-3.5" strokeWidth={3} /> : <span className="hud-dot" />}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {index + 1}. {step[lang]}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex gap-1" dir="ltr" aria-hidden>
          {Array.from({ length: SEGMENTS }).map((_, index) => (
            <span key={index} className={`hud-seg h-1.5 flex-1 rounded-full ${index < filled ? "is-on" : ""}`} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Runs a request behind the HUD: shows it immediately, completes the bar the moment the
 * request resolves, holds 100% for a beat, then closes. Returns the request's result.
 */
export function useActionHud() {
  const [state, setState] = useState<{ action: LoadingAction; summary?: string; done: boolean } | null>(null);
  const run = useCallback(async <T,>(action: LoadingAction, summary: string | undefined, request: Promise<T>): Promise<T> => {
    setState({ action, summary, done: false });
    try {
      return await request;
    } finally {
      setState((current) => (current ? { ...current, done: true } : current));
      await new Promise((resolve) => setTimeout(resolve, HUD_FINISH_MS));
      setState(null);
    }
  }, []);
  const element = <ActionLoadingOverlay action={state?.action ?? null} summary={state?.summary} done={state?.done} />;
  return { run, element, active: Boolean(state) };
}
