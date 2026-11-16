"use client";

import { useI18n } from "@/lib/i18n";
import { useNovaUi, type Lang } from "@/lib/ui-store";

const LANG_KEY = "novacharge.lang";

/** AR / EN switch. Lives in the side menu and profile settings (not the crowded top bar). */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { t, language } = useI18n();
  const setLanguage = useNovaUi((state) => state.setLanguage);

  function choose(next: Lang) {
    setLanguage(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* private mode */
    }
  }

  return (
    <div className={`flex shrink-0 items-center rounded-full border border-white/15 bg-white/5 p-0.5 text-xs font-bold ${className}`} role="group" aria-label={t.langLabel}>
      {(["ar", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => choose(code)}
          aria-pressed={language === code}
          className={`min-h-10 rounded-full px-3 ${language === code ? "bg-white/15 text-white" : "text-muted"}`}
        >
          {code === "ar" ? "العربية" : "English"}
        </button>
      ))}
    </div>
  );
}
