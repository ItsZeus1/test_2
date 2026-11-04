"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";

type Tone = "default" | "danger";

/**
 * Centered confirmation modal with a scale-in animation.
 * Used before signing out and before a purchase is executed.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  tone?: Tone;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { language } = useI18n();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open || typeof document === "undefined") return null;
  const cancelText = language === "ar" ? "إلغاء" : "Cancel";
  const confirmText = confirmLabel ?? (language === "ar" ? "تأكيد" : "Confirm");
  const Icon = tone === "danger" ? AlertTriangle : ShieldCheck;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md sm:p-6" role="presentation">
      <button type="button" aria-label={cancelText} className="absolute inset-0 cursor-default" onClick={() => !busy && onCancel()} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="modal-pop relative w-full max-w-sm rounded-3xl border border-white/10 bg-[var(--nc-card-solid)] p-5 text-center shadow-2xl sm:p-6"
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label={cancelText}
          className="absolute end-3 top-3 grid min-h-[40px] min-w-[40px] place-items-center rounded-xl text-muted hover:bg-white/5"
        >
          <X className="size-4" />
        </button>
        <span
          className={`mx-auto grid size-14 place-items-center rounded-2xl ${tone === "danger" ? "bg-rose-500/12 text-rose-500" : "bg-indigo-500/12 text-indigo-500"}`}
          aria-hidden
        >
          <Icon className="size-7" />
        </span>
        <h2 id="confirm-title" className="mt-4 font-display text-lg font-extrabold sm:text-xl">
          {title}
        </h2>
        {children ? <div className="mt-3 text-sm text-muted">{children}</div> : null}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-12 rounded-2xl border border-white/15 bg-white/5 text-sm font-semibold disabled:opacity-60"
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`keep-white min-h-12 rounded-2xl text-sm font-bold text-white disabled:opacity-60 ${tone === "danger" ? "bg-gradient-to-r from-rose-500 to-orange-500" : "btn-glow"}`}
          >
            {busy ? "…" : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
