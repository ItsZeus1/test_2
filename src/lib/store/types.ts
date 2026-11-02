export const CATEGORIES = [
  {
    slug: "games",
    label: "Games",
    kicker: "Battle passes & currency",
    summary: "PUBG, Free Fire, Valorant, Jawaker, and Mobile Legends.",
  },
  {
    slug: "apps",
    label: "Apps",
    kicker: "Live gifts & coins",
    summary: "TikTok Coins, Bigo Live, SoulChill, and Likee.",
  },
  {
    slug: "subscriptions",
    label: "Subscriptions",
    kicker: "Wallets & memberships",
    summary: "PlayStation, Steam, Netflix, Spotify, and iTunes.",
  },
  {
    slug: "mobile",
    label: "Mobile Charge",
    kicker: "Telecom & data",
    summary: "Instant data bundles sent to a phone number.",
  },
] as const;

export type Category = (typeof CATEGORIES)[number]["slug"];
export type Role = "NORMAL" | "VIP" | "ADMIN";
export type Rate = "standard" | "vip";
export type Currency = "USD" | "SYP";

export type Profile = {
  userId: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  avatarUrl: string;
  role: Role;
  /** Account currency, chosen at registration. Wallet balance is in this currency (minor units). */
  currency: Currency;
  balanceCents: number;
  lastIp: string | null;
  isBlocked: boolean;
};

export type CatalogService = {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  category: Category;
  description: string;
  descriptionAr: string;
  badge: string | null;
  imageUrl: string;
  startingPriceCents: number;
  currency: Currency;
  rate: Rate;
};

export type PublicPackage = {
  id: string;
  sizeName: string;
  priceCents: number;
  rate: Rate;
};

export type ServiceDetail = CatalogService & {
  instructions: string;
  targetLabel: string;
  packages: PublicPackage[];
};

export type AdminPackage = {
  id: string;
  sizeName: string;
  normalPriceCents: number;
  vipPriceCents: number;
  /** Explicit SYP prices (minor units). 0 means "derive from the USD price and the SYP rate". */
  normalPriceSypCents: number;
  vipPriceSypCents: number;
  apiEndpoint: string;
  apiSecretCode: string;
};

export type AdminService = {
  id: string;
  name: string;
  nameAr: string;
  descriptionAr: string;
  slug: string;
  category: Category;
  description: string;
  instructions: string;
  badge: string | null;
  imageUrl: string;
  packages: AdminPackage[];
};

export type OrderRow = {
  id: string;
  serviceName: string;
  serviceSlug: string;
  packageName: string;
  targetId: string;
  priceCents: number;
  currency: Currency;
  status: string;
  fulfillmentRef: string;
  createdAt: string;
};

export type AdminOrder = OrderRow & {
  userName: string;
  username: string;
  ipAddress: string | null;
};

export type AdminUser = {
  userId: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  currency: Currency;
  balanceCents: number;
  lastIp: string | null;
  lastSeenAt: string;
  isBlocked: boolean;
};

export type AdminStats = {
  onlineSessions: number;
  serviceCount: number;
  revenueCents: number;
  recent: AdminOrder[];
};

export type ServiceWrite = {
  id?: string;
  name: string;
  slug: string;
  category: Category;
  nameAr?: string;
  descriptionAr?: string;
  description: string;
  instructions: string;
  badge: string;
  imageUrl: string;
  packages: Array<{
    id?: string;
    sizeName: string;
    normalPriceCents: number;
    vipPriceCents: number;
    normalPriceSypCents: number;
    vipPriceSypCents: number;
    apiEndpoint: string;
    apiSecretCode: string;
  }>;
};

export type BalanceStatus = "PROCESSING" | "APPROVED" | "REJECTED";

export type BalanceRequest = {
  id: string;
  userId: string;
  username: string;
  cents: number;
  status: BalanceStatus;
  note: string;
  referenceNote: string;
  currency: Currency;
  createdAt: string;
};

export function isCategory(value: string): value is Category {
  return CATEGORIES.some((category) => category.slug === value);
}

export function targetLabel(category: Category): string {
  if (category === "mobile") return "Phone number";
  if (category === "subscriptions") return "Account email or ID";
  if (category === "apps") return "Account ID";
  return "Player ID";
}

export function categoryLabel(slug: string): string {
  return CATEGORIES.find((category) => category.slug === slug)?.label ?? slug;
}

export type StoreSettings = {
  shamcashAddress: string;
  /** SYP per 1 USD, used when a package has no explicit SYP price. */
  sypRate?: number;
  /** Offer banner photos shown after the first hero slide (https URLs or data:image). */
  heroBanners?: string[];
  offersTickerText?: string;
  offersTickerTextAr?: string;
};
