"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ScrollText, X } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { COOKIE_POLICY, TERMS } from "@/lib/terms";
import { useNovaUi } from "@/lib/ui-store";

/** Readable Terms & Conditions sheet, opened from the sign-up form and the site footer. */
export function TermsModal() {
  const { t, language } = useI18n();
  const open = useNovaUi((state) => state.termsOpen);
  const setOpen = useNovaUi((state) => state.setTermsOpen);
  const tab = useNovaUi((state) => state.termsTab);
  const openPolicy = useNovaUi((state) => state.openPolicy);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open || typeof document === "undefined") return null;
  const ar = language === "ar";
  const clauses = (tab === "cookies" ? COOKIE_POLICY : TERMS)[ar ? "ar" : "en"];

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-md sm:p-6" role="presentation">
      <button type="button" aria-label={t.close} className="absolute inset-0 cursor-default" onClick={() => setOpen(false)} />
      <article
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-title"
        className="modal-pop relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[var(--nc-card-solid)] shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-indigo-500/12 text-indigo-500">
            <ScrollText className="size-5" />
          </span>
          <h2 id="terms-title" className="min-w-0 flex-1 font-display text-lg font-extrabold sm:text-xl">
            {tab === "cookies" ? (ar ? "سياسة ملفات تعريف الارتباط" : "Cookie Policy") : t.termsTitle}
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t.close}
            className="grid min-h-[40px] min-w-[40px] place-items-center rounded-xl border border-white/10 hover:bg-white/5"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="grid grid-cols-2 gap-1 border-b border-white/10 p-2" role="tablist">
          {(["terms", "cookies"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => openPolicy(id)}
              className={`min-h-10 rounded-xl text-xs font-bold sm:text-sm ${tab === id ? "keep-white bg-gradient-to-r from-indigo-600 to-sky-500 text-white" : "text-muted"}`}
            >
              {id === "terms" ? t.termsTitle : ar ? "سياسة ملفات تعريف الارتباط" : "Cookie Policy"}
            </button>
          ))}
        </div>
        <ol className="terms-list flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          {clauses.map((clause, index) => (
            <li key={clause.title} className="flex gap-3">
              <span className="price-num mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-indigo-500/10 text-xs text-indigo-500">{index + 1}</span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold">{clause.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{clause.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <footer className="border-t border-white/10 px-4 py-3 sm:px-6">
          <button type="button" onClick={() => setOpen(false)} className="btn-glow keep-white min-h-11 w-full rounded-2xl text-sm font-bold text-white">
            {t.close}
          </button>
        </footer>
      </article>
    </div>,
    document.body,
  );
}
