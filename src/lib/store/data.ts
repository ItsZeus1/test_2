import type { BalanceStatus, Category, Profile, Rate, Role } from "@/lib/store/types";
import { targetLabel } from "@/lib/store/types";

export const ADMIN_EMAIL = "majd@elmadani.com";
export const ADMIN_PASSWORD = "Majddjam12";
export const ADMIN_NAME = "Majd El Madani";
export const ADMIN_USERNAME = "majd";
export const ADMIN_USER_ID = "usr_admin_majd";
export const ADMIN_BALANCE_CENTS = 1_000_000;
export const STATE_KEY = "novacharge.state.v1";
export const SESSION_KEY = "novacharge.session.v1";
export const CLOUD_TABLE = "novacharge_state";
export const CLOUD_ROW_ID = "primary";
export const STORAGE_BUCKET = "novacharge";
export const STORAGE_OBJECT = "state.json";
export const DEFAULT_SHAMCASH = "SHAMCASH-SY-9948201";

export function coverFor(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
}

export const SLUG_COVERS: Record<string, string> = {
  "pubg-mobile": coverFor("pubgmobile.com"),
  "free-fire": coverFor("ff.garena.com"),
  "valorant-points": coverFor("playvalorant.com"),
  "mobile-legends": coverFor("mobilelegends.com"),
  jawaker: coverFor("jawaker.com"),
  "tiktok-coins": coverFor("tiktok.com"),
  "bigo-live": coverFor("bigo.tv"),
  soulchill: coverFor("soulchill.live"),
  likee: coverFor("likee.video"),
  playstation: coverFor("playstation.com"),
  "steam-wallet": coverFor("store.steampowered.com"),
  netflix: coverFor("netflix.com"),
  spotify: coverFor("spotify.com"),
  itunes: coverFor("apple.com"),
  "mobile-data": coverFor("syriatel.sy"),
};

export const PRESET_COVERS: Array<{ id: string; label: string; url: string }> = [
  { id: "pubg", label: "PUBG", url: coverFor("pubgmobile.com") },
  { id: "freefire", label: "Free Fire", url: coverFor("ff.garena.com") },
  { id: "jawaker", label: "Jawaker", url: coverFor("jawaker.com") },
  { id: "tiktok", label: "TikTok", url: coverFor("tiktok.com") },
  { id: "bigo", label: "Bigo", url: coverFor("bigo.tv") },
  { id: "psn", label: "PSN", url: coverFor("playstation.com") },
  { id: "steam", label: "Steam", url: coverFor("store.steampowered.com") },
  { id: "netflix", label: "Netflix", url: coverFor("netflix.com") },
  { id: "razer", label: "Razer Gold", url: coverFor("gold.razer.com") },
  { id: "telecom", label: "Telecom", url: coverFor("mtn.com") },
];

export type StoredUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  avatarUrl: string;
  passwordHash: string;
  passwordSalt: string;
  role: Role;
  balanceCents: number;
  isBlocked: boolean;
  lastIp: string | null;
  lastSeenAt: string;
  createdAt: string;
};

export type StoredSession = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
};

export type StoredService = {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  category: Category;
  description: string;
  descriptionAr: string;
  instructions: string;
  badge: string | null;
  imageUrl: string;
  createdAt: string;
};

export type StoredPackage = {
  id: string;
  serviceId: string;
  sizeName: string;
  normalPriceCents: number;
  vipPriceCents: number;
  apiEndpoint: string;
  apiSecretCode: string;
  sortOrder: number;
};

export type StoredOrder = {
  id: string;
  userId: string;
  serviceId: string;
  packageId: string;
  serviceName: string;
  serviceSlug: string;
  packageName: string;
  targetId: string;
  priceCents: number;
  roleAtPurchase: Role;
  ipAddress: string | null;
  status: string;
  fulfillmentRef: string;
  createdAt: string;
};

