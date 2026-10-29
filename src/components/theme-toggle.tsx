import { Moon, Sun } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { useNovaUi, type Theme } from "@/lib/ui-store";

/** Sleek sun/moon icon button for the desktop navbar. */
export function ThemeIconButton() {
  const { t } = useI18n();
  const theme = useNovaUi((state) => state.theme);
  const toggleTheme = useNovaUi((state) => state.toggleTheme);
  const dark = theme === "dark";
  const label = dark ? t.switchToLight : t.switchToDark;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="hidden size-11 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-muted transition hover:text-white md:grid"
    >
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}

/** Full-width switch row for the mobile side menu. */
export function ThemeSwitchRow() {
  const { t } = useI18n();
  const theme = useNovaUi((state) => state.theme);
  const toggleTheme = useNovaUi((state) => state.toggleTheme);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? t.switchToLight : t.switchToDark}
      onClick={toggleTheme}
      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-start text-sm font-semibold"
    >
      <span className="min-w-0 flex-1 truncate">{t.themeBoth}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${dark ? "bg-indigo" : "bg-slate-300"}`}>
        <span
          className={`absolute top-0.5 grid size-6 place-items-center rounded-full bg-white text-slate-900 shadow transition-all ${dark ? "end-0.5" : "start-0.5"}`}
        >
          {dark ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
        </span>
      </span>
    </button>
  );
}

/** "Appearance" segmented control for profile settings. */
export function ThemeSegmented() {
  const { t } = useI18n();
  const theme = useNovaUi((state) => state.theme);
  const setTheme = useNovaUi((state) => state.setTheme);
  const options: Array<{ id: Theme; label: string }> = [
    { id: "light", label: `${t.themeLight} ☀️` },
    { id: "dark", label: `${t.themeDark} 🌙` },
  ];
  return (
    <div className="mt-4">
      <p className="text-sm text-muted">{t.appearance}</p>
      <div className="mt-1 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-white/5 p-1" role="group" aria-label={t.appearance}>
        {options.map((option) => {
          const active = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => setTheme(option.id, true)}
              className={`min-h-10 rounded-full px-3 text-sm font-semibold transition ${active ? "keep-white bg-gradient-to-r from-indigo to-violet text-white shadow" : "text-muted hover:text-white"}`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
