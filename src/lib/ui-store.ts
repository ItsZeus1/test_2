"use client";

import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";

import type { Currency } from "@/lib/store/types";

export type Lang = "ar" | "en";
export const CURRENCY_KEY = "novacharge.currency";
export type Theme = "light" | "dark";
export const THEME_KEY = "novacharge-theme";

type ServiceModal = null | { mode: "create" } | { mode: "edit"; slug: string };
type TopUpModal = null | { mode: "self" } | { mode: "user"; userId: string; name: string; currency?: Currency };

type NovaUi = {
  revision: number;
  language: Lang;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  serviceModal: ServiceModal;
  topUp: TopUpModal;
  profileOpen: boolean;
  /** Login / register in flight: keeps the loading overlay up and holds the "already signed in" redirect. */
  authLoading: "login" | "register" | null;
  setAuthLoading: (value: "login" | "register" | null) => void;
  /** Flips true the moment the startup skeleton has faded out; entrance animations wait for it. */
  isHydratedAndVisible: boolean;
  setHydratedAndVisible: (value: boolean) => void;
  /** Login/register finished: lets the HUD show 100% before it closes. */
  authDone: boolean;
  authSummary: string;
  setAuthSummary: (value: string) => void;
  setAuthDone: (value: boolean) => void;
  termsOpen: boolean;
  setTermsOpen: (open: boolean) => void;
  termsTab: "terms" | "cookies";
  openPolicy: (tab: "terms" | "cookies") => void;
  supportOpen: boolean;
  setSupportOpen: (open: boolean) => void;
  heroManagerOpen: boolean;
  /** Full-screen views opened from the bottom dock. */
  dockView: null | "groups" | "me";
  setDockView: (view: null | "groups" | "me") => void;
  /** Sub-view inside "Me": the hub, or the account-settings page. */
  meSub: "home" | "settings";
  setMeSub: (sub: "home" | "settings") => void;
  feedOpen: boolean;
  setFeedOpen: (open: boolean) => void;
  setHeroManagerOpen: (open: boolean) => void;
  bump: () => void;
  setLanguage: (language: Lang) => void;
  /** Currency shown to logged-out visitors (signed-in users always see their own). */
  previewCurrency: Currency;
  setPreviewCurrency: (currency: Currency) => void;
  openCreateService: () => void;
  openEditService: (slug: string) => void;
  closeServiceModal: () => void;
  openSelfTopUp: () => void;
  openUserTopUp: (userId: string, name: string, currency?: Currency) => void;
  closeTopUp: () => void;
  openProfile: () => void;
  closeProfile: () => void;
};

export const useNovaUi = create<NovaUi>((set) => ({
  revision: 0,
  // v30: Arabic (RTL) for every newcomer; English only after the visitor picks it.
  language: "ar",
  previewCurrency: "USD",
  theme: "light",
  setTheme: (theme) => set({ theme }),
  serviceModal: null,
  topUp: null,
  profileOpen: false,
  authLoading: null,
  setAuthLoading: (authLoading) => set({ authLoading }),
  isHydratedAndVisible: false,
  setHydratedAndVisible: (isHydratedAndVisible) => set({ isHydratedAndVisible }),
  authDone: false,
  authSummary: "",
  setAuthSummary: (authSummary) => set({ authSummary }),
  setAuthDone: (authDone) => set({ authDone }),
  termsOpen: false,
  termsTab: "terms",
  openPolicy: (termsTab) => set({ termsOpen: true, termsTab }),
  setTermsOpen: (termsOpen) => set({ termsOpen }),
  supportOpen: false,
  setSupportOpen: (supportOpen) => set({ supportOpen }),
  heroManagerOpen: false,
  dockView: null,
  setDockView: (dockView) => set({ dockView, meSub: "home", profileOpen: false }),
  meSub: "home",
  setMeSub: (meSub) => set({ meSub }),
  feedOpen: false,
  setFeedOpen: (feedOpen) => set({ feedOpen }),
  setHeroManagerOpen: (heroManagerOpen) => set({ heroManagerOpen }),
  bump: () => set((state) => ({ revision: state.revision + 1 })),
  setLanguage: (language) => set({ language }),
  setPreviewCurrency: (previewCurrency) => {
    set({ previewCurrency });
    try {
      window.localStorage.setItem(CURRENCY_KEY, previewCurrency);
    } catch {
      /* private mode */
    }
  },
  openCreateService: () => set({ serviceModal: { mode: "create" } }),
  openEditService: (slug) => set({ serviceModal: { mode: "edit", slug } }),
  closeServiceModal: () => set({ serviceModal: null }),
  openSelfTopUp: () => set({ topUp: { mode: "self" } }),
  openUserTopUp: (userId, name, currency) => set({ topUp: { mode: "user", userId, name, currency } }),
  closeTopUp: () => set({ topUp: null }),
  // Account settings is an in-page view of "Me" (no floating modal that could get stuck).
  openProfile: () => set({ dockView: "me", meSub: "settings", profileOpen: false }),
  closeProfile: () => set({ meSub: "home", profileOpen: false }),
}));

