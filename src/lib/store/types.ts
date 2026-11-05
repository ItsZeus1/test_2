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
/** Wallet top-up channels. */
export type PaymentMethod = "SHAMCASH" | "SYRIATEL_CASH" | "MTN_CASH";
export const PAYMENT_METHODS: PaymentMethod[] = ["SHAMCASH", "SYRIATEL_CASH", "MTN_CASH"];

export type PaymentAddresses = Record<PaymentMethod, string>;

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
  /** VIP only: resale margin the user plans to add (0–25 %). */
  vipProfitMargin: number;
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
  method: PaymentMethod;
  /** ShamCash: sender full name (اسم المرسل). */
  senderName: string;
  /** Syriatel / MTN Cash: number the money was sent from (رقم المرسل منه). */
  senderPhone: string;
  /** ShamCash transfer reference number (رقم التحويل). */
  transferNumber: string;
  currency: Currency;
  createdAt: string;
  /** When the admin approved / rejected it. */
  processedAt: string | null;
};

export type SupportStatus = "OPEN" | "ANSWERED" | "CLOSED";

export type SupportMessage = {
  id: string;
  sender: "USER" | "ADMIN";
  text: string;
  createdAt: string;
};

export type SupportTicket = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  status: SupportStatus;
  messages: SupportMessage[];
  /** New message the other side has not opened yet. */
  unreadByAdmin: boolean;
  unreadByUser: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WalletTxn = {
  id: string;
  kind: "purchase" | "self_topup" | "admin_topup" | "refund";
  cents: number;
  note: string;
  createdAt: string;
};

export type TopupTiming = {
  /** Average minutes from submit to approval across recent approvals (null = not enough data). */
  averageMinutes: number | null;
  /** Admin-configured fallback shown when there is not enough data. */
  fallbackMinutes: number;
  sampleSize: number;
};

export type UserDossier = {
  user: AdminUser & { phone: string; createdAt: string; hasPassword: boolean; vipProfitMargin: number };
  orders: Array<OrderRow & { ipAddress: string | null }>;
  requests: BalanceRequest[];
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
  syriatelCashAddress?: string;
  mtnCashAddress?: string;
  /** SYP per 1 USD, used when a package has no explicit SYP price. */
  sypRate?: number;
  /** Fallback ShamCash approval time shown to users (minutes). */
  avgTopupMinutes?: number;
  /** Offer banner photos shown after the first hero slide (https URLs or data:image). */
  heroBanners?: string[];
  offersTickerText?: string;
  offersTickerTextAr?: string;
};
