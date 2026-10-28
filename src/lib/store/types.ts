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

export type Profile = {
  userId: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  balanceCents: number;
  lastIp: string | null;
};

export type CatalogService = {
  id: string;
  name: string;
  slug: string;
  category: Category;
  description: string;
  badge: string | null;
  imageUrl: string;
  startingPriceCents: number;
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
  apiEndpoint: string;
  apiSecretCode: string;
};

export type AdminService = {
  id: string;
  name: string;
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
  balanceCents: number;
  lastIp: string | null;
  lastSeenAt: string;
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
  description: string;
  instructions: string;
  badge: string;
  imageUrl: string;
  packages: Array<{
    id?: string;
    sizeName: string;
    normalPriceCents: number;
    vipPriceCents: number;
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
