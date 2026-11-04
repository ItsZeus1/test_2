"use client";

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
  termsOpen: boolean;
  setTermsOpen: (open: boolean) => void;
  supportOpen: boolean;
  setSupportOpen: (open: boolean) => void;
  heroManagerOpen: boolean;
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
  language: "en",
  previewCurrency: "USD",
  theme: "light",
  setTheme: (theme) => set({ theme }),
  serviceModal: null,
  topUp: null,
  profileOpen: false,
  authLoading: null,
  setAuthLoading: (authLoading) => set({ authLoading }),
  termsOpen: false,
  setTermsOpen: (termsOpen) => set({ termsOpen }),
  supportOpen: false,
  setSupportOpen: (supportOpen) => set({ supportOpen }),
  heroManagerOpen: false,
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
  openProfile: () => set({ profileOpen: true }),
  closeProfile: () => set({ profileOpen: false }),
}));
