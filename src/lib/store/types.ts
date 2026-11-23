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
/** INSTANT = automatic provider delivery; MANUAL = admin fulfils it by hand (ISP / telecom). */
export type DeliverySpeed = "INSTANT" | "MANUAL";

/** A browsable group of services (the "الأقسام" view). */
export type ServiceGroup = {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  imageUrl: string;
  icon: string;
  order: number;
  /** Built-in groups can be renamed / re-imaged but not deleted. */
  builtIn?: boolean;
};

/** One entry in the user's 5-day notification feed. */
export type FeedItem = {
  id: string;
  kind: "topup" | "order" | "offer";
  title: string;
  body: string;
  status: string;
  receiptNumber: string;
  createdAt: string;
};
export type TargetInputType = "PLAYER_ID" | "LANDLINE_PHONE";
/** PACKAGES = fixed charge sizes · POINT_COUNTER = buy any number of points · VAULT = ready accounts/codes, no input. */
export type ServiceMode = "PACKAGES" | "POINT_COUNTER" | "VAULT";

/**
 * v31: one thing the customer must type at checkout (full name, email, player ID, server, link…).
 * When a service has customFields, they replace the single ID / phone box (`targetInputType`).
 */
export type CustomField = {
  id: string;
  labelAr: string;
  labelEn: string;
  placeholderAr?: string;
  placeholderEn?: string;
  required: boolean;
  /** v37: the Mega field this answer is sent as (e.g. "Player_ID"). */
  megaName?: string;
  /** v37: fixed choices (shown as a list instead of a text box). */
  options?: Array<{ value: string; label: string }>;
};

/**
 * v32.1: a region / type option of a service (iTunes USA · UAE · TRY, ChatGPT Plus · Go…).
 * The customer picks one first, then sees only that option's sizes.
 */
export type ServiceRegion = { id: string; nameAr: string; nameEn: string };
export const MAX_REGIONS = 12;

/** v31: what the customer entered for one custom field, kept on the order for the admin. */
export type OrderField = { id: string; labelAr: string; labelEn: string; value: string };

/** v32: one package of an imported service. `price` is in USD; `priceSyp` (optional) in whole SYP. */
export type ImportPackage = { sizeName: string; price: number; priceSyp?: number };

/** v32: one service from a crawled catalog — names, sizes and prices only, never another store's artwork. */
export type ImportService = {
  name: string;
  nameAr?: string;
  slug?: string;
  category?: string;
  description?: string;
  descriptionAr?: string;
  /** PACKAGES (default) or VAULT (codes / ready accounts sold from stock). */
  mode?: "PACKAGES" | "VAULT";
  /** INSTANT (default) or MANUAL (non-instant, reviewed by the admin). */
  speed?: "INSTANT" | "MANUAL";
  /** What the customer types: player ID (default) or landline number (internet bills). */
  input?: "PLAYER_ID" | "LANDLINE_PHONE";
  /** Store section (service group), e.g. "grp_isp". Defaults to the category's group. */
  groupId?: string;
  /** What to search the App Store for (defaults to the English name). */
  iconTerm?: string;
  /** No official app exists (internet providers, IPTV…): don't look for an icon. */
  noIcon?: boolean;
  /** What the customer must fill in at checkout (empty = the usual ID / phone box). */
  customFields?: CustomField[];
  /** Region / type options (sizes are added per region in the editor). */
  regions?: Array<{ nameAr: string; nameEn: string }>;
  /** Typed-amount services (bills): USD price per 100 units, minimum and step. */
  counter?: { per100Usd: number; min: number; step: number };
  packages: ImportPackage[];
};

/** Most custom fields a service can ask for, and most packages / sizes per service. */
export const MAX_CUSTOM_FIELDS = 8;
export const MAX_PACKAGES = 20;

/** Point-counter pricing, all in minor units per 100 points (SYP 0 = USD × rate). */
export type CounterPricing = {
  pricePer100UsdCents: number;
  vipPricePer100UsdCents: number;
  pricePer100SypCents: number;
  vipPricePer100SypCents: number;
  minPoints: number;
  stepPoints: number;
  /** v38: the price fields are per this many points (default 100; Mega quantity products use more for precision). */
  per?: number;
  /** v38: largest amount one order may ask for (0 / missing = no limit). */
  maxPoints?: number;
  /** v38: what one point is called ("توكن", "ل.س" …); default "pts". */
  unitName?: string;
  /** v38: linked Mega quantity product (price per unit, sent with qty = points). */
  megaProductId?: number;
  megaCostUsd?: number;
  megaActive?: boolean;
  megaName?: string;
};