/* ------------------------------------------------------------------
 * One shared scroll listener for the whole app (passive + one update per frame).
 * Subscribers get (scrollY, deltaY) once per animation frame and should only
 * call setState when a boolean they derive actually flips.
 * ------------------------------------------------------------------ */
type ScrollListener = (y: number, dy: number) => void;
const scrollListeners = new Set<ScrollListener>();
let scrollBound = false;
let lastScrollY = 0;
let scrollTicking = false;

export function subscribeScroll(listener: ScrollListener): () => void {
  scrollListeners.add(listener);
  if (!scrollBound && typeof window !== "undefined") {
    scrollBound = true;
    lastScrollY = window.scrollY;
    window.addEventListener(
      "scroll",
      () => {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(() => {
          scrollTicking = false;
          const y = window.scrollY;
          const dy = y - lastScrollY;
          lastScrollY = y;
          scrollListeners.forEach((fn) => fn(y, dy));
        });
      },
      { passive: true },
    );
  }
  return () => {
    scrollListeners.delete(listener);
  };
}


/** Visible build tag (side-menu footer + admin header). Bump on every release. */
export const APP_VERSION = "v38.0";

/**
 * Anti-spam cooldown kept in localStorage (a refresh cannot skip it).
 * Returns the whole seconds left (0 = ready) and `start()` to begin a new cooldown.
 */
export function useCooldown(storageKey: string, durationMs: number) {
  const read = useCallback(() => {
    try {
      const at = Number(window.localStorage.getItem(storageKey) ?? 0);
      return Math.max(0, Math.ceil((at + durationMs - Date.now()) / 1000));
    } catch {
      return 0;
    }
  }, [storageKey, durationMs]);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    setLeft(read());
  }, [read]);
  const running = left > 0;
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const next = read();
      setLeft(next);
      if (next <= 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, read]);
  const start = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, String(Date.now()));
    } catch {
      /* storage blocked: the in-memory countdown still runs */
    }
    setLeft(Math.ceil(durationMs / 1000));
  }, [storageKey, durationMs]);
  return { left, start };
}

/* ------------------------------ v30: page scroll lock for full-screen popups ------------------------------ */

type LenisLike = { stop: () => void; start: () => void };
let scrollLocks = 0;
let savedBody = "";
let savedHtml = "";

function lenis(): LenisLike | undefined {
  return (window as Window & { __zovaLenis?: LenisLike }).__zovaLenis;
}

/**
 * While `active`, the page behind a popup cannot move at all: body + html overflow hidden,
 * Lenis smooth scroll stopped. Nested popups share one lock; the last one to close releases it.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;
    if (scrollLocks === 0) {
      savedBody = document.body.style.overflow;
      savedHtml = document.documentElement.style.overflow;
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
      lenis()?.stop();
    }
    scrollLocks += 1;
    return () => {
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) {
        document.body.style.overflow = savedBody;
        document.documentElement.style.overflow = savedHtml;
        lenis()?.start();
      }
    };
  }, [active]);
}
