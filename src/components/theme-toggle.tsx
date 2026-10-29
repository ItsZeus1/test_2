import { Moon, Sun } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { THEME_KEY, useNovaUi, type Theme } from "@/lib/ui-store";

/** Applies the theme to <html> and optionally remembers it on this device. */
export function applyTheme(theme: Theme, persist = false) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.dataset["theme"] = theme;
  root.style.colorScheme = theme;
  if (!persist) return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode */
  }
}

export function readSavedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Inline script for <head>: sets the class before first paint. New visitors get light. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}")==="dark"?"dark":"light";var r=document.documentElement;r.classList.remove("dark","light");r.classList.add(t);r.dataset.theme=t;r.style.colorScheme=t;}catch(e){}})();`;

function useThemeControl() {
  const theme = useNovaUi((state) => state.theme);
  const setTheme = useNovaUi((state) => state.setTheme);
  const choose = (next: Theme) => {
    setTheme(next);
    applyTheme(next, true);
  };
  return { theme, choose };
}

export function ThemeIconButton() {
  const { t } = useI18n();
  const { theme, choose } = useThemeControl();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => choose(dark ? "light" : "dark")}
      aria-label={dark ? t.themeToLight : t.themeToDark}
      title={dark ? t.themeToLight : t.themeToDark}
      className="hidden size-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 transition hover:border-violet/60 md:grid"
    >
      {dark ? <Sun className="size-[18px] text-amber-300" /> : <Moon className="size-[18px] text-violet" />}
    </button>
  );
}

/** Segmented Light / Dark control used in the mobile drawer and profile settings. */
export function ThemeSegmented({ label }: { label?: string }) {
  const { t } = useI18n();
  const { theme, choose } = useThemeControl();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <span className="text-sm font-semibold">{label ?? t.themeLabel}</span>
      <div className="grid flex-1 grid-cols-2 gap-1 rounded-full border border-white/10 p-1 sm:max-w-64" role="group" aria-label={label ?? t.themeLabel}>
        {(["light", "dark"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => choose(value)}
            className={`min-h-10 rounded-full px-3 text-xs font-bold transition ${theme === value ? "seg-active" : "text-muted hover:text-white"}`}
          >
            {value === "light" ? t.themeLight : t.themeDark}
          </button>
        ))}
      </div>
    </div>
  );
}