/** v30: what a vault piece is — a gift-card / redeem code, or a ready account. */
export type VaultType = "REDEEM_CODE" | "ACCOUNT";

/**
 * One vault stock piece. Lives server-side only (Supabase `vault_items`, service role).
 * v30: tied to a service AND a package size (`packageId`; "" = any size of that service).
 * REDEEM_CODE uses `redeemCode` (+ `pinOrSerial`, `instructions` in extraInfo);
 * ACCOUNT uses `email` + `password` (+ `notes` in extraInfo).
 */
export type VaultItem = {
  id: string;
  serviceId: string;
  packageId: string;
  vaultType: VaultType;
  redeemCode: string;
  pinOrSerial: string;
  email: string;
  password: string;
  extraInfo: string;
  status: "AVAILABLE" | "SOLD";
  soldToUserId?: string;
  soldAt?: string;
  orderId?: string;
  receiptNumber?: string;
  createdAt: string;
};
export const LANDLINE_RE = /^0\d{2}-?\d{6,7}$/;

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
  /** One saved player ID / account per service slug. */
  savedPlayerIds: Record<string, string>;
  /** v38: favourite services (slugs, newest first). */
  favorites: string[];
  /** Signed up with Google and still needs a Syrian mobile number (+18 / terms). */
  needsCompletion: boolean;
  /** The user turned on device notifications (subscriptions themselves live in a server-only table). */
  notificationsEnabled: boolean;
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
  deliverySpeed: DeliverySpeed;
  targetInputType: TargetInputType;
  serviceMode: ServiceMode;
  groupId: string;
  /** v32: admin switched the service off for now — shown with an "out of stock" cover, not sold. */
  outOfStock?: boolean;
};

export type PublicPackage = {
  id: string;
  sizeName: string;
  priceCents: number;
  rate: Rate;
  /** v32.1: the region / type this size belongs to ("" = every region). */
  regionId?: string;
  /** v38.1: this size's own customer fields (replaces the service's when present). */
  customFields?: CustomField[];
};

export type ServiceDetail = CatalogService & {
  instructions: string;
  /** Arabic checkout instructions (always shown in Arabic mode). */
  instructionsAr: string;
  targetLabel: string;
  packages: PublicPackage[];
  /** v31: admin-defined checkout fields (empty = the classic single ID / phone box). */
  customFields: CustomField[];
  /** v32.1: region / type options, chosen before the sizes (empty = no region step). */
  regions: ServiceRegion[];
  /** POINT_COUNTER only: price per 100 points in the viewer's currency and role. */
  counter?: { pricePer100Cents: number; minPoints: number; stepPoints: number; per: number; maxPoints: number; unitName: string };
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
  regionId?: string;
  /** v38: read-only Mega link shown in the editor (kept on save). */
  megaProductId?: number;
  megaName?: string;
  megaCostUsd?: number;
  megaActive?: boolean;
  customFields?: CustomField[];
};

export type AdminService = {
  id: string;
  name: string;
  nameAr: string;
  descriptionAr: string;
  deliverySpeed: DeliverySpeed;
  targetInputType: TargetInputType;
  serviceMode: ServiceMode;
  counter: CounterPricing;
  groupId: string;
  slug: string;
  category: Category;
  description: string;
  instructions: string;
  instructionsAr: string;
  badge: string | null;
  imageUrl: string;
  packages: AdminPackage[];
  customFields: CustomField[];
  regions: ServiceRegion[];
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
  receiptNumber: string;
  createdAt: string;
  resolvedAt?: string | null;
  packageId?: string;
  /** v31: every custom field the customer filled in at checkout. */
  fields?: OrderField[];
  /** v38.1: account / details the admin delivered by hand. */
  delivery?: Array<{ label: string; value: string }>;
  /** v37: automatic delivery tracking (Mega). */
  tracking?: {
    status: string;
    orderNumber?: string;
    codes?: string[];
    note?: string;
    error?: string;
    history: Array<{ at: string; status: string; note?: string }>;
  };
};

