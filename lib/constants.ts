export const ADMIN_EMAIL = "majd@elmadani.com";

export const CATEGORY_SLUGS = ["games", "apps", "subscriptions", "mobile"] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export const CATEGORIES: { slug: CategorySlug; label: string }[] = [
  { slug: "games", label: "Games" },
  { slug: "apps", label: "Apps" },
  { slug: "subscriptions", label: "Subscriptions" },
  { slug: "mobile", label: "Mobile Charge" },
];

export const PAYMENT_METHODS = [
  "USDT",
  "Whish Money",
  "Syriatel Cash",
  "MTN Cash",
  "Bank Transfer",
  "Promo Voucher",
] as const;

export const WHATSAPP_URL = process.env.NEXT_PUBLIC_WHATSAPP_URL || "https://wa.me/";
export const TELEGRAM_URL = process.env.NEXT_PUBLIC_TELEGRAM_URL || "https://t.me/";
