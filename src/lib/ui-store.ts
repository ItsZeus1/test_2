import { create } from "zustand";

export type Lang = "ar" | "en";
export type Theme = "light" | "dark";

export const THEME_KEY = "novacharge.theme";
const THEME_COLORS: Record<Theme, string> = { light: "#F8FAFC", dark: "#07080D" };

/** Saved choice from localStorage (or the cookie fallback). `null` means a first-time visitor. */
export function readSavedTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* private mode */
  }
  const match = typeof document !== "undefined" ? document.cookie.match(/(?:^|; )novacharge\.theme=(light|dark)/) : null;
  return match ? (match[1] as Theme) : null;
}

/** Updates <html> class + data-theme immediately, and optionally persists the choice. */
export function applyTheme(theme: Theme, persist = false): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
  if (!persist) return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode */
  }
  document.cookie = `${THEME_KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

type ServiceModal = null | { mode: "create" } | { mode: "edit"; slug: string };
type TopUpModal = null | { mode: "self" } | { mode: "user"; userId: string; name: string };

type NovaUi = {
  revision: number;
  language: Lang;
  theme: Theme;
  serviceModal: ServiceModal;
  topUp: TopUpModal;
  profileOpen: boolean;
  bump: () => void;
  setLanguage: (language: Lang) => void;
  setTheme: (theme: Theme, persist?: boolean) => void;
  toggleTheme: () => void;
  openCreateService: () => void;
  openEditService: (slug: string) => void;
  closeServiceModal: () => void;
  openSelfTopUp: () => void;
  openUserTopUp: (userId: string, name: string) => void;
  closeTopUp: () => void;
  openProfile: () => void;
  closeProfile: () => void;
};

export const useNovaUi = create<NovaUi>((set, get) => ({
  revision: 0,
  language: "en",
  theme: "light",
  serviceModal: null,
  topUp: null,
  profileOpen: false,
  bump: () => set((state) => ({ revision: state.revision + 1 })),
  setLanguage: (language) => set({ language }),
  setTheme: (theme, persist = true) => {
    applyTheme(theme, persist);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === "light" ? "dark" : "light", true),
  openCreateService: () => set({ serviceModal: { mode: "create" } }),
  openEditService: (slug) => set({ serviceModal: { mode: "edit", slug } }),
  closeServiceModal: () => set({ serviceModal: null }),
  openSelfTopUp: () => set({ topUp: { mode: "self" } }),
  openUserTopUp: (userId, name) => set({ topUp: { mode: "user", userId, name } }),
  closeTopUp: () => set({ topUp: null }),
  openProfile: () => set({ profileOpen: true }),
  closeProfile: () => set({ profileOpen: false }),
}));