export type AdminOrder = OrderRow & {
  /** v38.1: the service's section, to pre-fill the delivery form (account vs code). */
  category?: Category;
  /** v38.2: what Mega charged us for this order, in USD (0 = manual / not charged). */
  costUsd?: number;
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
  phone: string;
  createdAt: string;
  lastIp: string | null;
  lastSeenAt: string;
  isBlocked: boolean;
  /** v27 sign-in security (admin view). */
  isLocked?: boolean;
  failedLoginAttempts?: number;
  dailyLoginCount?: number;
  lastLoginDate?: string;
  /** v33: how the account was created. */
  authProvider: "google" | "email";
  /** v33: caught by the admin-URL honeypot. */
  honeypotFlagged?: boolean;
  /** v34: email confirmed (6-digit code, or a Google account). */
  emailVerified?: boolean;
  /** v33: two-letter country of the last sign-in (from Vercel's edge headers). */
  lastCountry?: string | null;
};

/** v33 — one visit to a decoy admin URL by someone who isn't an admin. */
export type HoneypotEvent = {
  id: string;
  userId?: string;
  email?: string;
  fullName?: string;
  attemptedPath: string;
  /** The PIN they typed into the decoy terminal, if any. */
  enteredPayload?: string;
  ip?: string;
  country?: string;
  userAgent: string;
  createdAt: string;
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
  deliverySpeed?: DeliverySpeed;
  targetInputType?: TargetInputType;
  serviceMode?: ServiceMode;
  counter?: CounterPricing;
  groupId?: string;
  description: string;
  instructions: string;
  instructionsAr?: string;
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
    regionId?: string;
  }>;
  regions?: ServiceRegion[];
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
  receiptNumber: string;
  method: PaymentMethod;
  /** ShamCash: sender full name (اسم المرسل). */
  senderName: string;
  /** Syriatel / MTN Cash: number the money was sent from (رقم المرسل منه). */
  senderPhone: string;
  /** ShamCash transfer reference number (رقم التحويل). */
  transferNumber: string;
  /** v35: normalised transaction reference (trimmed, upper case) used for duplicate checks. */
  transactionRef: string;
  /** v35: another request already used this reference. */
  isDuplicateRef: boolean;
  currency: Currency;
  createdAt: string;
  /** When the admin approved / rejected it. */
  processedAt: string | null;
};

/** v35: the manual wallet top-up request (ShamCash / Syriatel Cash / MTN Cash). */
export type TopupRequest = BalanceRequest;

export type SupportStatus = "OPEN" | "ANSWERED" | "CLOSED";

export type SupportMessage = {
  id: string;
  sender: "USER" | "ADMIN";
  text: string;
  createdAt: string;
  /** Automatic welcome reply (not a human answer; the ticket stays OPEN). */
  isAutoReply?: boolean;
  /**
   * v26: attached photo. The image itself lives in the server-only `support_images` table
   * (fetched through /api/support-image), never in this public row — receipts and ID photos
   * must not be readable with the anon key or downloaded by every visitor.
   */
  imageId?: string;
};

export type SupportTicket = {
  id: string;
  /** Formal ticket number shown to the user and searchable by the admin, e.g. TKT-482910. */
  ticketNumber: string;
  /** Closed tickets disappear from the user's screen but stay in the admin archive forever. */
  hiddenForUser?: boolean;
  closedAt?: string;
  /** v25: high-priority password recovery chat opened from the sign-in screen without a session. */
  category?: "PASSWORD_RECOVERY";
  /** Guest ticket (no session): `guestKey` lives only in the guest's browser + here. */
  guest?: boolean;
  guestKey?: string;
  contactPhone?: string;
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

/** v35: one line of the wallet statement (كشف حساب المحفظة). Amounts in minor units of the wallet currency. */
export type WalletLedgerEntry = {
  id: string;
  userId: string;
  type: "TOPUP" | "PURCHASE" | "REFUND" | "ADMIN_ADJUST";
  /** Signed: + money in, − money out. */
  amountUsd: number;
  /** Wallet balance right after this line. */
  balanceAfterUsd: number;
  referenceId: string;
  labelAr: string;
  labelEn: string;
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
  serviceGroups?: ServiceGroup[];
  /** Admin-set exchange rate shown to shoppers (same value as sypRate). */
  exchangeRateSypPerUsd?: number;
};
