import type { Currency } from "@/lib/store/types";

/** Default New Syrian Pounds per 1 USD. Admin overrides it in Store settings. */
export const DEFAULT_SYP_RATE = 120;
const PREVIEW_KEY = "novacharge.currency.v1";

function docLang(): "ar" | "en" {
  if (typeof document === "undefined") return "en";
  return document.documentElement.lang === "ar" ? "ar" : "en";
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** New Syrian Pound. Whole pounds unless the amount has piastres. */
export function formatSyp(cents: number, lang: "ar" | "en" = docLang()): string {
  const value = cents / 100;
  const whole = Number.isInteger(value);
  const number = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
  return lang === "ar" ? `${number} ل.س` : `${number} SYP`;
}

export function formatMoney(cents: number, currency: Currency = "USD", lang?: "ar" | "en"): string {
  return currency === "SYP" ? formatSyp(cents, lang) : formatUsd(cents);
}

export function currencySymbol(currency: Currency, lang: "ar" | "en" = docLang()): string {
  if (currency === "USD") return "$";
  return lang === "ar" ? "ل.س" : "SYP";
}

export function currencyLabel(currency: Currency, lang: "ar" | "en" = docLang()): string {
  if (currency === "USD") return lang === "ar" ? "الدولار الأمريكي (USD $)" : "US Dollar (USD $)";
  return lang === "ar" ? "الليرة السورية الجديدة (SYP ل.س)" : "New Syrian Pound (SYP ل.س)";
}

/** Parses "12", "12.5", "1200.00" into minor units. Works for USD and SYP. */
export function dollarsToCents(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const cents = Math.round(Number(trimmed) * 100);
  if (!Number.isFinite(cents) || cents < 0) return null;
  return cents;
}

export const amountToCents = dollarsToCents;

export function centsToField(cents: number): string {
  if (!cents) return "";
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** USD cents -> SYP minor units, rounded to whole pounds. */
export function usdToSypCents(usdCents: number, rate: number): number {
  const safe = Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_SYP_RATE;
  return Math.round((usdCents * safe) / 100) * 100;
}

/** Smallest amount accepted for top-ups and credits, per currency. */
export function minTopUpCents(currency: Currency): number {
  return currency === "SYP" ? 10_000 : 100;
}

// Visitor preview currency (logged-out users). Signed-in users always use their account currency.
export function readPreviewCurrency(): Currency {
  if (typeof window === "undefined") return "USD";
  try {
    return window.localStorage.getItem(PREVIEW_KEY) === "SYP" ? "SYP" : "USD";
  } catch {
    return "USD";
  }
}

export function writePreviewCurrency(currency: Currency): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREVIEW_KEY, currency);
  } catch {
    /* private mode */
  }
}