export type StoredBalanceRequest = {
  id: string;
  userId: string;
  username: string;
  cents: number;
  status: BalanceStatus;
  note: string;
  referenceNote: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type StoredTransaction = {
  id: string;
  userId: string;
  kind: "purchase" | "self_topup" | "admin_topup" | "refund";
  cents: number;
  note: string;
  createdAt: string;
};

export type NovaState = {
  version: number;
  updatedAt: string;
  users: StoredUser[];
  sessions: StoredSession[];
  services: StoredService[];
  packages: StoredPackage[];
  orders: StoredOrder[];
  balanceRequests: StoredBalanceRequest[];
  transactions: StoredTransaction[];
  shamcashAddress: string;
};

const SEEDED_AT = "2026-01-15T00:00:00.000Z";

type Pack = [id: string, size: string, normal: number, vip: number, secret: string];

type SeedService = {
  id: string;
  name: string;
  slug: string;
  category: Category;
  description: string;
  instructions: string;
  badge: string | null;
  packs: Pack[];
};

const CATALOG: SeedService[] = [
  {
    id: "svc_pubg",
    name: "PUBG Mobile UC",
    slug: "pubg-mobile",
    category: "games",
    description:
      "Unknown Cash for PUBG Mobile, delivered to your Character ID. The fastest way to restock crates, Royal Pass, and outfits.",
    instructions:
      "Open PUBG Mobile, tap your avatar, and copy the Character ID under your name. Paste that ID at checkout. UC is added to the same account.",
    badge: "Hot",
    packs: [
      ["svc_pubg_p1", "60 UC", 99, 79, "NC-PUBG-MOBILE-1"],
      ["svc_pubg_p2", "325 UC", 499, 399, "NC-PUBG-MOBILE-2"],
      ["svc_pubg_p3", "660 UC", 999, 799, "NC-PUBG-MOBILE-3"],
      ["svc_pubg_p4", "1800 UC", 2499, 1999, "NC-PUBG-MOBILE-4"],
    ],
  },
  {
    id: "svc_ff",
    name: "Free Fire Diamonds",
    slug: "free-fire",
    category: "games",
    description:
      "Diamonds for Free Fire. Unlock characters, weapon loot, and elite passes without waiting on a slow reseller.",
    instructions:
      "In Free Fire, open your profile and copy the numeric Player ID. Double-check the region of the account before you pay.",
    badge: "Hot",
    packs: [
      ["svc_ff_p1", "100 Diamonds", 129, 99, "NC-FREE-FIRE-1"],
      ["svc_ff_p2", "310 Diamonds", 399, 319, "NC-FREE-FIRE-2"],
      ["svc_ff_p3", "520 Diamonds", 649, 519, "NC-FREE-FIRE-3"],
      ["svc_ff_p4", "1060 Diamonds", 1299, 999, "NC-FREE-FIRE-4"],
    ],
  },
  {
    id: "svc_val",
    name: "Valorant Points",
    slug: "valorant-points",
    category: "games",
    description:
      "Valorant Points for skins, battle pass, and night-market pickups. Tied to your Riot ID, not a random login.",
    instructions:
      "Enter your Riot ID exactly as Name#TAG. We credit the Valorant account linked to that Riot ID.",
    badge: null,
    packs: [
      ["svc_val_p1", "475 VP", 499, 449, "NC-VALORANT-POINTS-1"],
      ["svc_val_p2", "1000 VP", 999, 899, "NC-VALORANT-POINTS-2"],
      ["svc_val_p3", "2050 VP", 1999, 1799, "NC-VALORANT-POINTS-3"],
      ["svc_val_p4", "3650 VP", 3499, 3099, "NC-VALORANT-POINTS-4"],
    ],
  },
  {
    id: "svc_ml",
    name: "Mobile Legends Diamonds",
    slug: "mobile-legends",
    category: "games",
    description:
      "Diamonds for Mobile Legends: Bang Bang. Weekly diamond passes, heroes, and starlight, priced by your NovaCharge role.",
    instructions:
      "Open your MLBB profile and copy both the User ID and Zone ID. Type them as 123456789 (1234) — ID, space, zone in parentheses.",
    badge: "Hot",
    packs: [
      ["svc_ml_p1", "86 Diamonds", 149, 119, "NC-MOBILE-LEGENDS-1"],
      ["svc_ml_p2", "172 Diamonds", 299, 239, "NC-MOBILE-LEGENDS-2"],
      ["svc_ml_p3", "706 Diamonds", 999, 799, "NC-MOBILE-LEGENDS-3"],
      ["svc_ml_p4", "2195 Diamonds", 2799, 2299, "NC-MOBILE-LEGENDS-4"],
    ],
  },
  {
    id: "svc_jawaker",
    name: "Jawaker Chips",
    slug: "jawaker",
    category: "games",
    description:
      "Chip packs for Jawaker tables. Drop straight onto the account ID you play with — no middleman chat.",
    instructions:
      "Copy the Jawaker account ID from your profile screen. Chips land on that account only.",
    badge: null,
    packs: [
      ["svc_jawaker_p1", "10,000 Chips", 99, 79, "NC-JAWAKER-1"],
      ["svc_jawaker_p2", "50,000 Chips", 399, 319, "NC-JAWAKER-2"],
      ["svc_jawaker_p3", "150,000 Chips", 999, 799, "NC-JAWAKER-3"],
      ["svc_jawaker_p4", "500,000 Chips", 2499, 1999, "NC-JAWAKER-4"],
    ],
  },
  {
    id: "svc_tiktok",
    name: "TikTok Coins",
    slug: "tiktok-coins",
    category: "apps",
    description:
      "TikTok Coins for live gifts and creator support. We recharge the account ID you provide, not a shared voucher pool.",
    instructions:
      "Open TikTok → Profile → menu → Settings and privacy → Account, and copy the username (without @) of the account that should receive the coins.",
    badge: "Hot",
    packs: [
      ["svc_tiktok_p1", "70 Coins", 99, 89, "NC-TIKTOK-COINS-1"],
      ["svc_tiktok_p2", "350 Coins", 499, 429, "NC-TIKTOK-COINS-2"],
      ["svc_tiktok_p3", "700 Coins", 999, 849, "NC-TIKTOK-COINS-3"],
      ["svc_tiktok_p4", "3500 Coins", 4499, 3899, "NC-TIKTOK-COINS-4"],
    ],
  },
  {
    id: "svc_bigo",
    name: "Bigo Live Diamonds",
    slug: "bigo-live",
    category: "apps",
    description:
      "Bigo Live diamonds for beans, gifts, and fan levels. Built for hosts who top up between streams.",
    instructions:
      "In Bigo Live, open Me and copy the numeric Bigo ID. Delivery targets that ID exactly.",
    badge: null,
    packs: [
      ["svc_bigo_p1", "50 Diamonds", 99, 79, "NC-BIGO-LIVE-1"],
      ["svc_bigo_p2", "200 Diamonds", 349, 279, "NC-BIGO-LIVE-2"],
      ["svc_bigo_p3", "1000 Diamonds", 1499, 1199, "NC-BIGO-LIVE-3"],
      ["svc_bigo_p4", "5000 Diamonds", 6499, 5299, "NC-BIGO-LIVE-4"],
    ],
  },
  {
    id: "svc_soul",
    name: "SoulChill Coins",
    slug: "soulchill",
    category: "apps",
    description:
      "SoulChill coins for rooms and gifts. Same-day style delivery with a clear order reference in My Orders.",
    instructions:
      "Copy your SoulChill ID from the profile card. Coins are non-transferable after they land.",
    badge: "New",
    packs: [
      ["svc_soul_p1", "100 Coins", 149, 119, "NC-SOULCHILL-1"],
      ["svc_soul_p2", "500 Coins", 599, 479, "NC-SOULCHILL-2"],
      ["svc_soul_p3", "1000 Coins", 1099, 879, "NC-SOULCHILL-3"],
      ["svc_soul_p4", "5000 Coins", 4999, 3999, "NC-SOULCHILL-4"],
    ],
  },
  {
    id: "svc_likee",
    name: "Likee Diamonds",
    slug: "likee",
    category: "apps",
    description:
      "Likee diamonds for live gifts and creator levels. Recharged to the Likee ID you submit at checkout.",
    instructions: "Open Likee, tap your avatar, and copy the Likee ID. Diamonds are delivered to that ID.",
    badge: null,
    packs: [
      ["svc_likee_p1", "50 Diamonds", 99, 79, "NC-LIKEE-1"],
      ["svc_likee_p2", "200 Diamonds", 349, 279, "NC-LIKEE-2"],
      ["svc_likee_p3", "1000 Diamonds", 1499, 1199, "NC-LIKEE-3"],
      ["svc_likee_p4", "5000 Diamonds", 5999, 4799, "NC-LIKEE-4"],
    ],
  },
  {
    id: "svc_psn",
    name: "PlayStation Wallet",
    slug: "playstation",
    category: "subscriptions",
    description:
      "PlayStation Store wallet credit for games, PS Plus, and add-ons. Tell us the account email the wallet belongs to.",
    instructions:
      "Enter the email address on the PlayStation Network account. Wallet credit cannot be moved to a different account later.",
    badge: null,
    packs: [
      ["svc_psn_p1", "$10 Wallet", 1099, 999, "NC-PLAYSTATION-1"],
      ["svc_psn_p2", "$25 Wallet", 2699, 2449, "NC-PLAYSTATION-2"],
      ["svc_psn_p3", "$50 Wallet", 5299, 4899, "NC-PLAYSTATION-3"],
      ["svc_psn_p4", "$100 Wallet", 10499, 9699, "NC-PLAYSTATION-4"],
    ],
  },
  {
    id: "svc_steam",
    name: "Steam Wallet",
    slug: "steam-wallet",
    category: "subscriptions",
    description:
      "Steam Wallet funds for seasonal sales, DLC, and decks. Matched to your Steam profile URL or friend code.",
    instructions:
      "Paste your Steam profile URL or friend code. Funds are applied to that Steam account's wallet.",
    badge: "Hot",
    packs: [
      ["svc_steam_p1", "$5 Wallet", 549, 499, "NC-STEAM-WALLET-1"],
      ["svc_steam_p2", "$10 Wallet", 1099, 999, "NC-STEAM-WALLET-2"],
      ["svc_steam_p3", "$20 Wallet", 2149, 1999, "NC-STEAM-WALLET-3"],
      ["svc_steam_p4", "$50 Wallet", 5299, 4899, "NC-STEAM-WALLET-4"],
    ],
  },
  {
    id: "svc_netflix",
    name: "Netflix Gift Card",
    slug: "netflix",
    category: "subscriptions",
    description:
      "Netflix gift credit sized by the month. We apply it to the email on the membership, not a random profile.",
    instructions: "Enter the email address of the Netflix account that should receive the gift credit.",
    badge: null,
    packs: [
      ["svc_netflix_p1", "1 Month", 1599, 1499, "NC-NETFLIX-1"],
      ["svc_netflix_p2", "3 Months", 4499, 4199, "NC-NETFLIX-2"],
      ["svc_netflix_p3", "6 Months", 7999, 7499, "NC-NETFLIX-3"],
      ["svc_netflix_p4", "12 Months", 14999, 13999, "NC-NETFLIX-4"],
    ],
  },
  {
    id: "svc_spotify",
    name: "Spotify Premium",
    slug: "spotify",
    category: "subscriptions",
    description:
      "Spotify Premium time for the account email you specify. Individual plans, stacked as gift credit.",
    instructions:
      "Enter the email address on the Spotify account. Premium credit applies to that login only.",
    badge: "New",
    packs: [
      ["svc_spotify_p1", "1 Month", 1099, 999, "NC-SPOTIFY-1"],
      ["svc_spotify_p2", "3 Months", 2999, 2699, "NC-SPOTIFY-2"],
      ["svc_spotify_p3", "6 Months", 5499, 4999, "NC-SPOTIFY-3"],
      ["svc_spotify_p4", "12 Months", 9999, 8999, "NC-SPOTIFY-4"],
    ],
  },
  {
    id: "svc_itunes",
    name: "iTunes Gift Card",
    slug: "itunes",
    category: "subscriptions",
    description:
      "App Store & iTunes credit for apps, music, and iCloud. Applied to the Apple ID email you provide.",
    instructions:
      "Enter the Apple ID email that should receive the credit. Region mismatches can delay delivery.",
    badge: null,
    packs: [
      ["svc_itunes_p1", "$10 Credit", 1099, 999, "NC-ITUNES-1"],
      ["svc_itunes_p2", "$25 Credit", 2699, 2449, "NC-ITUNES-2"],
      ["svc_itunes_p3", "$50 Credit", 5299, 4899, "NC-ITUNES-3"],
      ["svc_itunes_p4", "$100 Credit", 10499, 9699, "NC-ITUNES-4"],
    ],
  },
  {
    id: "svc_data",
    name: "Syriatel / MTN",
    slug: "mobile-data",
    category: "mobile",
    description:
      "Syriatel and MTN telecom credit sent to a mobile number. Built for Syrian lines and backup data when you are out of credit.",
    instructions:
      "Enter the phone number in international format, starting with + and the country code. Syriatel or MTN credit is sent to that line.",
    badge: "New",
    packs: [
      ["svc_data_p1", "1 GB", 299, 249, "NC-MOBILE-DATA-1"],
      ["svc_data_p2", "5 GB", 999, 849, "NC-MOBILE-DATA-2"],
      ["svc_data_p3", "15 GB", 2499, 2099, "NC-MOBILE-DATA-3"],
      ["svc_data_p4", "50 GB", 5999, 4999, "NC-MOBILE-DATA-4"],
    ],
  },
];

export const ARABIC_COPY: Record<string, { nameAr: string; descriptionAr: string }> = {
  "pubg-mobile": {
    nameAr: "شدات ببجي موبايل",
    descriptionAr: "شدات UC لحساب شخصية ببجي. أسرع طريقة لشحن الرويال باس والصناديق والأزياء.",
  },
  "free-fire": {
    nameAr: "ألماس فري فاير",
    descriptionAr: "ألماس فري فاير يُشحن إلى معرف اللاعب. مناسب للشخصيات والأزياء والتصاريح.",
  },
  "valorant-points": {
    nameAr: "نقاط فالورانت",
    descriptionAr: "نقاط فالورانت لشراء السكنات والباتل باس. تُرسل إلى حساب Riot الذي تدخله.",
  },
  "mobile-legends": {
    nameAr: "موبايل ليجندز",
    descriptionAr: "ألماس موبايل ليجندز يُضاف إلى معرف اللاعب ومعرف المنطقة.",
  },
  jawaker: {
    nameAr: "جواكر",
    descriptionAr: "عملات جواكر للعب والطاولات. تُرسل إلى معرف حساب جواكر.",
  },
  "tiktok-coins": {
    nameAr: "عملات تيك توك",
    descriptionAr: "عملات تيك توك للهدايا والبث. تُشحن إلى معرف الحساب الذي تلصقه.",
  },
  "bigo-live": {
    nameAr: "بيجو لايف",
    descriptionAr: "ألماس بيجو لايف للهدايا. يصل إلى معرف بيجو بعد تأكيد الطلب.",
  },
  soulchill: {
    nameAr: "سول تشيل",
    descriptionAr: "عملات سول تشيل للبث والهدايا. تُرسل إلى معرف الحساب.",
  },
  likee: {
    nameAr: "لايكي",
    descriptionAr: "ألماس لايكي للهدايا. يُضاف إلى معرف لايكي الذي تدخله.",
  },
  playstation: {
    nameAr: "بلايستيشن",
    descriptionAr: "رصيد محفظة بلايستيشن للألعاب والاشتراكات. يُطبق على الحساب الذي تحدده.",
  },
  "steam-wallet": {
    nameAr: "محفظة ستيم",
    descriptionAr: "رصيد ستيم للألعاب والتطبيقات. يُرسل إلى حساب ستيم المرتبط.",
  },
  netflix: {
    nameAr: "نتفليكس",
    descriptionAr: "اشتراك نتفليكس يُفعّل على البريد أو الحساب الذي تدخله.",
  },
  spotify: {
    nameAr: "سبوتيفاي",
    descriptionAr: "اشتراك سبوتيفاي بريميوم يُربط بالحساب الذي تختاره عند الدفع.",
  },
  itunes: {
    nameAr: "آيتونز",
    descriptionAr: "رصيد آب ستور وآيتونز للتطبيقات والموسيقى. يُطبق على بريد Apple ID.",
  },
  "mobile-data": {
    nameAr: "سيريتل / MTN",
    descriptionAr: "رصيد سيريتل وMTN يُرسل إلى رقم الموبايل. مناسب للخطوط السورية وباقات البيانات.",
  },
};

export function arabicFor(slug: string): { nameAr: string; descriptionAr: string } | null {
  return ARABIC_COPY[slug] ?? null;
}

export const SEED_SERVICES: StoredService[] = CATALOG.map((service) => {
  const arabic = arabicFor(service.slug);
  return {
    id: service.id,
    name: service.name,
    nameAr: arabic?.nameAr ?? service.name,
    slug: service.slug,
    category: service.category,
    description: service.description,
    descriptionAr: arabic?.descriptionAr ?? service.description,
    instructions: service.instructions,
    badge: service.badge,
    imageUrl: SLUG_COVERS[service.slug] ?? "",
    createdAt: SEEDED_AT,
  };
});

export const SEED_PACKAGES: StoredPackage[] = CATALOG.flatMap((service) =>
  service.packs.map((pack, index) => ({
    id: pack[0],
    serviceId: service.id,
    sizeName: pack[1],
    normalPriceCents: pack[2],
    vipPriceCents: pack[3],
    apiEndpoint: `https://provider.novacharge.invalid/v1/${service.slug}`,
    apiSecretCode: pack[4],
    sortOrder: index,
  })),
);

export function blankState(): NovaState {
  return {
    version: 0,
    updatedAt: SEEDED_AT,
    users: [],
    sessions: [],
    services: [],
    packages: [],
    orders: [],
    balanceRequests: [],
    transactions: [],
    shamcashAddress: DEFAULT_SHAMCASH,
  };
}

export function cloneState(state: NovaState): NovaState {
  return JSON.parse(JSON.stringify(state)) as NovaState;
}

function asRole(value: unknown): Role {
  if (value === "VIP" || value === "ADMIN" || value === "NORMAL") return value;
  return "NORMAL";
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asStatus(value: unknown): BalanceStatus {
  if (value === "APPROVED" || value === "approved") return "APPROVED";
  if (value === "REJECTED" || value === "rejected") return "REJECTED";
  return "PROCESSING";
}

function asRequest(value: Partial<StoredBalanceRequest>): StoredBalanceRequest {
  const note = typeof value.note === "string" ? value.note : "";
  const reference = typeof value.referenceNote === "string" && value.referenceNote ? value.referenceNote : note;
  return {
    id: typeof value.id === "string" ? value.id : "bal_legacy",
    userId: typeof value.userId === "string" ? value.userId : "",
    username: typeof value.username === "string" ? value.username : "",
    cents: Number(value.cents) || 0,
    status: asStatus(value.status),
    note,
    referenceNote: reference,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : SEEDED_AT,
    resolvedAt: typeof value.resolvedAt === "string" ? value.resolvedAt : null,
  };
}

export function normalizeState(input: unknown): NovaState | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Partial<NovaState>;
  if (!Array.isArray(raw.services) && !Array.isArray(raw.users)) return null;
  const address = typeof raw.shamcashAddress === "string" ? raw.shamcashAddress.trim() : "";
  return {
    version: typeof raw.version === "number" && Number.isFinite(raw.version) ? raw.version : 0,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : SEEDED_AT,
    users: asArray<StoredUser>(raw.users).map((user) => ({
      ...user,
      role: asRole(user.role),
      balanceCents: Number(user.balanceCents) || 0,
      phone: typeof user.phone === "string" ? user.phone : "",
      avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : "",
      isBlocked: user.isBlocked === true,
    })),
    sessions: asArray<StoredSession>(raw.sessions),
    services: asArray<StoredService>(raw.services).map((service) => {
      const arabic = arabicFor(typeof service.slug === "string" ? service.slug : "");
      return {
        ...service,
        imageUrl: typeof service.imageUrl === "string" ? service.imageUrl : "",
        badge: service.badge ?? null,
        nameAr: typeof service.nameAr === "string" && service.nameAr ? service.nameAr : (arabic?.nameAr ?? service.name),
        descriptionAr:
          typeof service.descriptionAr === "string" && service.descriptionAr
            ? service.descriptionAr
            : (arabic?.descriptionAr ?? service.description),
      };
    }),
    packages: asArray<StoredPackage>(raw.packages),
    orders: asArray<StoredOrder>(raw.orders),
    balanceRequests: asArray<Partial<StoredBalanceRequest>>(raw.balanceRequests).map(asRequest),
    transactions: asArray<StoredTransaction>(raw.transactions),
    shamcashAddress: address || DEFAULT_SHAMCASH,
  };
}

/** Adds any catalog slug the project shipped with, without touching edits to existing slugs. */
export function mergeSeedCatalog(state: NovaState): { state: NovaState; changed: boolean } {
  const next = cloneState(state);
  let changed = false;
  if (!next.shamcashAddress) {
    next.shamcashAddress = DEFAULT_SHAMCASH;
    changed = true;
  }
  for (const service of SEED_SERVICES) {
    const existing = next.services.find((item) => item.slug === service.slug);
    if (!existing) {
      next.services.push(service);
      next.packages.push(...SEED_PACKAGES.filter((pack) => pack.serviceId === service.id));
      changed = true;
      continue;
    }
    if (!existing.imageUrl && service.imageUrl) {
      existing.imageUrl = service.imageUrl;
      changed = true;
    }
    if (!existing.nameAr && service.nameAr) {
      existing.nameAr = service.nameAr;
      existing.descriptionAr = service.descriptionAr;
      changed = true;
    }
    if (existing.slug === "mobile-data" && existing.name === "Instant Data Bundle") {
      existing.name = service.name;
      existing.description = service.description;
      existing.instructions = service.instructions;
      changed = true;
    }
  }
  return { state: next, changed };
}

export function rateFor(role: Role | null): Rate {
  return role === "VIP" || role === "ADMIN" ? "vip" : "standard";
}

export function priceFor(role: Role | null, normalCents: number, vipCents: number): number {
  return rateFor(role) === "vip" ? vipCents : normalCents;
}

export function toProfile(user: StoredUser): Profile {
  return {
    userId: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone ?? "",
    avatarUrl: user.avatarUrl ?? "",
    role: user.role,
    balanceCents: user.balanceCents,
    lastIp: user.lastIp,
    isBlocked: user.isBlocked === true,
  };
}

export function isAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === ADMIN_EMAIL;
}

export function serviceTargetLabel(category: Category): string {
  return targetLabel(category);
}

export const CATEGORY_ORDER: Category[] = ["games", "apps", "subscriptions", "mobile"];
