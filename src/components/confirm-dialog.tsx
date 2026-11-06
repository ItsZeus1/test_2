"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, LogOut, ShieldCheck, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useNavigate } from "@/lib/nav";
import { logoutAccount } from "@/lib/store/api";

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

/** Sign-out with a confirmation step. Render it only for signed-in users. */
export function SignOutButton({ onDone, className = "" }: { onDone?: () => void; className?: string }) {
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await logoutAccount();
      setAsking(false);
      onDone?.();
      await navigate({ to: "/login", search: { tab: undefined } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-rose-400/30 px-4 text-sm font-semibold text-rose-500 hover:bg-rose-500/10 ${className}`}
      >
        <LogOut className="size-4" />
        {t.signOut}
      </button>
      <ConfirmDialog
        open={asking}
        busy={busy}
        tone="danger"
        title={language === "ar" ? "هل أنت متأكد من تسجيل الخروج؟" : "Are you sure you want to sign out?"}
        confirmLabel={t.signOut}
        onCancel={() => setAsking(false)}
        onConfirm={() => void signOut()}
      >
        {language === "ar" ? "يمكنك تسجيل الدخول مجدداً في أي وقت." : "You can sign back in at any time."}
      </ConfirmDialog>
    </>
  );
}
