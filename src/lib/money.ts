import type { Currency } from "@/lib/store/types";

export const CURRENCIES: Currency[] = ["USD", "SYP"];
/** Placeholder default (SYP per 1 USD). The admin sets the real rate in the dashboard. */
export const DEFAULT_SYP_RATE = 110;

export function isCurrency(value: unknown): value is Currency {
  return value === "USD" || value === "SYP";
}

/** `minor` is cents for USD and qirsh (1/100 pound) for SYP. */
export function formatMoney(minor: number, currency: Currency = "USD", language: "ar" | "en" = "en"): string {
  const amount = minor / 100;
  if (currency === "SYP") {
    const number = new Intl.NumberFormat(language === "ar" ? "ar-SY-u-nu-latn" : "en-US", {
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
    return language === "ar" ? `${number} ل.س` : `${number} SYP`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export function formatUsd(cents: number): string {
  return formatMoney(cents, "USD");
}

export function currencyName(currency: Currency, language: "ar" | "en"): string {
  if (currency === "SYP") return language === "ar" ? "الليرة السورية الجديدة (ل.س)" : "New Syrian Pound (SYP)";
  return language === "ar" ? "الدولار الأمريكي ($)" : "US Dollar (USD)";
}

export function currencyCode(currency: Currency, language: "ar" | "en"): string {
  return currency === "SYP" ? (language === "ar" ? "ل.س" : "SYP") : "$";
}

/** Parses "12.50" into minor units. Same rule for both currencies. */
export function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const cents = Math.round(Number(trimmed) * 100);
  if (!Number.isFinite(cents) || cents < 0) return null;
  return cents;
}

export const amountToMinor = dollarsToCents;

export function minorToField(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** USD cents -> SYP minor units, rounded to a whole pound. */
export function sypFromUsd(usdCents: number, rate: number): number {
  return Math.round((usdCents / 100) * rate) * 100;
}

/** Balance ceiling per currency (minor units). */
export function balanceCap(currency: Currency): number {
  return currency === "SYP" ? 200_000_000_000 : 2_000_000_000;
}
