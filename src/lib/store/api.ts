import { getSupabase, supabaseEnv } from "@/lib/supabase";
import { balanceCap } from "@/lib/money";
import {
  ADMIN_BALANCE_CENTS,
  DEFAULT_SYP_RATE_VALUE,
  packagePrice,
  ADMIN_EMAIL,
  ADMIN_NAME,
  ADMIN_PASSWORD,
  ADMIN_USER_ID,
  ADMIN_USERNAME,
  DEFAULT_SHAMCASH,
  DEFAULT_SYRIATEL_CASH,
  DEFAULT_MTN_CASH,
  DEFAULT_TICKER_AR,
  DEFAULT_TICKER_EN,
  CATEGORY_ORDER,
  CLOUD_ROW_ID,
  CLOUD_TABLE,
  SEED_PACKAGES,
  SEED_SERVICES,
  cleanPackName,
  coverFor,
  SESSION_KEY,
  STATE_KEY,
  STORAGE_BUCKET,
  STORAGE_OBJECT,
  blankState,
  cloneState,
  isAdminEmail,
  arabicFor,
  mergeSeedCatalog,
  normalizeState,
  rateFor,
  serviceTargetLabel,
  toProfile,
  clampMargin,
  arabicInstructionsFallback,
  DEFAULT_GROUPS,
  groupOf,
  counterPricePer100,
  counterTotal,
  normalizeCounter,
  type NovaState,
  type StoredBalanceRequest,
  type StoredOrder,
  type StoredPackage,
  type StoredService,
  type StoredSession,
  type StoredTransaction,
  type StoredUser,
} from "@/lib/store/data";
import type {
  FeedItem,
  ServiceGroup,
  PaymentAddresses,
  PaymentMethod,
  SupportTicket,
  TopupTiming,
  UserDossier,
  WalletTxn,
  WalletLedgerEntry,
  AdminOrder,
  AdminService,
  AdminStats,
  AdminUser,
  BalanceRequest,
  CatalogService,
  Currency,
  OrderRow,
  Profile,
  Role,
  ServiceDetail,
  CustomField,
  OrderField,
  ServiceRegion,
  HoneypotEvent,
  ImportPackage,
  ImportService,
} from "@/lib/store/types";
import { CATEGORIES, MAX_CUSTOM_FIELDS, MAX_PACKAGES, MAX_REGIONS, type Category } from "@/lib/store/types";
import {
  adminRoleSchema,
  adminTopUpSchema,
  balanceRequestSchema,
  blockUserSchema,
  loginSchema,
  profileUpdateSchema,
  purchaseSchema,
  registerSchema,
  requestIdSchema,
  serviceWriteSchema,
  shamcashSchema,
  paymentAddressesSchema,
  sypRateSchema,
  tickerSchema,
  vipMarginSchema,
  manualDecisionSchema,
  balanceEditSchema,
  adminPasswordSchema,
  savedIdSchema,
  resetRequestSchema,
  serviceGroupsSchema,
  completeProfileSchema,
  userIdSchema,
  avgTopupSchema,
  supportMessageSchema,
  supportReplySchema,
  supportStatusSchema,
  ticketIdSchema,
  slugSchema,
  syncSchema,
  usernameCheckSchema,
  formatSyMobile,
  heroBannersSchema,
  SY_MOBILE,
  zodError,
} from "@/lib/validation";

export type SyncMode = "table" | "storage" | "local";

export type SyncStatus = {
  configured: boolean;
  mode: SyncMode;
  detail: string;
  /** State of the relational catalog tables (services, service_packages, store_settings). */
  catalog: "ok" | "missing" | "blocked" | "off";
};

type Ok<T extends object = object> = { ok: true } & T;
type Err = { ok: false; error: string };

const listeners = new Set<() => void>();
const SESSION_MS = 1000 * 60 * 60 * 24 * 30;
const ONLINE_MS = 1000 * 60 * 15;

let memory: NovaState | null = null;
let mode: SyncMode = "local";
let modeDetail = "Waiting to sync.";
let queue: Promise<unknown> = Promise.resolve();
let ready: Promise<void> | null = null;
let writing = false;
let pollStarted = false;
let catalogMode: SyncStatus["catalog"] = "off";
let cachedIp = "";
let cachedIpAt = 0;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function onStoreChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSyncStatus(): SyncStatus {
  return {
    configured: supabaseEnv().enabled,
    mode,
    detail: modeDetail,
    catalog: catalogMode,
  };
}

/** Non-null when an admin save only reached this browser (cloud tables missing or blocked). */
export function getCloudWarning(): string | null {
  if (!supabaseEnv().enabled) return "Supabase is not configured: changes are saved on this device only.";
  if (catalogMode !== "ok" && mode === "local") {
    return "Changes were saved on this device only. Run migrations/novacharge.sql (part 1) in Supabase so other devices see them.";
  }
  return null;
}

function unwrap<T>(input: T | { data: T }): T {
  if (input && typeof input === "object" && "data" in (input as object)) {
    return (input as { data: T }).data;
  }
  return input as T;
}

function fail(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong.";
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const byte of view) out += byte.toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return hex(digest);
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

async function hashPassword(
  password: string,
  saltHex?: string,
): Promise<{ passwordHash: string; passwordSalt: string }> {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: copyBytes(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return { passwordHash: hex(bits), passwordSalt: saltHex ?? hex(salt) };
}

function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `${prefix}_${hex(bytes)}`;
}

function readLocal(): NovaState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

let lastLocalVersion = "";

function writeLocal(state: NovaState): void {
  if (typeof window === "undefined") return;
  const stamp = `${state.version}:${state.updatedAt}`;
  if (stamp === lastLocalVersion) return; // unchanged: skip a large JSON.stringify
  try {
    const json = JSON.stringify(state);
    // v29: never let the offline copy grow past the storage budget (old inline photos).
    if (json.length > STATE_CACHE_LIMIT) {
      window.localStorage.removeItem(STATE_KEY);
    } else {
      window.localStorage.setItem(STATE_KEY, json);
    }
    lastLocalVersion = stamp;
  } catch {
    // Quota exceeded (big uploaded photos). The online copy is the source of truth, so carry on.
  }
}

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

function writeToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (!token) window.localStorage.removeItem(SESSION_KEY);
  else window.localStorage.setItem(SESSION_KEY, token);
}

function missingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = `${error.message ?? ""}`.toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table")
  );
}

function storageMissingBucket(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) return false;
  const message = `${error.message ?? ""}`.toLowerCase();
  const status = String(error.statusCode ?? "");
  return status === "404" && message.includes("bucket");
}

function storageMissingObject(error: { message?: string; statusCode?: string | number } | null): boolean {
  if (!error) return false;
  const message = `${error.message ?? ""}`.toLowerCase();
  return message.includes("object not found") || message.includes("not found");
}

async function readTable(): Promise<NovaState | null | "missing" | "blocked"> {
  const client = getSupabase();
  if (!client) return "blocked";
  const { data, error } = await client
    .from(CLOUD_TABLE)
    .select("id,version,payload,updated_at")
    .eq("id", CLOUD_ROW_ID)
    .maybeSingle();
  if (error) {
    if (missingRelation(error)) return "missing";
    modeDetail = error.message || "Table read was denied.";
    return "blocked";
  }
  if (!data) return null;
  const row = data as { payload?: unknown; version?: number };
  const parsed = normalizeState(row.payload);
  // v31: a row that exists but cannot be read is NOT an empty store — treat it as a failed read
  // so nothing (least of all the seed catalog) is ever written over it.
  if (!parsed) {
    modeDetail = "The store row could not be read. Nothing will be saved until it can.";
    return "blocked";
  }
  if (typeof row.version === "number") parsed.version = row.version;
  return parsed;
}

async function writeTable(state: NovaState): Promise<"ok" | "missing" | "conflict" | "blocked"> {
  const client = getSupabase();
  if (!client) return "blocked";
  const { error } = await client.from(CLOUD_TABLE).upsert(
    {
      id: CLOUD_ROW_ID,
      version: state.version,
      payload: state,
      updated_at: state.updatedAt,
    },
    { onConflict: "id" },
  );
  if (!error) return "ok";
  if (missingRelation(error)) return "missing";
  const message = `${error.message ?? ""}`.toLowerCase();
  if (message.includes("row-level security") || error.code === "42501") {
    modeDetail = "Table exists but the anon key cannot write it. Using Storage or this browser.";
    return "blocked";
  }
  modeDetail = error.message || "Table write failed.";
  return "blocked";
}

async function ensureBucket(): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  const created = await client.storage.createBucket(STORAGE_BUCKET, {
    public: true,
    fileSizeLimit: "5MB",
  });
  if (!created.error) return true;
  return /already exists/i.test(created.error.message ?? "");
}

async function readStorage(): Promise<NovaState | null | "missing" | "blocked"> {
  const client = getSupabase();
  if (!client) return "blocked";
  const downloaded = await client.storage.from(STORAGE_BUCKET).download(STORAGE_OBJECT);
  if (!downloaded.error && downloaded.data) {
    try {
      const text = await downloaded.data.text();
      // v31: an unreadable copy is a failed read, never "empty" (that would allow a seed save).
      return normalizeState(JSON.parse(text)) ?? "blocked";
    } catch {
      return "blocked";
    }
  }
  const storageError = downloaded.error as { message?: string; statusCode?: string } | null;
  if (storageMissingBucket(storageError)) {
    const readyBucket = await ensureBucket();
    if (!readyBucket) {
      modeDetail = storageError?.message || "Storage bucket could not be created with the anon key.";
      return "blocked";
    }
    return null;
  }
  if (storageMissingObject(storageError)) return null;
  modeDetail = storageError?.message || "Storage read failed.";
  return "blocked";
}

async function writeStorage(state: NovaState): Promise<"ok" | "blocked"> {
  const client = getSupabase();
  if (!client) return "blocked";
  const body = new Blob([JSON.stringify(state)], { type: "application/json" });
  const uploaded = await client.storage.from(STORAGE_BUCKET).upload(STORAGE_OBJECT, body, {
    upsert: true,
    contentType: "application/json",
    cacheControl: "0",
  });
  if (!uploaded.error) return "ok";
  const storageError = uploaded.error as { message?: string; statusCode?: string };
  if (storageMissingBucket(storageError)) {
    const readyBucket = await ensureBucket();
    if (readyBucket) {
      const retry = await client.storage.from(STORAGE_BUCKET).upload(STORAGE_OBJECT, body, {
        upsert: true,
        contentType: "application/json",
        cacheControl: "0",
      });
      if (!retry.error) return "ok";
    }
  }
  modeDetail = storageError.message || "Storage write failed. This browser keeps the live copy.";
  return "blocked";
}

async function pullCloud(): Promise<NovaState | null> {
  if (!supabaseEnv().enabled) {
    mode = "local";
    modeDetail = "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to sync devices.";
    return null;
  }
  if (mode !== "storage") {
    const table = await readTable();
    if (table !== "missing" && table !== "blocked") {
      mode = "table";
      modeDetail = `Synced through ${CLOUD_TABLE}.`;
      // A real answer from the server (the store, or a confirmed brand-new empty project).
      markVerifiedRead(table);
      return table;
    }
    if (table === "blocked" && mode === "table") return null;
  }
  const stored = await readStorage();
  if (stored !== "missing" && stored !== "blocked") {
    mode = "storage";
    modeDetail = `Synced through Storage ${STORAGE_BUCKET}/${STORAGE_OBJECT}.`;
    markVerifiedRead(stored);
    return stored;
  }
  mode = "local";
  if (!modeDetail || modeDetail.startsWith("Waiting")) {
    modeDetail = "Cloud tables are not created yet. ZovaCharge is live in this browser and will attach when Storage or the state table accepts the anon key.";
  }
  return null;
}

const RPC_FLAG = "novacharge.rpcUnavailable";
let rpcMissing = (() => {
  try {
    return typeof window !== "undefined" && window.sessionStorage.getItem(RPC_FLAG) === "1";
  } catch {
    return false;
  }
})();

function markRpcMissing(): void {
  rpcMissing = true;
  try {
    window.sessionStorage.setItem(RPC_FLAG, "1");
  } catch {
    /* private mode */
  }
}

/**
 * Layer 1: the `public.novacharge_action` RPC (atomic, version-guarded).
 * If the function is not installed yet we remember that and quietly use the
 * direct table / Storage writes below. Never surfaces a blocking error.
 */
async function writeViaRpc(state: NovaState): Promise<boolean> {
  if (rpcMissing) return false;
  const client = getSupabase();
  if (!client) return false;
  try {
    const { error } = await client.rpc("novacharge_action", { action: "save_state", payload: state });
    if (!error) {
      mode = "table";
      modeDetail = "Synced through novacharge_action.";
      return true;
    }
    const code = String((error as { code?: string }).code ?? "");
    const message = String((error as { message?: string }).message ?? "");
    if (code === "PGRST202" || code === "42883" || missingRelation(error) || /could not find the function/i.test(message)) markRpcMissing();
    return false;
  } catch {
    markRpcMissing();
    return false;
  }
}

/* ------------------------------ v31: anti-wipe shield ------------------------------ */

/**
 * Nothing is written to Supabase until one read of the server has really succeeded. If the
 * first read fails or times out, the site may *show* the cached / default catalog, but every
 * save is refused, so the seed `services` / `users` can never replace the real ones.
 */
let hasVerifiedRemoteRead = false;
/**
 * v32 catalog lock: true only once Supabase has returned a real, non-empty `services` list.
 * Until then the catalog tables are never written, so a slow / failed read can't push the
 * default test catalog back over the real one.
 */
let hasConfirmedRemoteCatalog = false;
/** Sizes of the last store the server confirmed — a full save may not suddenly shrink them. */
let verifiedCounts: { users: number; services: number } | null = null;

function markVerifiedRead(state: NovaState | null): void {
  hasVerifiedRemoteRead = true;
  if (state && state.services.length > 0) hasConfirmedRemoteCatalog = true;
  if (state) verifiedCounts = { users: state.users.length, services: state.services.length };
}

/** A full-store save that would drop many accounts or most services at once is refused. */
function looksLikeWipe(state: NovaState): boolean {
  if (!verifiedCounts) return false;
  return state.users.length < verifiedCounts.users - 2 || (verifiedCounts.services >= 4 && state.services.length < Math.ceil(verifiedCounts.services / 2));
}

function notVerified(): string {
  const english = typeof document !== "undefined" && document.documentElement.lang === "en";
  return english
    ? "Can't reach the store right now — nothing was changed. Please try again in a moment."
    : "تعذّر الاتصال بالمتجر الآن، ولم يتم تغيير أي شيء. حاول مجدداً بعد لحظات.";
}

async function pushBlob(state: NovaState): Promise<void> {
  if (!supabaseEnv().enabled) return;
  if (await writeViaRpc(state)) return;
  if (mode === "table") {
    const result = await writeTable(state);
    if (result === "ok") return;
    if (result === "missing") mode = "local";
  }
  if (mode === "storage" || mode === "local") {
    const result = await writeStorage(state);
    if (result === "ok") {
      mode = "storage";
      modeDetail = `Synced through Storage ${STORAGE_BUCKET}/${STORAGE_OBJECT}.`;
      return;
    }
    const table = await writeTable(state);
    if (table === "ok") {
      mode = "table";
      modeDetail = `Synced through ${CLOUD_TABLE}.`;
    }
  }
}

type RelSnapshot = {
  services: Array<Record<string, unknown>>;
  packages: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
};


/** Write-through of the catalog + settings to real tables so every device reads the same rows. */
/** What the catalog tables hold (id → row fingerprint), from the last confirmed read / write. */
let relServices: Map<string, string> | null = null;
let relPackages: Map<string, string> | null = null;
const SERVICE_COLUMNS = ["slug", "name", "name_ar", "category", "description", "description_ar", "instructions", "badge", "image_url"] as const;
const PACKAGE_COLUMNS = ["service_id", "size_name", "price_usd_cents", "vip_price_usd_cents", "price_syp_cents", "vip_price_syp_cents", "sort_order"] as const;

/** Fingerprint of the columns we own (ignores timestamps), so unchanged rows are not re-sent. */
function rowKey(row: Record<string, unknown>): string {
  const columns: readonly string[] = "size_name" in row ? PACKAGE_COLUMNS : SERVICE_COLUMNS;
  return JSON.stringify(columns.map((column) => row[column] ?? null));
}

async function writeRelational(state: NovaState): Promise<void> {
  const client = getSupabase();
  if (!client) {
    catalogMode = "off";
    return;
  }
  // v31/v32: never write the catalog tables from an unverified copy or before a real catalog was read.
  if (!hasVerifiedRemoteRead || !hasConfirmedRemoteCatalog) return;
  try {
    const now = state.updatedAt;
    const serviceRows = state.services.map((service) => ({
      id: service.id,
      slug: service.slug,
      name: service.name,
      name_ar: service.nameAr || "",
      category: service.category,
      description: service.description,
      description_ar: service.descriptionAr || "",
      instructions: service.instructions,
      badge: service.badge,
      image_url: service.imageUrl || "",
      created_at: service.createdAt,
      updated_at: now,
    }));
    const packageRows = state.packages.map((pack) => ({
      id: pack.id,
      service_id: pack.serviceId,
      size_name: pack.sizeName,
      price_usd_cents: pack.normalPriceCents,
      vip_price_usd_cents: pack.vipPriceCents,
      price_syp_cents: pack.normalPriceSypCents ?? 0,
      vip_price_syp_cents: pack.vipPriceSypCents ?? 0,
      sort_order: pack.sortOrder,
      updated_at: now,
    }));
    // v31: targeted writes only — upsert the rows that changed (by id) and delete only the ids
    // that were removed since the last confirmed read. No table-wide deletes, ever.
    const changedServices = relServices ? serviceRows.filter((row) => relServices?.get(row.id) !== rowKey(row)) : serviceRows;
    const changedPackages = relPackages ? packageRows.filter((row) => relPackages?.get(row.id) !== rowKey(row)) : packageRows;
    const liveServiceIds = new Set(serviceRows.map((row) => row.id));
    const livePackageIds = new Set(packageRows.map((row) => row.id));
    const removedServices = relServices && serviceRows.length ? [...relServices.keys()].filter((id) => !liveServiceIds.has(id)) : [];
    const removedPackages = relPackages && serviceRows.length ? [...relPackages.keys()].filter((id) => !livePackageIds.has(id)) : [];
    const steps = [
      changedServices.length ? await client.from("services").upsert(changedServices, { onConflict: "id" }) : null,
      removedServices.length ? await client.from("services").delete().in("id", removedServices) : null,
      changedPackages.length ? await client.from("service_packages").upsert(changedPackages, { onConflict: "id" }) : null,
      removedPackages.length ? await client.from("service_packages").delete().in("id", removedPackages) : null,
      await client.from("store_settings").upsert(
        {
          id: CLOUD_ROW_ID,
          shamcash_address: state.shamcashAddress,
          offers_ticker_text: state.offersTickerText ?? "",
          offers_ticker_text_ar: state.offersTickerTextAr ?? "",
          hero_banners: state.heroBanners ?? [],
          syp_rate: state.sypRate ?? DEFAULT_SYP_RATE_VALUE,
          deleted_slugs: state.deletedSlugs ?? [],
          state_version: state.version,
          updated_at: now,
        },
        { onConflict: "id" },
      ),
    ];
    const failed = steps.find((step) => step?.error);
    if (failed?.error) {
      catalogMode = missingRelation(failed.error) ? "missing" : "blocked";
      if (catalogMode === "blocked") modeDetail = failed.error.message || "Catalog tables rejected the write.";
      return;
    }
    catalogMode = "ok";
    relServices = new Map(serviceRows.map((row) => [row.id, rowKey(row)]));
    relPackages = new Map(packageRows.map((row) => [row.id, rowKey(row)]));
  } catch (error) {
    catalogMode = "blocked";
    modeDetail = fail(error);
  }
}

async function readRelational(): Promise<RelSnapshot | null> {
  const client = getSupabase();
  if (!client) {
    catalogMode = "off";
    return null;
  }
  try {
    const [services, packages, settings] = await Promise.all([
      client.from("services").select("*"),
      client.from("service_packages").select("*"),
      client.from("store_settings").select("*").eq("id", CLOUD_ROW_ID).maybeSingle(),
    ]);
    const error = services.error ?? packages.error ?? settings.error;
    if (error) {
      catalogMode = missingRelation(error) ? "missing" : "blocked";
      return null;
    }
    relServices = new Map(((services.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), rowKey(row)]));
    if ((services.data ?? []).length > 0) hasConfirmedRemoteCatalog = true;
    relPackages = new Map(((packages.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), rowKey(row)]));
    if (!settings.data) {
      catalogMode = "ok";
      return null;
    }
    catalogMode = "ok";
    return {
      services: (services.data ?? []) as Array<Record<string, unknown>>,
      packages: (packages.data ?? []) as Array<Record<string, unknown>>,
      settings: settings.data as Record<string, unknown>,
    };
  } catch {
    catalogMode = "blocked";
    return null;
  }
}

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const num = (value: unknown, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** The tables are the source of truth for catalog + settings, unless the blob copy is newer (a failed table write). */
function applyRelational(state: NovaState, rel: RelSnapshot | null): NovaState {
  if (!rel) return state;
  const tableVersion = num(rel.settings.state_version);
  if (tableVersion < state.version) return state;
  const next = cloneState(state);
  const oldPacks = new Map(state.packages.map((pack) => [pack.id, pack]));
  const oldServices = new Map(state.services.map((service) => [service.id, service]));
  next.services = rel.services.map((row) => {
    const old = oldServices.get(str(row.id));
    return {
      id: str(row.id),
      slug: str(row.slug),
      name: str(row.name),
      nameAr: str(row.name_ar),
      category: str(row.category, "games") as StoredService["category"],
      description: str(row.description),
      descriptionAr: str(row.description_ar),
      instructions: str(row.instructions, old?.instructions ?? ""),
      instructionsAr: old?.instructionsAr ?? "",
      badge: typeof row.badge === "string" && row.badge ? row.badge : null,
      imageUrl: str(row.image_url),
      createdAt: str(row.created_at, old?.createdAt ?? new Date().toISOString()),
      // Not stored in the public tables: keep the private copy, or the seed default.
      deliverySpeed: old?.deliverySpeed ?? SEED_SERVICES.find((seed) => seed.slug === str(row.slug))?.deliverySpeed ?? "INSTANT",
      targetInputType: old?.targetInputType ?? SEED_SERVICES.find((seed) => seed.slug === str(row.slug))?.targetInputType ?? "PLAYER_ID",
      serviceMode: old?.serviceMode ?? "PACKAGES",
      groupId: old?.groupId,
      counter: old?.counter,
      customFields: old?.customFields, // v31: private store only
      outOfStock: old?.outOfStock, // v32: store row only
      regions: old?.regions, // v32.1: store row only
    };
  });
  next.packages = rel.packages.map((row) => {
    const old = oldPacks.get(str(row.id));
    return {
      id: str(row.id),
      serviceId: str(row.service_id),
      sizeName: str(row.size_name),
      normalPriceCents: num(row.price_usd_cents),
      vipPriceCents: num(row.vip_price_usd_cents),
      normalPriceSypCents: num(row.price_syp_cents),
      vipPriceSypCents: num(row.vip_price_syp_cents),
      // provider endpoint + secret never live in the public tables; keep the copy from the private state.
      apiEndpoint: old?.apiEndpoint ?? "",
      apiSecretCode: old?.apiSecretCode ?? "",
      sortOrder: num(row.sort_order),
      regionId: old?.regionId, // v32.1: the catalog tables have no region column; keep the store's
    };
  });
  next.shamcashAddress = str(rel.settings.shamcash_address) || next.shamcashAddress;
  next.offersTickerText = str(rel.settings.offers_ticker_text) || next.offersTickerText;
  next.offersTickerTextAr = str(rel.settings.offers_ticker_text_ar) || next.offersTickerTextAr;
  if (Array.isArray(rel.settings.hero_banners)) next.heroBanners = (rel.settings.hero_banners as unknown[]).filter((url): url is string => typeof url === "string");
  next.sypRate = num(rel.settings.syp_rate, next.sypRate ?? DEFAULT_SYP_RATE_VALUE) || DEFAULT_SYP_RATE_VALUE;
  next.deletedSlugs = Array.isArray(rel.settings.deleted_slugs) ? (rel.settings.deleted_slugs as string[]) : next.deletedSlugs;
  next.version = Math.max(state.version, tableVersion);
  return next;
}

/* ------------------------------ v29: change-only saves (deltas) ------------------------------ */

/**
 * What the server is known to hold (the last state pulled from it or pushed to it). Saves send
 * only the difference against this, so a top-up / message / sign-in is a few KB instead of the
 * whole store. Requires SQL part 7 (`novacharge_patch`); until then saves work exactly as before.
 */
let lastSynced: NovaState | null = null;
let patchMissing = false;
/** Set when the server's version did not line up after a delta: the next sync re-downloads. */
let needsPull = false;
/** Catalog tables are only rewritten when the catalog really changed (not on every action). */
let lastCatalogStamp = "";

function markSynced(state: NovaState | null): void {
  lastSynced = state ? cloneState(state) : null;
}

type PatchOp =
  | { op: "set"; key: string; value: unknown }
  | { op: "upsert"; key: string; idKey: string; value: Record<string, unknown>; at: "start" | "end" }
  | { op: "delete"; key: string; idKey: string; id: string };

const isKeyedList = (value: unknown): value is Array<Record<string, unknown>> =>
  Array.isArray(value) && value.every((item) => item !== null && typeof item === "object" && typeof (item as { id?: unknown }).id === "string");

/** Top-level diff: lists of records with an `id` are diffed record by record, anything else is set whole. */
function diffState(previous: NovaState, next: NovaState): PatchOp[] {
  const ops: PatchOp[] = [];
  const before = previous as unknown as Record<string, unknown>;
  const after = next as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (key === "version" || key === "updatedAt") continue;
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (isKeyedList(a) && isKeyedList(b)) {
      const old = new Map(a.map((item) => [item.id as string, JSON.stringify(item)]));
      const nextIds = new Set(b.map((item) => item.id as string));
      let leading = 0; // new records placed at the front (e.g. unshift) stay at the front
      while (leading < b.length && !old.has(b[leading].id as string)) leading += 1;
      b.forEach((item, index) => {
        const id = item.id as string;
        const previousJson = old.get(id);
        if (previousJson === JSON.stringify(item)) return;
        ops.push({ op: "upsert", key, idKey: "id", value: item, at: previousJson === undefined && index < leading ? "start" : "end" });
      });
      for (const id of old.keys()) if (!nextIds.has(id)) ops.push({ op: "delete", key, idKey: "id", id });
    } else {
      ops.push({ op: "set", key, value: b === undefined ? null : b });
    }
  }
  return ops;
}

/** Tries a delta save. Returns false when the caller should fall back to the full save. */
async function pushPatch(state: NovaState): Promise<boolean> {
  if (patchMissing || !lastSynced || !supabaseEnv().enabled) return false;
  const client = getSupabase();
  if (!client) return false;
  const ops = diffState(lastSynced, state);
  if (!ops.length) {
    if (state.version !== lastSynced.version) needsPull = true; // only the counter differs: realign
    return true;
  }
  if (JSON.stringify(ops).length > 400_000) return false; // huge one-off change (e.g. a migration): send it whole
  try {
    const { data, error } = await client.rpc("novacharge_patch", { ops });
    if (error) {
      const code = String((error as { code?: string }).code ?? "");
      const message = String((error as { message?: string }).message ?? "");
      if (code === "PGRST202" || code === "42883" || /could not find the function/i.test(message)) patchMissing = true;
      return false;
    }
    mode = "table";
    modeDetail = "Synced with change-only saves (novacharge_patch).";
    markSynced(state);
    // Someone else saved too (or our counter was ahead): the server merged both — re-download.
    if (Number(data) !== state.version) needsPull = true;
    return true;
  } catch {
    return false;
  }
}

function catalogStamp(state: NovaState): string {
  return JSON.stringify([state.services, state.packages, state.shamcashAddress, state.offersTickerText, state.offersTickerTextAr, state.heroBanners, state.sypRate, state.deletedSlugs]);
}

async function pushCloud(state: NovaState): Promise<void> {
  if (!supabaseEnv().enabled) return;
  // v31: view-only until the server has been read successfully once.
  if (!hasVerifiedRemoteRead) {
    modeDetail = notVerified();
    return;
  }
  try {
    const patched = await pushPatch(state);
    if (!patched) {
      if (looksLikeWipe(state)) {
        // Never replace the whole store with a much smaller copy: re-download instead.
        needsPull = true;
        modeDetail = "A save that would remove many records at once was blocked. Reloading the latest store.";
        return;
      }
      await pushBlob(state);
      verifiedCounts = { users: state.users.length, services: state.services.length };
      // With deltas available, a full save after a failed delta re-bases on the next download.
      if (!patchMissing) markSynced(null);
      else markSynced(state);
    }
  } catch (error) {
    modeDetail = fail(error);
  }
  // v29: the catalog tables are rewritten only when the catalog itself changed.
  const stamp = catalogStamp(state);
  if (stamp !== lastCatalogStamp || catalogMode !== "ok") {
    await writeRelational(state);
    if (catalogMode === "ok") lastCatalogStamp = stamp;
  }
}

function prefer(local: NovaState, remote: NovaState | null): NovaState {
  if (!remote) return local;
  if (remote.version > local.version) return remote;
  if (local.version > remote.version) return local;
  return local.updatedAt >= remote.updatedAt ? local : remote;
}

async function heal(state: NovaState): Promise<NovaState> {
  const seeded = mergeSeedCatalog(state);
  const next = seeded.state;
  let changed = seeded.changed;
  if (!next.users.some((user) => user.email.toLowerCase() === ADMIN_EMAIL)) {
    const hashed = await hashPassword(ADMIN_PASSWORD);
    const now = new Date().toISOString();
    next.users.unshift({
      id: ADMIN_USER_ID,
      name: ADMIN_NAME,
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      phone: "",
      avatarUrl: "",
      passwordHash: hashed.passwordHash,
      passwordSalt: hashed.passwordSalt,
      role: "ADMIN",
      balanceCents: ADMIN_BALANCE_CENTS,
      isBlocked: false,
      lastIp: "seed",
      lastSeenAt: now,
      createdAt: now,
    });
    changed = true;
  } else {
    const admin = next.users.find((user) => user.email.toLowerCase() === ADMIN_EMAIL);
    if (admin && admin.role !== "ADMIN") {
      admin.role = "ADMIN";
      changed = true;
    }
  }
  if (changed) {
    next.version += 1;
    next.updatedAt = new Date().toISOString();
  }
  return next;
}

async function loadAuthoritative(): Promise<NovaState> {
  const local = memory ?? readLocal() ?? blankState();
  const [remoteResult, rel] = await Promise.all([
    pullCloud().catch((error) => {
      mode = "local";
      modeDetail = fail(error);
      return null;
    }),
    readRelational(),
  ]);
  const remote: NovaState | null = remoteResult;
  const healed = await heal(applyRelational(prefer(local, remote), rel));
  if (remote) {
    markSynced(remote);
    needsPull = false;
  }
  if (rel && catalogMode === "ok") lastCatalogStamp = catalogStamp(healed);
  memory = healed;
  writeLocal(healed);
  if (remote === null || healed.version !== remote.version || healed.updatedAt !== remote.updatedAt || catalogMode !== "ok" || !rel) {
    try {
      await pushCloud(healed);
    } catch (error) {
      modeDetail = fail(error);
    }
  }
  return healed;
}

/** Resolves once every queued save (including background uploads) has finished. */
export function whenSynced(): Promise<void> {
  return enqueue(async () => undefined);
}

/** Ask the server to push an admin alert for a new event (works with the admin's browser closed). */
/**
 * v35: closed-browser admin alerts through the Telegram bot. Fire-and-forget: the server re-reads
 * the saved event (so nobody can make it send made-up text) and does nothing until the bot is set up.
 */
function notifyTelegram(body: { kind: "topup" | "support" | "recovery" | "manual" | "honeypot"; id: string; messageId?: string }): void {
  if (typeof window === "undefined" || !supabaseEnv().enabled) return;
  void whenSynced()
    .then(() =>
      fetch("/api/notify-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }),
    )
    .catch(() => undefined);
}

function notifyAdmins(body: { kind: "topup" | "support" | "recovery" | "manual" | "topup_result" | "order_result"; id: string; messageId?: string }): void {
  if (typeof window === "undefined" || !supabaseEnv().enabled) return;
  if (body.kind === "topup" || body.kind === "support" || body.kind === "recovery" || body.kind === "manual") {
    notifyTelegram({ kind: body.kind, id: body.id, messageId: body.messageId });
  }
  void whenSynced()
    .then(() =>
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }),
    )
    .catch(() => undefined);
}

/** Fallback poll (tiny version probe). Realtime + cross-tab signals usually beat it to the punch. */
const POLL_MS = 2_500;
let backgroundSync = false;

/** Admin alerts keep syncing while the tab is in the background (phones may still pause it). */
export function setBackgroundSync(enabled: boolean): void {
  backgroundSync = enabled;
}

/** Tiny request: just the two version counters (a few bytes instead of the whole store + photos). */
async function probeRemoteVersion(): Promise<number | null> {
  const client = getSupabase();
  if (!client) return null;
  try {
    const [blob, settings] = await Promise.all([
      client.from(CLOUD_TABLE).select("version").eq("id", CLOUD_ROW_ID).maybeSingle(),
      client.from("store_settings").select("state_version").eq("id", CLOUD_ROW_ID).maybeSingle(),
    ]);
    const versions = [
      blob.error ? null : Number((blob.data as { version?: number } | null)?.version ?? NaN),
      settings.error ? null : Number((settings.data as { state_version?: number } | null)?.state_version ?? NaN),
    ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    // Storage-only mode has no version row: return null so we fall back to a full pull.
    return versions.length ? Math.max(...versions) : null;
  } catch {
    return null;
  }
}

async function syncOnce(): Promise<void> {
  const current = memory;
  if (!current || !supabaseEnv().enabled) return;
  const probed = await probeRemoteVersion();
  const forced = needsPull; // a delta save asked for an authoritative re-download
  if (!forced && probed !== null && probed === current.version) return; // nothing new: done in one small request
  if (!forced && probed !== null && probed < current.version) {
    await pushCloud(current); // an earlier write did not land; retry it
    return;
  }
  const [remote, rel] = await Promise.all([pullCloud().catch(() => null), readRelational()]);
  if (remote) {
    markSynced(remote);
    needsPull = false;
  }
  const base = remote && (forced || remote.version >= current.version) ? remote : current;
  const merged = await heal(applyRelational(base, rel));
  if (merged.version > current.version || merged.updatedAt !== current.updatedAt) {
    memory = merged;
    writeLocal(memory);
    emit();
  }
}

function startPoll(): void {
  if (pollStarted || typeof window === "undefined") return;
  pollStarted = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== STATE_KEY || writing) return;
    const next = readLocal();
    if (!next) return;
    memory = next;
    emit();
  });
  const tick = (force = false) => {
    if (writing) return;
    // v26 anti-spam: plain logged-out visitors have no orders, top-ups or chats to watch, so they
    // never poll and ignore live signals (one load + the 60 s catalog cache is enough). A guest
    // with an open password-recovery chat still syncs so admin replies arrive.
    const signedIn = Boolean(readToken());
    if (!signedIn && !readGuestSession()) return;
    // Signed-in users (and the admin) keep syncing in hidden / minimised tabs so their alerts stay
    // instant; the request is a tiny version probe unless something actually changed.
    if (!force && !signedIn && document.visibilityState === "hidden" && !backgroundSync) return;
    void enqueue(syncOnce);
  };
  window.setInterval(() => tick(), POLL_MS);
  startRealtime(() => tick(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick(true); // catch up immediately when the tab comes back
  });
  window.addEventListener("focus", () => tick(true));
}

/* ------------------------------------------------------------------
 * Instant sync signals (< 1 s): Supabase Realtime broadcast + table changes,
 * and a BroadcastChannel between tabs of the same browser.
 * ------------------------------------------------------------------ */
type LiveChannel = { send: (message: { type: "broadcast"; event: string; payload: Record<string, unknown> }) => unknown };
let liveChannel: LiveChannel | null = null;
let tabChannel: BroadcastChannel | null = null;

function startRealtime(onSignal: () => void): void {
  const client = getSupabase();
  if (client) {
    try {
      liveChannel = client
        .channel("zovacharge-live-alerts", { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "store_updated" }, onSignal)
        // Needs the store table in the supabase_realtime publication (SQL part 5); harmless if not.
        .on("postgres_changes", { event: "*", schema: "public", table: CLOUD_TABLE }, onSignal)
        .subscribe() as unknown as LiveChannel;
    } catch {
      liveChannel = null;
    }
  }
  if ("BroadcastChannel" in window) {
    tabChannel = new BroadcastChannel("zovacharge_sync");
    tabChannel.onmessage = onSignal;
  }
}

/** Tell every other open client (all devices + other tabs) that the store just changed. */
function announceStoreUpdate(): void {
  try {
    void liveChannel?.send({ type: "broadcast", event: "store_updated", payload: { at: Date.now() } });
  } catch {
    /* realtime unavailable: the 2.5 s poll still catches it */
  }
  try {
    tabChannel?.postMessage("store_updated");
  } catch {
    /* ignore */
  }
}

/**
 * Stale-while-revalidate startup.
 * 1) Resolve immediately from the cached localStorage snapshot (or the seed on a first visit),
 *    so pages render in a few ms instead of waiting for Supabase.
 * 2) Queue the authoritative cloud sync right behind it; it emits only if something changed.
 * Every caller shares the same `ready` promise, so components never trigger duplicate loads.
 */
export async function ensureReady(): Promise<void> {
  if (!ready) {
    ready = enqueue(async () => {
      cleanupBloatedStorage();
      const cached = readLocal();
      if (cached) {
        memory = cached;
      } else {
        memory = await heal(blankState());
        writeLocal(memory);
      }
      // v26: a logged-out visitor who refreshes within 60 s is served from this tab's catalog cache
      // with zero database requests (F5 spam protection). Writes (sign-up etc.) still check the
      // server version first, so the cache can never cause a stale save.
      const guestCatalog = isPlainGuest() ? readGuestCatalog() : null;
      if (guestCatalog && memory && guestCatalog.version > memory.version) {
        // Display-only overlay: the local version number is NOT raised, so the next save sees the
        // server is newer and downloads the full store before writing.
        memory = { ...memory, ...guestCatalog.catalog };
      }
      startPoll();
      void clientIp();
      if (guestCatalog) return;
      void enqueue(async () => {
        const before = memory ? `${memory.version}:${memory.updatedAt}` : "";
        await loadAuthoritative();
        const after = memory ? `${memory.version}:${memory.updatedAt}` : "";
        if (memory) writeGuestCatalog(memory);
        if (after !== before) emit();
      }).catch((error) => {
        modeDetail = fail(error);
      });
    }).catch((error) => {
      ready = null;
      throw error;
    });
  }
  await ready;
}

/* ------------------------------ v26: 60 s guest catalog cache (sessionStorage) ------------------------------ */

const GUEST_CATALOG_KEY = "zovacharge_guest_catalog_cache";
const GUEST_CATALOG_TTL_MS = 60_000;
/** Personal data never goes into the catalog cache. */
const PRIVATE_STATE_KEYS = new Set(["users", "sessions", "orders", "balanceRequests", "supportTickets", "transactions", "version", "updatedAt"]);
type GuestCatalog = { at: number; version: number; catalog: Partial<NovaState> };

function isPlainGuest(): boolean {
  return typeof window !== "undefined" && !readToken() && !readGuestSession();
}

function readGuestCatalog(): GuestCatalog | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(GUEST_CATALOG_KEY) ?? "null") as GuestCatalog | null;
    if (!parsed || typeof parsed.at !== "number" || typeof parsed.version !== "number" || !parsed.catalog) return null;
    return Date.now() - parsed.at < GUEST_CATALOG_TTL_MS ? parsed : null;
  } catch {
    return null;
  }
}

function writeGuestCatalog(state: NovaState): void {
  if (!isPlainGuest()) return;
  try {
    const catalog = Object.fromEntries(Object.entries(state).filter(([key]) => !PRIVATE_STATE_KEYS.has(key))) as Partial<NovaState>;
    window.sessionStorage.setItem(GUEST_CATALOG_KEY, JSON.stringify({ at: Date.now(), version: state.version, catalog } satisfies GuestCatalog));
  } catch {
    /* quota / private mode: no cache, normal loading */
  }
}

async function commit<T>(
  mutator: (state: NovaState) => { state: NovaState; result: T } | Promise<{ state: NovaState; result: T }>,
): Promise<T> {
  await ensureReady();
  return enqueue(async () => {
    writing = true;
    try {
      // v31: a save is only allowed on top of a store really read from the server.
      if (supabaseEnv().enabled && !hasVerifiedRemoteRead) {
        await loadAuthoritative();
        if (!hasVerifiedRemoteRead) throw new Error(notVerified());
      }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const base = cloneState(memory ?? (await loadAuthoritative()));
        const drafted = await mutator(cloneState(base));
        // v35: with SQL part 9 installed, money / price / catalog changes need the owner's secure
        // Supabase session — say so now instead of letting the database quietly put them back.
        if (guardState !== "absent" && touchesGuarded(base, drafted.state)) {
          const actor = await currentUser(base);
          if (actor?.role === "ADMIN") {
            if (guardState === "unknown") await refreshGuardStatus();
            if (guardState === "untrusted") throw new Error(ownerSessionText());
          }
        }
        drafted.state.version = base.version + 1;
        drafted.state.updatedAt = new Date().toISOString();
        // Only download the full store when someone else saved in the meantime.
        let remote: NovaState | null = null;
        const probed = await probeRemoteVersion();
        // v29: also download once when we do not yet know what the server holds (or a delta
        // asked for it) so the change-only save has a correct base.
        if (probed === null || probed > base.version || needsPull || (!patchMissing && !lastSynced)) {
          remote = await pullCloud().catch(() => null);
          if (remote) {
            markSynced(remote);
            needsPull = false;
          }
        }
        if (remote && remote.version > base.version) {
          memory = await heal(remote);
          writeLocal(memory);
          continue;
        }
        memory = drafted.state;
        writeLocal(drafted.state);
        emit();
        // Upload right after this task in the same queue: the next save still waits for it,
        // but the user is not blocked on the network. If the tab closes first, the next
        // load sees local > remote and pushes it then.
        const toPush = drafted.state;
        void enqueue(() => pushCloud(toPush))
          .then(announceStoreUpdate) // other devices pull the change right away
          .catch((error) => {
            modeDetail = fail(error);
          });
        return drafted.result;
      }
      throw new Error("ZovaCharge could not sync. Try again.");
    } finally {
      writing = false;
    }
  });
}

/** Never let the IP lookup slow an action down: use the cached IP, or wait at most 300 ms. */
async function quickIp(): Promise<string> {
  if (cachedIp) {
    void clientIp();
    return cachedIp;
  }
  return Promise.race([clientIp(), new Promise<string>((resolve) => setTimeout(() => resolve(""), 300))]);
}

/** v33: country code of the last lookup (Vercel's x-vercel-ip-country), e.g. "SY". */
let cachedCountry = "";

/** Proxy / private / loopback addresses are never shown as a customer's IP. */
function isBogusIp(ip: string): boolean {
  return !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1$|fc|fd|fe80)/i.test(ip);
}

/**
 * v33 — the visitor's real IP + country, read by our own edge route from Vercel's headers
 * (x-vercel-forwarded-for / x-vercel-ip-country), so it is the customer's address, not a server's.
 * Falls back to ipify only if that route is unreachable.
 */
async function clientIp(): Promise<string> {
  const now = Date.now();
  if (cachedIp && now - cachedIpAt < 60_000) return cachedIp;
  try {
    const response = await fetch("/api/client-ip", { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      const body = (await response.json()) as { ip?: string | null; country?: string | null };
      cachedCountry = typeof body.country === "string" ? body.country.slice(0, 2).toUpperCase() : "";
      if (body.ip && !isBogusIp(body.ip)) {
        cachedIp = body.ip.slice(0, 64);
        cachedIpAt = now;
        return cachedIp;
      }
    }
  } catch {
    /* try the public lookup below */
  }
  try {
    const response = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      const body = (await response.json()) as { ip?: string };
      if (body.ip && !isBogusIp(body.ip)) {
        cachedIp = body.ip.slice(0, 64);
        cachedIpAt = now;
        return cachedIp;
      }
    }
  } catch {
    // Browser-only fallback is enough when the lookup is blocked.
  }
  cachedIp = "";
  cachedIpAt = now;
  return cachedIp;
}

async function userFromToken(state: NovaState, token: string | null): Promise<StoredUser | null> {
  if (!token) return null;
  const tokenHash = await sha256(token);
  const now = Date.now();
  const session = state.sessions.find((item) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > now);
  if (!session) return null;
  return state.users.find((user) => user.id === session.userId) ?? null;
}

async function currentUser(state: NovaState): Promise<StoredUser | null> {
  return userFromToken(state, readToken());
}

async function openSession(state: NovaState, userId: string): Promise<string> {
  const token = hex(crypto.getRandomValues(new Uint8Array(24)));
  const now = new Date();
  const session: StoredSession = {
    id: randomId("ses"),
    userId,
    tokenHash: await sha256(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_MS).toISOString(),
  };
  state.sessions = state.sessions
    .filter((item) => Date.parse(item.expiresAt) > now.getTime())
    .concat(session)
    .slice(-400);
  return token;
}

function requireUser(user: StoredUser | null): StoredUser {
  if (!user) throw new Error("Sign in to continue.");
  return user;
}

function assertCanTransact(user: StoredUser): void {
  if (user.isBlocked) throw new Error("This account is blocked.");
}

function requireAdmin(user: StoredUser): void {
  if (user.role !== "ADMIN" || !isAdminEmail(user.email)) throw new Error("Admin access only.");
}

function mapOrder(order: StoredOrder): OrderRow {
  return {
    id: order.id,
    serviceName: order.serviceName,
    serviceSlug: order.serviceSlug,
    packageName: order.packageName,
    targetId: order.targetId,
    priceCents: order.priceCents,
    currency: order.currency === "SYP" ? "SYP" : "USD",
    status: order.status,
    fulfillmentRef: order.fulfillmentRef,
    receiptNumber: order.receiptNumber || order.fulfillmentRef,
    createdAt: order.createdAt,
    resolvedAt: order.resolvedAt ?? null,
    packageId: order.packageId,
    fields: order.fields?.length ? order.fields : undefined,
  };
}

/** v31: a service's custom checkout fields, cleaned (never more than MAX_CUSTOM_FIELDS). */
function fieldsOf(service: StoredService): CustomField[] {
  return (service.customFields ?? [])
    .filter((field) => field && typeof field.id === "string" && (field.labelAr || field.labelEn))
    .slice(0, MAX_CUSTOM_FIELDS)
    .map((field) => ({
      id: field.id,
      labelAr: field.labelAr ?? "",
      labelEn: field.labelEn ?? "",
      placeholderAr: field.placeholderAr || undefined,
      placeholderEn: field.placeholderEn || undefined,
      required: field.required !== false,
    }));
}

function catalogOf(state: NovaState, role: Role | null, currency: Currency = "USD"): CatalogService[] {
  const sypRate = state.sypRate ?? DEFAULT_SYP_RATE_VALUE;
  return state.services
    // v32: a service with no sizes yet (e.g. just imported) is hidden from customers; admins still see it.
    .filter((service) => role === "ADMIN" || service.serviceMode === "POINT_COUNTER" || state.packages.some((pack) => pack.serviceId === service.id))
    .map((service) => {
      const packs = state.packages.filter((pack) => pack.serviceId === service.id);
      const mode = service.serviceMode ?? "PACKAGES";
      const counter = normalizeCounter(service.counter);
      const prices = packs.map((pack) => packagePrice(pack, role, currency, sypRate));
      const starting =
        mode === "POINT_COUNTER"
          ? counterTotal(counterPricePer100(counter, role, currency, sypRate), counter.minPoints)
          : prices.length
            ? Math.min(...prices)
            : 0;
      return {
        id: service.id,
        name: service.name,
        nameAr: service.nameAr || "",
        slug: service.slug,
        category: service.category,
        description: service.description,
        descriptionAr: service.descriptionAr || "",
        badge: service.badge,
        imageUrl: service.imageUrl || "",
        startingPriceCents: starting,
        currency,
        rate: rateFor(role),
        deliverySpeed: (service.deliverySpeed === "MANUAL" ? "MANUAL" : "INSTANT") as CatalogService["deliverySpeed"],
        targetInputType: (service.targetInputType === "LANDLINE_PHONE" ? "LANDLINE_PHONE" : "PLAYER_ID") as CatalogService["targetInputType"],
        serviceMode: mode,
        groupId: groupOf(service, state.serviceGroups ?? DEFAULT_GROUPS),
        outOfStock: service.outOfStock === true,
      };
    })
    .sort((left, right) => {
      const category = CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category);
      if (category !== 0) return category;
      return left.name.localeCompare(right.name);
    });
}

function detailOf(state: NovaState, slug: string, role: Role | null, currency: Currency = "USD"): ServiceDetail | null {
  const sypRate = state.sypRate ?? DEFAULT_SYP_RATE_VALUE;
  const service = state.services.find((item) => item.slug === slug);
  if (!service) return null;
  const packages = state.packages
    .filter((pack) => pack.serviceId === service.id)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((pack) => ({
      id: pack.id,
      sizeName: pack.sizeName,
      priceCents: packagePrice(pack, role, currency, sypRate),
      rate: rateFor(role),
      regionId: pack.regionId || undefined,
    }));
  const mode = service.serviceMode ?? "PACKAGES";
  const counterCfg = normalizeCounter(service.counter);
  const per100 = counterPricePer100(counterCfg, role, currency, sypRate);
  const starting =
    mode === "POINT_COUNTER"
      ? counterTotal(per100, counterCfg.minPoints)
      : packages.reduce((min, pack) => Math.min(min, pack.priceCents), packages[0]?.priceCents ?? 0);
  return {
    serviceMode: mode,
    groupId: groupOf(service, state.serviceGroups ?? DEFAULT_GROUPS),
    counter: mode === "POINT_COUNTER" ? { pricePer100Cents: per100, minPoints: counterCfg.minPoints, stepPoints: counterCfg.stepPoints } : undefined,
    id: service.id,
    name: service.name,
    nameAr: service.nameAr || "",
    slug: service.slug,
    category: service.category,
    description: service.description,
    descriptionAr: service.descriptionAr || "",
    badge: service.badge,
    imageUrl: service.imageUrl || "",
    instructions: service.instructions,
    instructionsAr: service.instructionsAr || arabicInstructionsFallback(service),
    targetLabel: serviceTargetLabel(service.category),
    startingPriceCents: starting,
    currency,
    rate: rateFor(role),
    deliverySpeed: service.deliverySpeed === "MANUAL" ? "MANUAL" : "INSTANT",
    targetInputType: service.targetInputType === "LANDLINE_PHONE" ? "LANDLINE_PHONE" : "PLAYER_ID",
    packages,
    customFields: fieldsOf(service),
    outOfStock: service.outOfStock === true,
    regions: regionsOf(service),
  };
}

/** v32.1: a service's region / type options, cleaned. */
function regionsOf(service: StoredService): ServiceRegion[] {
  return (service.regions ?? [])
    .filter((region) => region && typeof region.id === "string" && (region.nameAr || region.nameEn))
    .slice(0, MAX_REGIONS)
    .map((region) => ({ id: region.id, nameAr: region.nameAr ?? "", nameEn: region.nameEn ?? "" }));
}

/** Calls the server route that holds package secrets; returns true when the provider confirmed delivery. */
async function serverDispatch(orderId: string): Promise<boolean> {
  if (typeof window === "undefined" || !supabaseEnv().enabled) return false;
  try {
    await whenSynced(); // the server reads the order from the saved store
    const response = await fetch("/api/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dispatch", token: readToken(), orderId }),
      signal: AbortSignal.timeout(8000),
    });
    const result = (await response.json().catch(() => ({}))) as { status?: string };
    if (result.status !== "delivered") return false;
    await commit(async (state) => {
      const order = state.orders.find((item) => item.id === orderId);
      if (order && order.status === "processing") order.status = "delivered";
      return { state, result: undefined };
    });
    return true;
  } catch {
    return false;
  }
}

type PackageSecret = { packageId: string; apiEndpoint: string; apiSecretCode: string };

async function secretsRequest(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; secrets?: PackageSecret[] }> {
  try {
    const response = await fetch("/api/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, token: readToken() }),
    });
    return (await response.json().catch(() => ({ ok: false, error: `Server answered ${response.status}.` }))) as { ok: boolean; error?: string; secrets?: PackageSecret[] };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

/** Admin: provider endpoints / codes for the service editor (read from the server-only table). */
export async function getPackageSecrets(packageIds: string[]): Promise<Record<string, { apiEndpoint: string; apiSecretCode: string }>> {
  const result = await secretsRequest({ action: "get-secrets", packageIds });
  const map: Record<string, { apiEndpoint: string; apiSecretCode: string }> = {};
  for (const item of result.secrets ?? []) map[item.packageId] = { apiEndpoint: item.apiEndpoint, apiSecretCode: item.apiSecretCode };
  return map;
}

/**
 * One-time move of any provider secrets still in the public store into the server-only table,
 * then wipe them from the public data. Runs when the admin opens the dashboard.
 */
export async function migratePackageSecrets(): Promise<{ moved: number; error?: string }> {
  await ensureReady();
  const state = memory ?? blankState();
  const leaking = state.packages.filter((pack) => pack.apiEndpoint || pack.apiSecretCode);
  if (leaking.length === 0) return { moved: 0 };
  const saved = await secretsRequest({
    action: "save-secrets",
    secrets: leaking.map((pack) => ({ packageId: pack.id, apiEndpoint: pack.apiEndpoint, apiSecretCode: pack.apiSecretCode })),
  });
  if (!saved.ok) return { moved: 0, error: saved.error };
  await commit(async (draft) => {
    requireAdmin(requireUser(await currentUser(draft)));
    for (const pack of draft.packages) {
      pack.apiEndpoint = "";
      pack.apiSecretCode = "";
    }
    return { state: draft, result: undefined };
  });
  return { moved: leaking.length };
}

function usernameTaken(state: NovaState, username: string, exceptId?: string): boolean {
  const key = username.toLowerCase();
  return state.users.some((user) => user.username.toLowerCase() === key && user.id !== exceptId);
}

/** Ledger line. Call it AFTER the balance changed: it records the balance right after (v35). */
function pushTxn(state: NovaState, entry: Omit<StoredTransaction, "id" | "createdAt" | "balanceAfterCents">): void {
  const owner = state.users.find((user) => user.id === entry.userId);
  state.transactions.unshift({
    ...entry,
    ...(owner ? { balanceAfterCents: owner.balanceCents } : {}),
    id: randomId("txn"),
    createdAt: new Date().toISOString(),
  });
  state.transactions = state.transactions.slice(0, 1000);
}

/** v35: puts an order's price back in the wallet once (the `refunded` flag blocks a second refund). */
function refundOrder(state: NovaState, order: StoredOrder, note: string): void {
  if (order.refunded) return;
  const user = state.users.find((item) => item.id === order.userId);
  if (!user) return;
  user.balanceCents = Math.min(balanceCap(asCurrency(user.currency)), user.balanceCents + order.priceCents);
  order.refunded = true;
  order.refundedAt = new Date().toISOString();
  pushTxn(state, { userId: user.id, kind: "refund", cents: order.priceCents, note, referenceId: order.id });
}

/** v35: transfer reference as stored and compared — Arabic digits → 0-9, upper case, no spaces / dashes / # / _. */
export function normalizeRef(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .toUpperCase()
    .replace(/[\s#_-]+/g, "");
}

function mapRequest(item: StoredBalanceRequest): BalanceRequest {
  return {
    id: item.id,
    userId: item.userId,
    username: item.username,
    cents: item.cents,
    status: item.status,
    note: item.note,
    referenceNote: item.referenceNote,
    receiptNumber: item.receiptNumber ?? "",
    method: item.method ?? "SHAMCASH",
    senderName: item.senderName ?? "",
    senderPhone: item.senderPhone ?? "",
    transferNumber: item.transferNumber ?? "",
    transactionRef: item.transactionRef || normalizeRef(item.transferNumber ?? ""),
    isDuplicateRef: item.isDuplicateRef === true,
    currency: asCurrency(item.currency),
    createdAt: item.createdAt,
    processedAt: item.resolvedAt,
  };
}

/** New unique receipt like NC-849201 / TOP-519034. */
function uniqueReceipt(state: NovaState, prefix: "ZC" | "NC" | "TOP"): string {
  const taken = new Set<string>(
    prefix !== "TOP" ? state.orders.map((order) => order.receiptNumber ?? "") : state.balanceRequests.map((item) => item.receiptNumber ?? ""),
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const number = 100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
    const receipt = `${prefix}-${number}`;
    if (!taken.has(receipt)) return receipt;
  }
  return `${prefix}-${Date.now().toString().slice(-8)}`;
}

function pushRequest(
  state: NovaState,
  entry: Omit<StoredBalanceRequest, "id" | "createdAt" | "resolvedAt"> & { status: StoredBalanceRequest["status"] },
): string {
  const now = new Date().toISOString();
  const id = randomId("bal");
  state.balanceRequests.unshift({
    ...entry,
    receiptNumber: entry.receiptNumber || uniqueReceipt(state, "TOP"),
    id,
    createdAt: now,
    resolvedAt: entry.status === "PROCESSING" ? null : now,
  });
  state.balanceRequests = state.balanceRequests.slice(0, 5000);
  return id;
}

export async function warmupStore(): Promise<{ ok: true } | Err> {
  try {
    await ensureReady();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function registerAccount(input: unknown, options: { emailVerified?: boolean } = {}): Promise<Ok<{ token: string; profile: Profile }> | Err> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const ip = await quickIp();
    const token = await commit(async (state) => {
      const email = parsed.data.email.toLowerCase();
      if (state.users.some((user) => user.email.toLowerCase() === email)) {
        throw new Error("An account with that email already exists.");
      }
      // v25: usernames are no longer collected; derive one silently from the email prefix.
      const username = uniqueUsername(state, email);
      const displayName = parsed.data.name;
      const hashed = await hashPassword(parsed.data.password);
      const now = new Date().toISOString();
      const admin = isAdminEmail(email);
      const user: StoredUser = {
        id: admin ? ADMIN_USER_ID : randomId("usr"),
        name: displayName,
        username,
        email,
        phone: formatSyMobile(parsed.data.phone),
        avatarUrl: "",
        passwordHash: hashed.passwordHash,
        passwordSalt: hashed.passwordSalt,
        role: admin ? "ADMIN" : "NORMAL",
        currency: admin ? "USD" : parsed.data.currency,
        balanceCents: admin ? ADMIN_BALANCE_CENTS : 0,
        isBlocked: false,
        authProvider: "password",
        emailVerified: options.emailVerified === true ? true : undefined,
        lastIp: ip || null,
        lastCountry: cachedCountry || null,
        lastSeenAt: now,
        createdAt: now,
      };
      state.users.push(user);
      const issued = await openSession(state, user.id);
      writeToken(issued);
      return { state, result: issued };
    });
    notifyAuth();
    const profile = await readProfile();
    if (!profile) return { ok: false, error: "Account saved, but the session could not be read." };
    return { ok: true, token, profile };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/* ------------------------------ v27: sign-in security ------------------------------ */

const MAX_FAILED_LOGINS = 3;
const MAX_DAILY_LOGINS = 3;

/** Calendar day in Damascus time, so "per day" matches the customer's own day. */
function damascusDay(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Damascus", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const LOGIN_TEXT = {
  ar: {
    wrong: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    remaining: (left: number) => `كلمة المرور غير صحيحة. محاولات متبقية قبل قفل الحساب: ${left}`,
    locked: "🔒 تم قفل هذا الحساب أمنياً بعد 3 محاولات خاطئة لكلمة المرور. يرجى التواصل مع الدعم الفني لفك القفل.",
    daily: "⚠️ لقد وصلت للحد الأقصى لتسجيل الدخول اليومي (3 مرات في اليوم). يرجى المحاولة غداً أو التواصل مع الدعم الفني.",
    blocked: "هذا الحساب موقوف.",
  },
  en: {
    wrong: "Email or password is incorrect.",
    remaining: (left: number) => `Wrong password. Attempts left before the account is locked: ${left}`,
    locked: "🔒 This account has been locked after 3 failed password attempts. Please contact Live Support to unlock it.",
    daily: "⚠️ You have reached the maximum daily sign-in limit (3 logins per day). Please try again tomorrow or contact support.",
    blocked: "This account is blocked.",
  },
};

/** Shared by password and Google sign-in: blocks a 4th sign-in today; admins are exempt. */
function countDailyLogin(user: StoredUser, text: (typeof LOGIN_TEXT)["ar"]): string | null {
  if (user.role === "ADMIN" || isAdminEmail(user.email)) return null;
  const today = damascusDay();
  if (user.lastLoginDate === today && (user.dailyLoginCount ?? 0) >= MAX_DAILY_LOGINS) return text.daily;
  user.dailyLoginCount = user.lastLoginDate === today ? (user.dailyLoginCount ?? 0) + 1 : 1;
  user.lastLoginDate = today;
  return null;
}

/**
 * Password sign-in with v27 protection:
 *  - 3 wrong passwords in a row → account locked until an admin unlocks it (admins exempt);
 *  - max 3 successful sign-ins per Damascus day (admins exempt);
 *  - the counters are written in the same save as the check, so they persist for every device.
 */
export async function loginAccount(input: unknown, language: "ar" | "en" = "ar"): Promise<Ok<{ token: string; profile: Profile }> | Err> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const text = LOGIN_TEXT[language];
  try {
    const ip = await quickIp();
    type LoginOutcome = { error: string } | { token: string };
    const outcome = await commit<LoginOutcome>(async (state) => {
      const user = state.users.find((item) => item.email.toLowerCase() === parsed.data.email.toLowerCase());
      if (!user) throw new Error(text.wrong);
      const exempt = user.role === "ADMIN" || isAdminEmail(user.email);
      if (!exempt && user.isLocked) throw new Error(text.locked);
      const hashed = await hashPassword(parsed.data.password, user.passwordSalt);
      if (!safeEqual(hashed.passwordHash, user.passwordHash)) {
        if (exempt) throw new Error(text.wrong);
        // Wrong password: the counter is SAVED (no throw), then the error is shown.
        user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
        if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) user.isLocked = true;
        const error = user.isLocked ? text.locked : text.remaining(MAX_FAILED_LOGINS - user.failedLoginAttempts);
        return { state, result: { error } };
      }
      if (user.isBlocked) throw new Error(text.blocked);
      const daily = countDailyLogin(user, text);
      if (daily) throw new Error(daily);
      user.failedLoginAttempts = 0;
      if (ip) user.lastIp = ip;
      if (cachedCountry) user.lastCountry = cachedCountry;
      user.lastSeenAt = new Date().toISOString();
      if (isAdminEmail(user.email)) user.role = "ADMIN";
      const issued = await openSession(state, user.id);
      writeToken(issued);
      return { state, result: { token: issued } };
    });
    if ("error" in outcome) return { ok: false, error: outcome.error };
    // v35: the admin's normal sign-in also opens the owner's secure Supabase session (silently).
    if (isAdminEmail(parsed.data.email)) await activateOwnerSession(parsed.data.password).catch(() => undefined);
    notifyAuth();
    const profile = await readProfile();
    if (!profile) return { ok: false, error: "Signed in, but the profile could not be read." };
    return { ok: true, token: outcome.token, profile };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** Admin: unlock an account and reset its wrong-password and daily sign-in counters. */
export async function adminUnlockUser(userId: string): Promise<Ok<Record<never, never>> | Err> {
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const user = state.users.find((item) => item.id === userId);
      if (!user) throw new Error("User not found.");
      user.isLocked = false;
      user.failedLoginAttempts = 0;
      user.dailyLoginCount = 0;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** v33 — admin: lock an account at once (it can't sign in until unlocked). */
export async function adminLockUser(userId: string): Promise<Ok<Record<never, never>> | Err> {
  try {
    await commit(async (state) => {
      const admin = requireUser(await currentUser(state));
      requireAdmin(admin);
      const user = state.users.find((item) => item.id === userId);
      if (!user) throw new Error("User not found.");
      if (user.id === admin.id || isAdminEmail(user.email)) throw new Error("Admin accounts can't be locked here.");
      user.isLocked = true;
      // Close every open session of that account.
      state.sessions = state.sessions.filter((session) => session.userId !== user.id);
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export function notifyAuth(): void {
  emit();
}

export async function logoutAccount(): Promise<void> {
  const token = readToken();
  writeToken(null);
  // v35: also close the owner's secure Supabase session on this device.
  guardState = "unknown";
  void getSupabase()?.auth.signOut({ scope: "local" }).catch(() => undefined);
  if (!token) return;
  const tokenHash = await sha256(token);
  await commit((state) => {
    state.sessions = state.sessions.filter((session) => session.tokenHash !== tokenHash);
    return { state, result: undefined };
  });
}

/** Role + currency of the signed-in viewer, cached so pages can price things synchronously. */
let viewerCache: { role: Role; currency: Currency } | null = null;

export async function readProfile(): Promise<Profile | null> {
  await ensureReady();
  const state = memory ?? (await loadAuthoritative());
  const user = await currentUser(state);
  viewerCache = user ? { role: user.role, currency: asCurrency(user.currency) } : null;
  return user ? toProfile(user) : null;
}

/**
 * Instant (0 ms) service detail straight from the in-memory store, priced for the cached viewer.
 * Returns null only on a cold first load, before the store is in memory.
 */
export function peekService(slug: string, previewCurrency: Currency = "USD"): ServiceDetail | null {
  if (!memory) return null;
  return detailOf(memory, slug, viewerCache?.role ?? null, viewerCache?.currency ?? previewCurrency);
}

export async function checkUsername(input: unknown): Promise<{ available: boolean }> {
  const parsed = usernameCheckSchema.safeParse(unwrap(input));
  if (!parsed.success) throw new Error(zodError(parsed.error));
  await ensureReady();
  const state = memory ?? (await loadAuthoritative());
  return { available: !usernameTaken(state, parsed.data.username) };
}

export async function syncMe(input: unknown): Promise<Ok<{ profile: Profile }> | Err> {
  const parsed = syncSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const ip = await quickIp();
    const profile = await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      if (parsed.data.username && usernameTaken(state, parsed.data.username, user.id)) {
        throw new Error("That username is already taken.");
      }
      if (parsed.data.username) user.username = parsed.data.username;
      if (ip) user.lastIp = ip;
      if (cachedCountry) user.lastCountry = cachedCountry;
      user.lastSeenAt = new Date().toISOString();
      if (isAdminEmail(user.email)) {
        user.role = "ADMIN";
        if (parsed.data.grantAdminWallet) user.balanceCents = Math.max(user.balanceCents, ADMIN_BALANCE_CENTS);
      }
      return { state, result: toProfile(user) };
    });
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

function asCurrency(value: unknown): Currency {
  return value === "SYP" ? "SYP" : "USD";
}

export async function getPublicCatalog(currency?: Currency): Promise<CatalogService[]> {
  await ensureReady();
  return catalogOf(memory ?? blankState(), null, asCurrency(currency));
}

export async function getViewerCatalog(currency?: Currency): Promise<CatalogService[]> {
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  return catalogOf(state, user?.role ?? null, user ? asCurrency(user.currency) : asCurrency(currency));
}

export async function getPublicService(input: unknown): Promise<ServiceDetail | null> {
  const raw = unwrap(input) as { currency?: unknown };
  const parsed = slugSchema.parse(raw);
  await ensureReady();
  return detailOf(memory ?? blankState(), parsed.slug, null, asCurrency(raw?.currency));
}

export async function getViewerService(input: unknown): Promise<ServiceDetail | null> {
  const raw = unwrap(input) as { currency?: unknown; preview?: unknown };
  const parsed = slugSchema.parse(raw);
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  // `preview` shows the viewer's own role prices in another currency (display only; charges stay in the account currency).
  const currency = user && raw?.preview !== true ? asCurrency(user.currency) : asCurrency(raw?.currency);
  return detailOf(state, parsed.slug, user?.role ?? null, currency);
}

export const CHARGE_COOLDOWN_MS = 15_000;
/** Last charge attempt per user, kept in memory so even failed attempts start the cooldown. */
const chargeAttempts = new Map<string, number>();

/** `callAt` identifies this attempt so a conflict-retry of the same save does not block itself. */
function cooldownLeft(user: StoredUser, callAt: number): number {
  const fromMemory = chargeAttempts.get(user.id) ?? 0;
  const fromState = user.lastChargeAt ?? 0;
  const last = Math.max(fromMemory === callAt ? 0 : fromMemory, fromState === callAt ? 0 : fromState);
  return Math.max(0, last + CHARGE_COOLDOWN_MS - Date.now());
}

type PurchaseInput = ReturnType<typeof purchaseSchema.parse>;

/**
 * Checks a purchase against `state` and builds the order (same rules the server applies).
 * Mutates `state`: takes the price off the wallet and stamps the cooldown.
 */
async function draftPurchase(state: NovaState, data: PurchaseInput, ip: string, callAt: number) {
  const parsed = { data };
  const user = requireUser(await currentUser(state));
  assertCanTransact(user);
  const left = cooldownLeft(user, callAt);
  if (left > 0) {
    const seconds = Math.ceil(left / 1000);
    throw new Error(`يرجى الانتظار ${seconds} ثانية قبل تكرار عملية الشحن · Please wait ${seconds} seconds before making another charge`);
  }
  chargeAttempts.set(user.id, callAt);
  user.lastChargeAt = callAt;
  const pack = parsed.data.packageId ? state.packages.find((item) => item.id === parsed.data.packageId) : undefined;
  const service = pack
    ? state.services.find((item) => item.id === pack.serviceId)
    : state.services.find((item) => item.id === parsed.data.serviceId);
  if (!service) throw new Error("That service is no longer available.");
  const mode = service.serviceMode ?? "PACKAGES";
  const currency = asCurrency(user.currency);
  const sypRate = state.sypRate ?? DEFAULT_SYP_RATE_VALUE;
  let price: number;
  let packageName: string;
  if (mode === "POINT_COUNTER") {
    const counter = normalizeCounter(service.counter);
    const points = parsed.data.points ?? 0;
    if (points < counter.minPoints) throw new Error(`Minimum is ${counter.minPoints} points.`);
    if (points % counter.stepPoints !== 0) throw new Error(`Points must be in steps of ${counter.stepPoints}.`);
    price = counterTotal(counterPricePer100(counter, user.role, currency, sypRate), points);
    packageName = `${points.toLocaleString("en-US")} pts`;
  } else {
    if (!pack) throw new Error("That charge size is no longer available.");
    price = packagePrice(pack, user.role, currency, sypRate);
    // v32.1: name the region / type on the order ("USA · $10 card").
    const region = pack.regionId ? service.regions?.find((item) => item.id === pack.regionId) : undefined;
    packageName = region ? `${region.nameAr || region.nameEn} · ${pack.sizeName}` : pack.sizeName;
  }
  // v32: an out-of-stock service can't be bought until the admin switches it back on.
  if (service.outOfStock) {
    throw new Error("هذه الخدمة غير متوفرة حالياً · This service is out of stock right now.");
  }
  // v31: services with admin-defined fields collect those instead of the single ID box.
  const wanted = mode === "VAULT" ? [] : fieldsOf(service);
  const answers = new Map<string, string>(
    (parsed.data.fields as Array<{ id: string; value: string }>).map((field) => [field.id, String(field.value).trim()]),
  );
  const fields: OrderField[] = wanted.map((field) => ({ id: field.id, labelAr: field.labelAr, labelEn: field.labelEn, value: answers.get(field.id) ?? "" }));
  const missing = wanted.find((field, index) => field.required && !fields[index].value);
  if (missing) {
    const ar = missing.labelAr || missing.labelEn;
    const en = missing.labelEn || missing.labelAr;
    throw new Error(`يرجى تعبئة «${ar}» · Please fill in “${en}”.`);
  }
  // The first answer doubles as the target ID (what providers and the admin list show).
  const targetId: string =
    mode === "VAULT" ? "" : wanted.length ? (fields.find((field) => field.value)?.value ?? "").slice(0, 80) : String(parsed.data.targetId ?? "");
  if (mode !== "VAULT" && !wanted.length && targetId.length < 3) throw new Error("Enter the full account or player ID.");
  if (user.balanceCents < price) throw new Error("Not enough wallet balance for this package.");
  user.balanceCents -= price;
  user.lastIp = ip;
  user.lastSeenAt = new Date().toISOString();
  const manual = service.deliverySpeed === "MANUAL";
  if (!wanted.length && service.targetInputType === "LANDLINE_PHONE" && !/^0\d{2}-?\d{6,7}$/.test(targetId.replace(/\s/g, ""))) {
    throw new Error("Enter the landline number with the area code, e.g. 011-1234567. · أدخل رقم الهاتف الأرضي مع رمز المحافظة.");
  }
  const orderId = randomId("ord");
  // Vault orders are fulfilled by the server (claim), manual ones wait for the admin,
  // instant ones start "processing" and the server route sends them to the provider
  // (provider secrets never reach the browser).
  const status = mode === "VAULT" ? "PENDING_VAULT" : manual ? "PENDING_MANUAL" : "processing";
  const order: StoredOrder = {
    id: orderId,
    userId: user.id,
    serviceId: service.id,
    packageId: pack?.id ?? `points:${parsed.data.points ?? 0}`,
    serviceName: service.name,
    serviceSlug: service.slug,
    packageName,
    targetId,
    priceCents: price,
    currency,
    roleAtPurchase: user.role,
    ipAddress: ip,
    status,
    fulfillmentRef: `ZC-${orderId.slice(4, 10).toUpperCase()}`,
    receiptNumber: uniqueReceipt(state, "ZC"),
    createdAt: new Date().toISOString(),
    ...(fields.length ? { fields: fields.filter((field) => field.value) } : {}),
  };
  return { user, service, order, price, packageName };
}

/* ------------------------------ v35: server-side atomic purchase ------------------------------ */

let atomicMissing = false;

/** Bilingual text for the purchase function's error codes (ZC_FUNDS, ZC_COOLDOWN:12 …). */
function purchaseError(message: string): string {
  const code = /ZC_[A-Z_]+(?::\d+)?/.exec(message)?.[0] ?? "";
  const [name, value = ""] = code.split(":");
  switch (name) {
    case "ZC_FUNDS":
      return "رصيد المحفظة غير كافٍ لهذه الباقة · Not enough wallet balance for this package.";
    case "ZC_COOLDOWN":
      return `يرجى الانتظار ${value} ثانية قبل تكرار عملية الشحن · Please wait ${value} seconds before making another charge`;
    case "ZC_OOS":
      return "هذه الخدمة غير متوفرة حالياً · This service is out of stock right now.";
    case "ZC_VAULT_EMPTY":
      return "نفدت الكمية من هذه الباقة الآن، ولم يُخصم أي مبلغ · This size just sold out — nothing was charged.";
    case "ZC_GONE":
      return "هذه الباقة لم تعد متوفرة · That charge size is no longer available.";
    case "ZC_AUTH":
      return "انتهت الجلسة، سجّل الدخول مجدداً · Your session ended — please sign in again.";
    case "ZC_BLOCKED":
      return "This account is blocked.";
    case "ZC_MIN":
      return `Minimum is ${value} points.`;
    case "ZC_STEP":
      return `Points must be in steps of ${value}.`;
    default:
      return message || "ZovaCharge could not complete the purchase. Try again.";
  }
}

/**
 * Calls `purchase_service_atomic` (SQL part 9): price from the database, balance locked, vault
 * piece taken and wallet charged in one transaction. "missing" → part 9 isn't installed yet.
 */
async function purchaseOnServer(data: PurchaseInput, ip: string, callAt: number): Promise<"missing" | Ok<{ order: OrderRow; profile: Profile }> | Err> {
  const client = getSupabase();
  const token = readToken();
  if (atomicMissing || !client || !token || !supabaseEnv().enabled) return "missing";
  await ensureReady();
  // Same checks as the server, on a copy, so the customer gets the exact message straight away.
  const draft = await draftPurchase(cloneState(memory ?? blankState()), data, ip, callAt);
  const { data: result, error } = await withTimeout(
    client.rpc("purchase_service_atomic", {
      p_token: token,
      p_order_id: draft.order.id,
      p_service_id: draft.service.id,
      p_package_id: data.packageId ?? null,
      p_points: data.points ?? null,
      p_target_id: draft.order.targetId,
      p_fields: draft.order.fields ?? [],
      p_ip: ip || null,
      p_receipt: draft.order.receiptNumber ?? null,
    }),
    12_000,
    "تعذّر تأكيد العملية — راجع «طلباتي» قبل المحاولة مجدداً · Couldn't confirm the purchase — check My Orders before trying again.",
  );
  if (error) {
    const code = String((error as { code?: string }).code ?? "");
    const message = String((error as { message?: string }).message ?? "");
    if (code === "PGRST202" || code === "42883" || /could not find the function/i.test(message)) {
      atomicMissing = true;
      return "missing";
    }
    return { ok: false, error: purchaseError(message) };
  }
  const reply = result as { order?: StoredOrder; balanceCents?: number; transaction?: StoredTransaction; version?: number } | null;
  if (!reply?.order) return { ok: false, error: purchaseError("") };
  const order = reply.order;
  // Show it at once; the next sync downloads the server copy (it is the source of truth).
  const profile = await enqueue(async () => {
    for (const target of [memory, lastSynced]) {
      if (!target) continue;
      const user = target.users.find((item) => item.id === order.userId);
      if (user) {
        if (typeof reply.balanceCents === "number") user.balanceCents = reply.balanceCents;
        user.lastChargeAt = callAt;
      }
      if (!target.orders.some((item) => item.id === order.id)) target.orders.unshift(order);
      if (reply.transaction && !target.transactions.some((item) => item.id === reply.transaction?.id)) target.transactions.unshift(reply.transaction);
    }
    needsPull = true;
    if (memory) {
      writeLocal(memory);
      emit();
    }
    const user = memory?.users.find((item) => item.id === order.userId);
    return user ? toProfile(user) : null;
  });
  if (!profile) return { ok: false, error: purchaseError("") };
  void syncOnce().catch(() => undefined);
  return { ok: true, order: mapOrder(order), profile };
}

export async function purchase(input: unknown): Promise<Ok<{ order: OrderRow; profile: Profile }> | Err> {
  const parsed = purchaseSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const callAt = Date.now();
  try {
    const ip = await quickIp();
    let outcome: { order: OrderRow; profile: Profile };
    const server = await purchaseOnServer(parsed.data, ip, callAt);
    if (server !== "missing") {
      if (!server.ok) return server;
      outcome = { order: server.order, profile: server.profile };
    } else {
      // Before SQL part 9 is run: the classic browser-side save (unchanged behaviour).
      outcome = await commit(async (state) => {
        const { user, service, order, price, packageName } = await draftPurchase(state, parsed.data, ip, callAt);
        state.orders.unshift(order);
        pushTxn(state, {
          userId: user.id,
          kind: "purchase",
          cents: -price,
          note: `${service.name} · ${packageName}`,
          referenceId: order.id,
        });
        return { state, result: { order: mapOrder(order), profile: toProfile(user) } };
      });
    }
    if (outcome.order.status === "PENDING_MANUAL") notifyAdmins({ kind: "manual", id: outcome.order.id });
    if (outcome.order.status === "processing" && !(outcome.order.packageId ?? "").startsWith("points:")) {
      const delivered = await serverDispatch(outcome.order.id);
      if (delivered) outcome.order = { ...outcome.order, status: "delivered" };
    }
    return { ok: true, ...outcome };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function listMyOrders(): Promise<OrderRow[]> {
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  if (!user) return [];
  return state.orders.filter((order) => order.userId === user.id).slice(0, 50).map(mapOrder);
}

export async function topUpSelf(): Promise<Err> {
  return { ok: false, error: "Wallet top-ups are reviewed through ShamCash. Submit a transfer reference." };
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  SHAMCASH: "ShamCash",
  SYRIATEL_CASH: "Syriatel Cash",
  MTN_CASH: "MTN Cash",
};

export async function submitBalanceRequest(
  input: unknown,
): Promise<Ok<{ id: string; request: BalanceRequest }> | Err> {
  const parsed = balanceRequestSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const { cents, method } = parsed.data;
  // v35: one normalised reference (trimmed, upper case) for storage and duplicate checks.
  const transactionRef = normalizeRef(parsed.data.transferNumber);
  const transferNumber = parsed.data.transferNumber.trim().toUpperCase();
  if (transactionRef.length < 3) return { ok: false, error: "Enter the transfer number. · أدخل رقم العملية / المرجع." };
  const senderName = method === "SHAMCASH" ? parsed.data.senderName : "";
  const senderPhone = method === "SHAMCASH" ? "" : parsed.data.senderPhone.replace(/[\s-]/g, "");
  const reference = `${METHOD_LABEL[method]} · ${senderName || senderPhone} · #${transferNumber}`;
  try {
    const request = await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      assertCanTransact(user);
      // 30 s between top-up requests for the same account (any device).
      const lastAt = Math.max(0, ...state.balanceRequests.filter((item) => item.userId === user.id).map((item) => Date.parse(item.createdAt) || 0));
      const wait = Math.ceil((lastAt + 30_000 - Date.now()) / 1000);
      if (wait > 0) throw new Error(`⏳ يرجى الانتظار ${wait} ثانية قبل إرسال طلب شحن جديد · Please wait ${wait} seconds before submitting another top-up request`);
      const sameRef = state.balanceRequests.filter((item) => normalizeRef(item.transactionRef || item.transferNumber || "") === transactionRef);
      // Same wallet + same reference still open or approved: refused outright.
      if (sameRef.some((item) => (item.method ?? "SHAMCASH") === method && item.status !== "REJECTED")) {
        throw new Error("This transfer number was already submitted. · رقم التحويل هذا مُرسل مسبقاً.");
      }
      // Any other reuse (another wallet, or after a rejection) goes through, flagged for the admin.
      const isDuplicateRef = sameRef.length > 0;
      const id = pushRequest(state, {
        userId: user.id,
        username: user.username,
        cents,
        status: "PROCESSING",
        note: reference,
        referenceNote: reference,
        method,
        senderName,
        senderPhone,
        transferNumber,
        transactionRef,
        ...(isDuplicateRef ? { isDuplicateRef: true } : {}),
        currency: asCurrency(user.currency),
      });
      const stored = state.balanceRequests.find((item) => item.id === id);
      if (!stored) throw new Error("Could not save the request.");
      return { state, result: { id, request: mapRequest(stored) } };
    });
    notifyAdmins({ kind: "topup", id: request.id });
    return { ok: true, ...request };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function requestBalance(input: { cents: number; note?: string }): Promise<Ok<{ id: string }> | Err> {
  const submitted = await submitBalanceRequest({
    cents: input.cents,
    method: "SHAMCASH",
    senderName: input.note?.trim() || "Balance request",
    transferNumber: `legacy-${Date.now()}`,
  });
  if (!submitted.ok) return submitted;
  return { ok: true, id: submitted.id };
}

export async function listMyBalanceRequests(): Promise<BalanceRequest[]> {
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  if (!user) return [];
  return state.balanceRequests.filter((item) => item.userId === user.id).slice(0, 200).map(mapRequest);
}

function adminServiceOf(state: NovaState, slug: string): AdminService | null {
  const service = state.services.find((item) => item.slug === slug);
  if (!service) return null;
  return {
    id: service.id,
    name: service.name,
    nameAr: service.nameAr || "",
    descriptionAr: service.descriptionAr || "",
    deliverySpeed: service.deliverySpeed === "MANUAL" ? "MANUAL" : "INSTANT",
    targetInputType: service.targetInputType === "LANDLINE_PHONE" ? "LANDLINE_PHONE" : "PLAYER_ID",
    serviceMode: service.serviceMode ?? "PACKAGES",
    counter: normalizeCounter(service.counter),
    groupId: service.groupId ?? "",
    slug: service.slug,
    category: service.category,
    description: service.description,
    instructions: service.instructions,
    instructionsAr: service.instructionsAr ?? "",
    badge: service.badge,
    imageUrl: service.imageUrl || "",
    packages: state.packages
      .filter((pack) => pack.serviceId === service.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((pack) => ({
        id: pack.id,
        sizeName: pack.sizeName,
        normalPriceCents: pack.normalPriceCents,
        vipPriceCents: pack.vipPriceCents,
        normalPriceSypCents: pack.normalPriceSypCents ?? 0,
        vipPriceSypCents: pack.vipPriceSypCents ?? 0,
        apiEndpoint: pack.apiEndpoint,
        apiSecretCode: pack.apiSecretCode,
        regionId: pack.regionId || undefined,
      })),
    customFields: fieldsOf(service),
    regions: regionsOf(service),
  };
}

export async function getAdminService(input: unknown): Promise<Ok<{ service: AdminService }> | Err> {
  const parsed = slugSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await ensureReady();
    const state = memory ?? (await loadAuthoritative());
    requireAdmin(requireUser(await currentUser(state)));
    const service = adminServiceOf(state, parsed.data.slug);
    if (!service) return { ok: false, error: "Service not found." };
    return { ok: true, service };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function saveServiceAction(input: unknown): Promise<Ok<{ slug: string }> | Err> {
  const parsed = serviceWriteSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  // Final package ids are fixed up-front so their secrets can be stored server-side before the save.
  for (const pack of parsed.data.packages) {
    if (!pack.id || pack.id.startsWith("draft-")) pack.id = randomId("pkg");
  }
  const secrets = parsed.data.packages.map((pack) => ({ packageId: pack.id as string, apiEndpoint: pack.apiEndpoint ?? "", apiSecretCode: pack.apiSecretCode ?? "" }));
  const hasSecrets = secrets.some((item) => item.apiEndpoint.trim() || item.apiSecretCode.trim());
  if (hasSecrets || parsed.data.id) {
    const saved = await secretsRequest({ action: "save-secrets", secrets });
    if (!saved.ok && hasSecrets) {
      return { ok: false, error: `Provider secrets could not be stored securely: ${saved.error ?? "server error"}` };
    }
  }
  try {
    const slug = await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const body = parsed.data;
      const clash = state.services.find((service) => service.slug === body.slug && service.id !== body.id);
      if (clash) throw new Error("That slug is already used by another service.");
      let service: StoredService | undefined = body.id
        ? state.services.find((item) => item.id === body.id)
        : undefined;
      if (body.id && !service) throw new Error("That service no longer exists.");
      if (!service) {
        const arabic = arabicFor(body.slug);
        service = {
          id: randomId("svc"),
          name: body.name,
          nameAr: body.nameAr || arabic?.nameAr || "",
          slug: body.slug,
          category: body.category,
          description: body.description,
          descriptionAr: body.descriptionAr || arabic?.descriptionAr || "",
          deliverySpeed: body.deliverySpeed,
          targetInputType: body.targetInputType,
          groupId: body.groupId || undefined,
          serviceMode: body.serviceMode,
          counter: normalizeCounter(body.counter),
          customFields: body.customFields,
          regions: body.regions.length ? body.regions : undefined,
          instructions: body.instructions,
          instructionsAr: body.instructionsAr || "",
          badge: body.badge.trim() ? body.badge.trim() : null,
          imageUrl: body.imageUrl.trim(),
          createdAt: new Date().toISOString(),
        };
        state.services.push(service);
        state.deletedSlugs = (state.deletedSlugs ?? []).filter((item) => item !== body.slug);
      } else {
        const arabic = arabicFor(body.slug);
        service.name = body.name;
        service.slug = body.slug;
        service.category = body.category;
        service.description = body.description;
        service.instructions = body.instructions;
        service.instructionsAr = body.instructionsAr || service.instructionsAr || "";
        service.badge = body.badge.trim() ? body.badge.trim() : null;
        service.imageUrl = body.imageUrl.trim();
        service.nameAr = body.nameAr || arabic?.nameAr || service.nameAr || "";
        service.descriptionAr = body.descriptionAr || arabic?.descriptionAr || service.descriptionAr || "";
        service.deliverySpeed = body.deliverySpeed;
        service.targetInputType = body.targetInputType;
        service.groupId = body.groupId || undefined;
        service.serviceMode = body.serviceMode;
        service.counter = normalizeCounter(body.counter ?? service.counter);
        service.customFields = body.customFields;
        service.regions = body.regions.length ? body.regions : undefined;
      }
      const regionIds = new Set((service.regions ?? []).map((region) => region.id));
      const serviceId = service.id;
      state.packages = state.packages.filter((pack) => pack.serviceId !== serviceId);
      body.packages.forEach((pack, index) => {
        const stored: StoredPackage = {
          id: pack.id as string,
          serviceId,
          sizeName: pack.sizeName,
          normalPriceCents: pack.normalPriceCents,
          vipPriceCents: pack.vipPriceCents,
          normalPriceSypCents: pack.normalPriceSypCents,
          vipPriceSypCents: pack.vipPriceSypCents,
          apiEndpoint: "", // server-only (package_secrets table)
          apiSecretCode: "",
          sortOrder: index,
          regionId: pack.regionId && regionIds.has(pack.regionId) ? pack.regionId : undefined,
        };
        state.packages.push(stored);
      });
      return { state, result: body.slug };
    });
    return { ok: true, slug };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function deleteServiceAction(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = slugSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const service = state.services.find((item) => item.slug === parsed.data.slug);
      if (!service) throw new Error("Service not found.");
      state.services = state.services.filter((item) => item.id !== service.id);
      state.packages = state.packages.filter((pack) => pack.serviceId !== service.id);
      state.deletedSlugs = Array.from(new Set([...(state.deletedSlugs ?? []), service.slug]));
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

function statsOf(state: NovaState): AdminStats {
  const cutoff = Date.now() - ONLINE_MS;
  const recent: AdminOrder[] = state.orders.slice(0, 12).map((order) => {
    const user = state.users.find((item) => item.id === order.userId);
    return {
      ...mapOrder(order),
      userName: user?.name ?? "Unknown",
      username: user?.username ?? "unknown",
      ipAddress: order.ipAddress,
    };
  });
  return {
    onlineSessions: state.users.filter((user) => Date.parse(user.lastSeenAt) > cutoff).length,
    serviceCount: state.services.length,
    // USD-equivalent: SYP orders are converted with the current store rate.
    revenueCents: Math.round(
      state.orders
        .filter((order) => order.status !== "failed")
        .reduce(
          (sum, order) =>
            sum + (order.currency === "SYP" ? order.priceCents / (state.sypRate || DEFAULT_SYP_RATE_VALUE) : order.priceCents),
          0,
        ),
    ),
    recent,
  };
}

function usersOf(state: NovaState): AdminUser[] {
  return [...state.users]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((user) => ({
      userId: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      currency: asCurrency(user.currency),
      balanceCents: user.balanceCents,
      phone: user.phone ?? "",
      createdAt: user.createdAt,
      lastIp: user.lastIp,
      lastSeenAt: user.lastSeenAt,
      isBlocked: user.isBlocked === true,
      isLocked: user.isLocked === true,
      failedLoginAttempts: user.failedLoginAttempts ?? 0,
      dailyLoginCount: user.lastLoginDate === damascusDay() ? (user.dailyLoginCount ?? 0) : 0,
      lastLoginDate: user.lastLoginDate,
      authProvider: user.authProvider === "google" ? "google" : "email",
      emailVerified: user.emailVerified === true || user.authProvider === "google",
      honeypotFlagged: user.honeypotFlagged === true,
      lastCountry: user.lastCountry ?? null,
    }));
}

export async function getAdminDashboard(): Promise<Ok<{ stats: AdminStats; users: AdminUser[] }> | Err> {
  try {
    await ensureReady();
    const state = memory ?? (await loadAuthoritative());
    requireAdmin(requireUser(await currentUser(state)));
    return { ok: true, stats: statsOf(state), users: usersOf(state) };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function toggleBlockUser(input: unknown): Promise<{ ok: true; isBlocked: boolean } | Err> {
  const parsed = blockUserSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const isBlocked = await commit(async (state) => {
      const actor = requireUser(await currentUser(state));
      requireAdmin(actor);
      const target = state.users.find((user) => user.id === parsed.data.userId);
      if (!target) throw new Error("User not found.");
      if (target.id === actor.id) throw new Error("You cannot block your own account.");
      if (isAdminEmail(target.email)) throw new Error("The primary admin cannot be blocked.");
      target.isBlocked = !target.isBlocked;
      if (target.isBlocked) {
        state.sessions = state.sessions.filter((session) => session.userId !== target.id);
      }
      return { state, result: target.isBlocked };
    });
    return { ok: true, isBlocked };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function updateProfile(input: unknown): Promise<Ok<{ profile: Profile }> | Err> {
  const parsed = profileUpdateSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const profile = await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      assertCanTransact(user);
      user.name = parsed.data.name;
      user.phone = parsed.data.phone;
      user.avatarUrl = parsed.data.avatarUrl;
      user.lastSeenAt = new Date().toISOString();
      return { state, result: toProfile(user) };
    });
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function setUserRole(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = adminRoleSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const target = state.users.find((user) => user.id === parsed.data.userId);
      if (!target) throw new Error("User not found.");
      if (isAdminEmail(target.email)) throw new Error("The primary admin role cannot be changed.");
      if ((parsed.data.role as string) === "ADMIN") throw new Error(`Only ${ADMIN_EMAIL} can hold the ADMIN role.`);
      target.role = parsed.data.role;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function topUpUser(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = adminTopUpSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      const actor = requireUser(await currentUser(state));
      requireAdmin(actor);
      const target = state.users.find((user) => user.id === parsed.data.userId);
      if (!target) throw new Error("User not found.");
      target.balanceCents = Math.min(balanceCap(asCurrency(target.currency)), target.balanceCents + parsed.data.cents);
      pushTxn(state, {
        userId: target.id,
        kind: "admin_topup",
        cents: parsed.data.cents,
        note: `Added by ${actor.username}`,
      });
      pushRequest(state, {
        userId: target.id,
        username: target.username,
        cents: parsed.data.cents,
        status: "APPROVED",
        note: `Admin credit by ${actor.username}`,
        referenceNote: `Admin credit by ${actor.username}`,
        currency: asCurrency(target.currency),
      });
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function listBalanceRequests(): Promise<StoredBalanceRequest[]> {
  await ensureReady();
  const state = memory ?? blankState();
  requireAdmin(requireUser(await currentUser(state)));
  return state.balanceRequests.slice(0, 40);
}

export async function approveBalanceRequest(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = requestIdSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      const actor = requireUser(await currentUser(state));
      requireAdmin(actor);
      const request = state.balanceRequests.find((item) => item.id === parsed.data.id);
      if (!request) throw new Error("Request not found.");
      if (request.status !== "PROCESSING") throw new Error("That request is already closed.");
      const target = state.users.find((user) => user.id === request.userId);
      if (!target) throw new Error("User not found.");
      target.balanceCents = Math.min(balanceCap(asCurrency(target.currency)), target.balanceCents + request.cents);
      request.status = "APPROVED";
      request.resolvedAt = new Date().toISOString();
      pushTxn(state, {
        userId: target.id,
        kind: "self_topup",
        cents: request.cents,
        note: request.referenceNote,
        referenceId: request.id,
      });
      return { state, result: undefined };
    });
    notifyAdmins({ kind: "topup_result", id: parsed.data.id });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function rejectBalanceRequest(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = requestIdSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const request = state.balanceRequests.find((item) => item.id === parsed.data.id);
      if (!request) throw new Error("Request not found.");
      if (request.status !== "PROCESSING") throw new Error("That request is already closed.");
      request.status = "REJECTED";
      request.resolvedAt = new Date().toISOString();
      return { state, result: undefined };
    });
    notifyAdmins({ kind: "topup_result", id: parsed.data.id });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function getShamcashAddress(): Promise<string> {
  await ensureReady();
  const state = memory ?? blankState();
  return state.shamcashAddress || DEFAULT_SHAMCASH;
}

export async function setShamcashAddress(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = shamcashSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      state.shamcashAddress = parsed.data.address;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function getPaymentAddresses(): Promise<PaymentAddresses> {
  await ensureReady();
  const state = memory ?? blankState();
  return {
    SHAMCASH: state.shamcashAddress || DEFAULT_SHAMCASH,
    SYRIATEL_CASH: state.syriatelCashAddress || DEFAULT_SYRIATEL_CASH,
    MTN_CASH: state.mtnCashAddress || DEFAULT_MTN_CASH,
  };
}

export async function setPaymentAddresses(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = paymentAddressesSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      state.shamcashAddress = parsed.data.SHAMCASH;
      state.syriatelCashAddress = parsed.data.SYRIATEL_CASH;
      state.mtnCashAddress = parsed.data.MTN_CASH;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export type OffersTicker = { text: string; textAr: string };

/** v31: hero slide 3 — the four flagship games, each with its live store artwork when listed. */
export type FlagshipGame = { key: string; slug: string | null; name: string; nameAr: string; imageUrl: string };

const FLAGSHIPS: Array<{ key: string; name: string; nameAr: string; match: RegExp; fallback: string }> = [
  { key: "pubg", name: "PUBG Mobile", nameAr: "ببجي موبايل", match: /pubg|ببجي/i, fallback: coverFor("pubgmobile.com") },
  { key: "freefire", name: "Free Fire", nameAr: "فري فاير", match: /free[\s-]*fire|فري\s*فاير/i, fallback: coverFor("ff.garena.com") },
  { key: "genshin", name: "Genshin Impact", nameAr: "جينشن إمباكت", match: /genshin|جينشن/i, fallback: coverFor("genshin.hoyoverse.com") },
  { key: "jawaker", name: "Jawaker", nameAr: "جواكر", match: /jawaker|جواكر/i, fallback: coverFor("jawaker.com") },
];

export async function getFlagshipGames(): Promise<FlagshipGame[]> {
  await ensureReady();
  const services = (memory ?? blankState()).services;
  return FLAGSHIPS.map((game) => {
    const service = services.find((item) => game.match.test(item.slug) || game.match.test(item.name) || game.match.test(item.nameAr ?? ""));
    const photo = service?.imageUrl && /^(https:\/\/|data:image\/)/.test(service.imageUrl) ? service.imageUrl : "";
    return {
      key: game.key,
      slug: service?.slug ?? null,
      name: game.name,
      nameAr: game.nameAr,
      imageUrl: photo || game.fallback,
    };
  });
}

export async function getHeroBanners(): Promise<string[]> {
  await ensureReady();
  return [...((memory ?? blankState()).heroBanners ?? [])];
}

export async function setHeroBanners(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = heroBannersSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      state.heroBanners = parsed.data.banners;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** Plain status for the admin badge. Never throws, never blocks. */
export function getDatabaseStatus(): { online: boolean; detail: string } {
  if (!supabaseEnv().enabled) return { online: false, detail: "Supabase env vars are not set." };
  const online = mode !== "local" || catalogMode === "ok";
  return { online, detail: modeDetail };
}

export async function getOffersTicker(): Promise<OffersTicker> {
  await ensureReady();
  const state = memory ?? blankState();
  return {
    text: state.offersTickerText || DEFAULT_TICKER_EN,
    textAr: state.offersTickerTextAr || DEFAULT_TICKER_AR,
  };
}

export async function setOffersTicker(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = tickerSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      state.offersTickerText = parsed.data.text;
      state.offersTickerTextAr = parsed.data.textAr;
      state.offersTickerUpdatedAt = new Date().toISOString();
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function getSypRate(): Promise<number> {
  await ensureReady();
  return (memory ?? blankState()).sypRate || DEFAULT_SYP_RATE_VALUE;
}

export async function setSypRate(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = sypRateSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      state.sypRate = Math.round(parsed.data.rate * 100) / 100;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function setVipProfitMargin(input: unknown): Promise<Ok<{ profile: Profile }> | Err> {
  const parsed = vipMarginSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const profile = await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      if (user.role !== "VIP") throw new Error("The profit margin is for VIP accounts only.");
      user.vipProfitMargin = clampMargin(parsed.data.margin);
      return { state, result: toProfile(user) };
    });
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function listMyTransactions(): Promise<WalletTxn[]> {
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  if (!user) return [];
  return state.transactions
    .filter((txn) => txn.userId === user.id)
    .map((txn) => ({ id: txn.id, kind: txn.kind, cents: txn.cents, note: txn.note, createdAt: txn.createdAt }));
}

/** Real average approval time of recent ShamCash requests (admin credits excluded). Public. */
export async function getTopupTiming(): Promise<TopupTiming> {
  await ensureReady();
  const state = memory ?? blankState();
  const samples = state.balanceRequests
    .filter((item) => item.status === "APPROVED" && item.resolvedAt && !item.referenceNote.startsWith("Admin credit"))
    .slice(0, 20)
    .map((item) => (Date.parse(item.resolvedAt as string) - Date.parse(item.createdAt)) / 60_000)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0 && minutes < 24 * 60);
  return {
    averageMinutes: samples.length >= 3 ? samples.reduce((sum, value) => sum + value, 0) / samples.length : null,
    fallbackMinutes: state.avgTopupMinutes || 3,
    sampleSize: samples.length,
  };
}

export async function setAvgTopupMinutes(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = avgTopupSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      state.avgTopupMinutes = parsed.data.minutes;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** Admin-only full user inspector. Passwords are stored as one-way hashes and are never returned. */
export async function getUserDossier(input: unknown): Promise<Ok<{ dossier: UserDossier }> | Err> {
  const parsed = userIdSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await ensureReady();
    const state = memory ?? blankState();
    requireAdmin(requireUser(await currentUser(state)));
    const user = state.users.find((item) => item.id === parsed.data.userId);
    if (!user) throw new Error("User not found.");
    return {
      ok: true,
      dossier: {
        user: {
          authProvider: user.authProvider === "google" ? "google" : "email",
          emailVerified: user.emailVerified === true || user.authProvider === "google",
          honeypotFlagged: user.honeypotFlagged === true,
          lastCountry: user.lastCountry ?? null,
          userId: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          role: user.role,
          currency: asCurrency(user.currency),
          balanceCents: user.balanceCents,
          lastIp: user.lastIp,
          lastSeenAt: user.lastSeenAt,
          isBlocked: user.isBlocked,
          phone: user.phone ?? "",
          createdAt: user.createdAt,
          hasPassword: Boolean(user.passwordHash),
          vipProfitMargin: clampMargin(user.vipProfitMargin),
        },
        orders: state.orders
          .filter((order) => order.userId === user.id)
          .map((order) => ({ ...mapOrder(order), ipAddress: order.ipAddress ?? null })),
        requests: state.balanceRequests.filter((item) => item.userId === user.id).map(mapRequest),
      },
    };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/* ------------------------------------------------------------------ */
/* Support center: tickets live in the shared state row, so they sync */
/* to every device through the same online persistence as orders.     */
/* ------------------------------------------------------------------ */

const MAX_TICKETS = 500;
const MAX_MESSAGES = 200;

function cloneTicket(ticket: SupportTicket): SupportTicket {
  return { ...ticket, messages: ticket.messages.map((message) => ({ ...message })) };
}

export async function listMySupportTickets(): Promise<SupportTicket[]> {
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  if (!user) return [];
  return (state.supportTickets ?? []).filter((ticket) => ticket.userId === user.id && !ticket.hiddenForUser).map(cloneTicket);
}

/** User sends a message: appends to `ticketId`, or opens a new ticket with `subject`. */
const AUTO_REPLY = {
  ar: "أهلاً بك في مركز دعم زوفا شارج — تم استلام رسالتك بنجاح! فريق الدعم الفني متواجد الآن وجاهز لمساعدتك، سيتم الرد عليك خلال ثوانٍ معدودة.",
  en: "Welcome to ZovaCharge Live Support — we received your message! Our support team is online and ready to help, an agent will reply to you within seconds.",
};

/** Seconds left before this sender may post again (15 s between support messages). */
function supportWait(messages: Array<{ sender: string; createdAt: string }>): number {
  const last = Math.max(0, ...messages.filter((message) => message.sender === "USER").map((message) => Date.parse(message.createdAt) || 0));
  return Math.ceil((last + 15_000 - Date.now()) / 1000);
}
function supportWaitError(wait: number): string {
  return `⏳ انتظر ${wait} ثانية لإرسال رسالة جديدة... · Wait ${wait}s before sending another message...`;
}

/** v26: recovery tickets get an ownership-check reply instead of the generic welcome. */
const RECOVERY_AUTO_REPLY = {
  ar: "أهلاً بك في قسم استعادة الحسابات الآمن 🔒 تم استلام بريدك ورقم هاتفك. لإتمام التحقق من ملكيتك للحساب وإعادة تعيين كلمة المرور فوراً، يرجى إرسال معلومتين على الأقل مما يلي في هذه المحادثة:\n• الاسم الكامل المسجل في الحساب\n• الرصيد التقريبي الحالي في محفظتك\n• آخر عملية شحن للمحفظة أو آخر لعبة/خدمة قمت بشرائها\n• أو إرفاق صورة لآخر إشعار تحويل قمت به عبر زر الكاميرا (📷) بالأسفل.",
  en: "Welcome to ZovaCharge Account Recovery 🔒 We received your email and phone number. To verify account ownership and reset your password immediately, please reply with at least two of the following:\n• Full Name on the account\n• Approximate current wallet balance\n• Your last wallet top-up or last game/service purchased\n• Or attach a screenshot of your last payment transfer using the camera (📷) button below.",
};

export async function sendSupportMessage(input: unknown): Promise<Ok<{ ticket: SupportTicket }> | Err> {
  const parsed = supportMessageSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  let userMessageId = "";
  try {
    const ticket = await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      if (user.isBlocked) throw new Error("This account is blocked.");
      state.supportTickets = state.supportTickets ?? [];
      // 15 s between a customer's support messages (all their tickets); admins exempt.
      if (user.role !== "ADMIN") {
        const wait = supportWait(state.supportTickets.filter((item) => item.userId === user.id).flatMap((item) => item.messages));
        if (wait > 0) throw new Error(supportWaitError(wait));
      }
      const now = new Date().toISOString();
      let target = parsed.data.ticketId
        ? state.supportTickets.find((item) => item.id === parsed.data.ticketId && item.userId === user.id && !item.hiddenForUser)
        : undefined;
      if (!target) {
        const taken = new Set(state.supportTickets.map((item) => item.ticketNumber));
        let ticketNumber = "";
        do {
          ticketNumber = `TKT-${100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)}`;
        } while (taken.has(ticketNumber));
        target = {
          id: randomId("tkt"),
          ticketNumber,
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          subject: parsed.data.subject?.trim() || "General",
          status: "OPEN",
          messages: [],
          unreadByAdmin: true,
          unreadByUser: false,
          createdAt: now,
          updatedAt: now,
        };
        state.supportTickets.unshift(target);
        state.supportTickets = state.supportTickets.slice(0, MAX_TICKETS);
      }
      userMessageId = randomId("msg");
      const firstMessage = !target.messages.some((message) => message.sender === "USER");
      target.messages.push({ id: userMessageId, sender: "USER", text: parsed.data.text, createdAt: now, ...(parsed.data.imageId ? { imageId: parsed.data.imageId } : {}) });
      // Instant reassurance on a new conversation. It is NOT a human answer: status stays OPEN
      // and the admin is still alerted that a customer is waiting.
      if (firstMessage) {
        target.messages.push({
          id: randomId("msg"),
          sender: "ADMIN",
          isAutoReply: true,
          text: parsed.data.language === "en" ? AUTO_REPLY.en : AUTO_REPLY.ar,
          createdAt: new Date(Date.parse(now) + 600).toISOString(),
        });
      }
      target.messages = target.messages.slice(-MAX_MESSAGES);
      target.status = "OPEN";
      target.unreadByAdmin = true;
      target.updatedAt = now;
      return { state, result: cloneTicket(target) };
    });
    notifyAdmins({ kind: "support", id: ticket.id, messageId: userMessageId });
    return { ok: true, ticket };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** Marks a ticket as read for whoever is looking at it (user or admin). */
export async function markSupportRead(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = ticketIdSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  await ensureReady();
  const snapshot = memory ?? blankState();
  const viewer = await currentUser(snapshot);
  const found = (snapshot.supportTickets ?? []).find((item) => item.id === parsed.data.ticketId);
  if (!viewer || !found) return { ok: true };
  const asAdmin = viewer.role === "ADMIN";
  if (asAdmin ? !found.unreadByAdmin : found.userId !== viewer.id || !found.unreadByUser) return { ok: true };
  try {
    await commit(async (state) => {
      const ticket = (state.supportTickets ?? []).find((item) => item.id === parsed.data.ticketId);
      if (ticket) {
        if (asAdmin) ticket.unreadByAdmin = false;
        else ticket.unreadByUser = false;
      }
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function listSupportTickets(): Promise<Ok<{ tickets: SupportTicket[] }> | Err> {
  try {
    await ensureReady();
    const state = memory ?? blankState();
    requireAdmin(requireUser(await currentUser(state)));
    const tickets = [...(state.supportTickets ?? [])]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .map(cloneTicket);
    return { ok: true, tickets };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function replyToSupportTicket(input: unknown): Promise<Ok<{ ticket: SupportTicket }> | Err> {
  const parsed = supportReplySchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const ticket = await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const target = (state.supportTickets ?? []).find((item) => item.id === parsed.data.ticketId);
      if (!target) throw new Error("Ticket not found.");
      const now = new Date().toISOString();
      target.messages.push({ id: randomId("msg"), sender: "ADMIN", text: parsed.data.text, createdAt: now, ...(parsed.data.imageId ? { imageId: parsed.data.imageId } : {}) });
      target.messages = target.messages.slice(-MAX_MESSAGES);
      target.status = "ANSWERED";
      target.unreadByAdmin = false;
      target.unreadByUser = true;
      target.updatedAt = now;
      return { state, result: cloneTicket(target) };
    });
    return { ok: true, ticket };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function setSupportTicketStatus(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = supportStatusSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const target = (state.supportTickets ?? []).find((item) => item.id === parsed.data.ticketId);
      if (!target) throw new Error("Ticket not found.");
      target.status = parsed.data.status;
      target.updatedAt = new Date().toISOString();
      if (parsed.data.status === "CLOSED") {
        target.hiddenForUser = true; // gone from the user's screen…
        target.closedAt = target.updatedAt; // …kept forever in the admin archive
      } else {
        target.hiddenForUser = false;
        target.closedAt = undefined;
      }
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/* ------------------------- admin: orders, manual queue, balances, passwords ------------------------- */

function adminOrderOf(state: NovaState, order: StoredOrder): AdminOrder & { email: string; phone: string; resolvedAt: string | null } {
  const user = state.users.find((item) => item.id === order.userId);
  return {
    ...mapOrder(order),
    userName: user?.name ?? "Unknown",
    username: user?.username ?? "unknown",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    ipAddress: order.ipAddress,
    resolvedAt: order.resolvedAt ?? null,
  };
}

/** Every order (newest first) for the admin's searchable tables. */
export async function listAdminOrders(): Promise<Ok<{ orders: Array<ReturnType<typeof adminOrderOf>> }> | Err> {
  try {
    await ensureReady();
    const state = memory ?? blankState();
    requireAdmin(requireUser(await currentUser(state)));
    return { ok: true, orders: state.orders.map((order) => adminOrderOf(state, order)) };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** Accept a manual order (COMPLETED) or decline it and refund the full price to the wallet. */
export async function resolveManualOrder(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = manualDecisionSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const order = state.orders.find((item) => item.id === parsed.data.orderId);
      if (!order) throw new Error("Order not found.");
      if (order.status !== "PENDING_MANUAL" && order.status !== "PENDING_VAULT") throw new Error("This order was already handled.");
      order.resolvedAt = new Date().toISOString();
      if (parsed.data.action === "ACCEPT") {
        order.status = "COMPLETED";
      } else {
        order.status = "DECLINED";
        // v35: automatic refund of the exact price, guarded against a second refund.
        refundOrder(state, order, `Refund ${order.receiptNumber ?? ""} · ${order.serviceName}`);
      }
      return { state, result: undefined };
    });
    notifyAdmins({ kind: "order_result", id: parsed.data.orderId });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** Admin balance editor: set the exact balance, add, or deduct. Logged as a wallet transaction. */
export async function adjustUserBalance(input: unknown): Promise<Ok<{ balanceCents: number }> | Err> {
  const parsed = balanceEditSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const balanceCents = await commit(async (state) => {
      const actor = requireUser(await currentUser(state));
      requireAdmin(actor);
      const target = state.users.find((item) => item.id === parsed.data.userId);
      if (!target) throw new Error("User not found.");
      const cap = balanceCap(asCurrency(target.currency));
      const before = target.balanceCents;
      const after =
        parsed.data.mode === "SET"
          ? parsed.data.cents
          : parsed.data.mode === "ADD"
            ? before + parsed.data.cents
            : before - parsed.data.cents;
      if (after < 0) throw new Error("The balance cannot go below zero.");
      target.balanceCents = Math.min(cap, after);
      const delta = target.balanceCents - before;
      if (delta !== 0) {
        pushTxn(state, {
          userId: target.id,
          kind: delta > 0 ? "admin_topup" : "refund",
          cents: delta,
          note: `Admin ${parsed.data.mode.toLowerCase()} by ${actor.username}${parsed.data.reason ? ` · ${parsed.data.reason}` : ""}`,
        });
      }
      return { state, result: target.balanceCents };
    });
    return { ok: true, balanceCents };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export function setUserExactBalance(userId: string, newBalanceCents: number, reason?: string) {
  return adjustUserBalance({ userId, mode: "SET", cents: newBalanceCents, reason: reason ?? "" });
}

/** Admin sets a new password for a user (stored hashed) and signs them out everywhere. */
export async function adminSetUserPassword(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = adminPasswordSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const hashed = await hashPassword(parsed.data.password);
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const target = state.users.find((item) => item.id === parsed.data.userId);
      if (!target) throw new Error("User not found.");
      target.passwordHash = hashed.passwordHash;
      target.passwordSalt = hashed.passwordSalt;
      // A new password from the admin (account recovery) also lifts the 3-strike lock.
      target.isLocked = false;
      target.failedLoginAttempts = 0;
      state.sessions = state.sessions.filter((session) => session.userId !== target.id);
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** Save (or clear with null) the user's one saved player ID for a service. */
export async function setSavedPlayerId(input: unknown): Promise<Ok<{ profile: Profile }> | Err> {
  const parsed = savedIdSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const profile = await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      const next = { ...(user.savedPlayerIds ?? {}) };
      if (parsed.data.playerId) next[parsed.data.slug] = parsed.data.playerId;
      else delete next[parsed.data.slug];
      user.savedPlayerIds = next;
      return { state, result: toProfile(user) };
    });
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** After the server hands over a vault piece, mark the buyer's own order delivered. */
export async function markVaultDelivered(orderId: string): Promise<void> {
  try {
    await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      const order = state.orders.find((item) => item.id === orderId && item.userId === user.id);
      if (order && order.status === "PENDING_VAULT") {
        order.status = "delivered";
        order.resolvedAt = new Date().toISOString();
      }
      return { state, result: undefined };
    });
  } catch {
    /* cosmetic status only */
  }
}

/* ------------------------------ service groups ------------------------------ */

export async function getServiceGroups(): Promise<ServiceGroup[]> {
  await ensureReady();
  return [...((memory ?? blankState()).serviceGroups ?? DEFAULT_GROUPS)].sort((a, b) => a.order - b.order);
}

/** Admin: replace the group list (built-in groups can't be removed). */
export async function saveServiceGroups(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = serviceGroupsSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const next: ServiceGroup[] = parsed.data.groups.map((group, index) => ({
        ...group,
        order: index,
        builtIn: DEFAULT_GROUPS.some((item) => item.id === group.id),
      }));
      for (const builtIn of DEFAULT_GROUPS) {
        if (!next.some((group) => group.id === builtIn.id)) throw new Error("Built-in groups can be renamed but not deleted.");
      }
      // Services pointing at a deleted custom group fall back to their category group.
      const ids = new Set(next.map((group) => group.id));
      for (const service of state.services) if (service.groupId && !ids.has(service.groupId)) service.groupId = undefined;
      state.serviceGroups = next;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/* ------------------------------ 5-day notification feed ------------------------------ */

export const FEED_DAYS = 5;

/** The signed-in user's own top-ups and orders, plus the current offers, from the last 5 days only. */
export async function listMyFeed(language: "ar" | "en" = "ar"): Promise<FeedItem[]> {
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  const cutoff = Date.now() - FEED_DAYS * 24 * 60 * 60 * 1000;
  const fresh = (iso?: string | null) => Boolean(iso) && Date.parse(iso as string) >= cutoff;
  const ar = language === "ar";
  const items: FeedItem[] = [];
  if (user) {
    for (const item of state.balanceRequests) {
      if (item.userId !== user.id) continue;
      const stamp = item.resolvedAt ?? item.createdAt;
      if (!fresh(stamp)) continue;
      const ok = item.status === "APPROVED";
      const pending = item.status === "PROCESSING";
      items.push({
        id: `req-${item.id}`,
        kind: "topup",
        title: pending ? (ar ? "⏳ طلب شحن المحفظة قيد المراجعة" : "⏳ Wallet top-up under review") : ok ? (ar ? "تمت الموافقة وإضافة الرصيد" : "Top-up approved") : ar ? "تم رفض طلب الشحن" : "Top-up rejected",
        body: `${(item.cents / 100).toFixed(2)} ${item.currency === "SYP" ? "SYP" : "USD"}`,
        status: item.status,
        receiptNumber: item.receiptNumber ?? "",
        createdAt: stamp,
      });
    }
    for (const order of state.orders) {
      if (order.userId !== user.id) continue;
      const stamp = order.resolvedAt ?? order.createdAt;
      if (!fresh(stamp)) continue;
      const title =
        order.status === "PENDING_MANUAL"
          ? ar ? "⏳ طلبك بانتظار فريقنا" : "⏳ Order waiting for our team"
          : order.status === "DECLINED"
            ? ar ? "تم رفض الطلب وإعادة الرصيد" : "Order declined, refunded"
            : ar ? "تم تنفيذ طلب الشحن" : "Order completed";
      items.push({
        id: `ord-${order.id}`,
        kind: "order",
        title,
        body: `${order.serviceName} · ${order.packageName}`,
        status: order.status,
        receiptNumber: order.receiptNumber ?? order.fulfillmentRef,
        createdAt: stamp,
      });
    }
  }
  if (fresh(state.offersTickerUpdatedAt)) {
    items.push({
      id: "offer-current",
      kind: "offer",
      title: ar ? "عروضنا الجديدة" : "New offers",
      body: ((ar ? state.offersTickerTextAr : state.offersTickerText) ?? "").split("|")[0]?.trim() ?? "",
      status: "",
      receiptNumber: "",
      createdAt: state.offersTickerUpdatedAt as string,
    });
  }
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/* ============================ Google sign-in (Supabase OAuth) ============================ */

/**
 * Sends the browser to Google through Supabase Auth. Requires the Google provider to be enabled in
 * Supabase (Authentication → Providers → Google) and this site's /login URL in the redirect allow-list.
 */
export async function startGoogleSignIn(): Promise<{ ok: true } | Err> {
  const client = getSupabase();
  if (!client || typeof window === "undefined") return { ok: false, error: "Google sign-in needs Supabase to be configured on this site." };
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/login?oauth=google`, queryParams: { prompt: "select_account" } },
  });
  if (error) {
    const message = /not enabled|unsupported provider/i.test(error.message)
      ? "Google sign-in isn't enabled yet (Supabase → Authentication → Providers → Google)."
      : error.message;
    return { ok: false, error: message };
  }
  return { ok: true };
}

function uniqueUsername(state: NovaState, email: string): string {
  const base = (email.split("@")[0] ?? "user").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16) || "user";
  let candidate = base;
  let attempt = 1;
  while (usernameTaken(state, candidate)) {
    attempt += 1;
    candidate = `${base}${attempt}`;
  }
  return candidate;
}

/**
 * Finishes Google sign-in on /login?oauth=google: Supabase verifies the access token, then the
 * matching ZovaCharge account is opened (or created). Supabase's own session is not kept.
 */
export async function completeGoogleSignIn(): Promise<Ok<{ profile: Profile; isNew: boolean }> | Err> {
  const client = getSupabase();
  if (!client || typeof window === "undefined") return { ok: false, error: "Google sign-in needs Supabase to be configured." };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const oauthError = hash.get("error_description") ?? new URLSearchParams(window.location.search).get("error_description");
  window.history.replaceState(null, "", window.location.pathname); // never leave tokens in the address bar
  if (!accessToken) return { ok: false, error: oauthError ?? "Google sign-in was cancelled." };
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user?.email) return { ok: false, error: "Google sign-in could not be verified. Please try again." };
  const email = data.user.email.toLowerCase();
  // v35: the owner keeps this Supabase session (auto-refreshed) — it is what SQL part 9 trusts for
  // money / price changes and what /api/admin-backup checks. Customers never keep one.
  if (isAdminEmail(email)) {
    const refreshToken = hash.get("refresh_token") ?? "";
    if (refreshToken) {
      await withTimeout(client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }), 5000).catch(() => undefined);
    }
    guardState = "unknown";
  }
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = String(meta.full_name ?? meta.name ?? email.split("@")[0]).slice(0, 60);
  const avatar = typeof meta.avatar_url === "string" ? meta.avatar_url : "";
  let isNew = false;
  try {
    const ip = await quickIp();
    await commit(async (state) => {
      let user = state.users.find((item) => item.email.toLowerCase() === email);
      if (user?.isBlocked) throw new Error("This account is blocked.");
      const now = new Date().toISOString();
      if (!user) {
        isNew = true;
        // Random password nobody knows: this account signs in with Google (or after an admin-set password).
        const hashed = await hashPassword(hex(crypto.getRandomValues(new Uint8Array(24))));
        const admin = isAdminEmail(email);
        user = {
          authProvider: "google",
          emailVerified: true,
          id: admin ? ADMIN_USER_ID : randomId("usr"),
          name: fullName,
          username: uniqueUsername(state, email),
          email,
          phone: "",
          avatarUrl: avatar,
          passwordHash: hashed.passwordHash,
          passwordSalt: hashed.passwordSalt,
          role: admin ? "ADMIN" : "NORMAL",
          currency: "USD",
          balanceCents: admin ? ADMIN_BALANCE_CENTS : 0,
          isBlocked: false,
          lastIp: ip || null,
          lastCountry: cachedCountry || null,
          lastSeenAt: now,
          createdAt: now,
        };
        state.users.push(user);
      } else {
        if (!user.avatarUrl && avatar) user.avatarUrl = avatar;
        // v35: Google has proven this email — the account counts as verified, no 6-digit code.
        if (!user.emailVerified) user.emailVerified = true;
        if (ip) user.lastIp = ip;
        if (cachedCountry) user.lastCountry = cachedCountry;
        user.lastSeenAt = now;
        if (isAdminEmail(user.email)) user.role = "ADMIN";
      }
      // The same lock and daily limit apply to Google sign-in.
      const text = LOGIN_TEXT[document.documentElement.lang === "en" ? "en" : "ar"];
      if (user.role !== "ADMIN" && user.isLocked) throw new Error(text.locked);
      const daily = countDailyLogin(user, text);
      if (daily) throw new Error(daily);
      const issued = await openSession(state, user.id);
      writeToken(issued);
      return { state, result: issued };
    });
    notifyAuth();
    const profile = await readProfile();
    if (!profile) return { ok: false, error: "Signed in, but the profile could not be read." };
    return { ok: true, profile, isNew };
  } catch (caught) {
    return { ok: false, error: fail(caught) };
  }
}

/** Google accounts: add the Syrian mobile number, confirm 18+ and the terms, pick the wallet currency. */
export async function completeProfile(input: unknown): Promise<Ok<{ profile: Profile }> | Err> {
  const parsed = completeProfileSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const profile = await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      user.name = parsed.data.name;
      user.phone = formatSyMobile(parsed.data.phone);
      // Currency is only chosen while the wallet is still empty.
      if (user.balanceCents === 0 && user.role !== "ADMIN") user.currency = parsed.data.currency;
      return { state, result: toProfile(user) };
    });
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** User ends their chat: it closes, disappears from their screen, and stays in the admin archive. */
export async function closeMyTicket(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = ticketIdSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      const ticket = (state.supportTickets ?? []).find((item) => item.id === parsed.data.ticketId && item.userId === user.id);
      if (!ticket) throw new Error("Ticket not found.");
      const now = new Date().toISOString();
      ticket.status = "CLOSED";
      ticket.hiddenForUser = true;
      ticket.closedAt = now;
      ticket.updatedAt = now;
      ticket.unreadByUser = false;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/* ------------------------------ service visit analytics ------------------------------ */

const visitBuffer = new Map<string, number>();
let visitTimer: number | null = null;

/** Counts a service-page open. Batched and flushed quietly every ~15 s (one save, not one per click). */
export function recordServiceVisit(slug: string): void {
  if (typeof window === "undefined" || !slug) return;
  visitBuffer.set(slug, (visitBuffer.get(slug) ?? 0) + 1);
  if (visitTimer !== null) return;
  visitTimer = window.setTimeout(() => {
    visitTimer = null;
    const batch = new Map(visitBuffer);
    visitBuffer.clear();
    void commit(async (state) => {
      const visits = { ...(state.serviceVisits ?? {}) };
      batch.forEach((count, key) => {
        visits[key] = (visits[key] ?? 0) + count;
      });
      state.serviceVisits = visits;
      return { state, result: undefined };
    }).catch(() => undefined);
  }, 15_000);
}

export async function getServiceVisits(): Promise<Record<string, number>> {
  await ensureReady();
  return { ...((memory ?? blankState()).serviceVisits ?? {}) };
}

/* ------------------------------ stuck automatic orders ------------------------------ */

const STUCK_STATUSES = new Set(["processing", "PROCESSING", "PENDING", "pending"]);
export function isStuckStatus(status: string): boolean {
  return STUCK_STATUSES.has(status);
}

/**
 * Admin: cancel (and refund) or delete an automatic order stuck in processing.
 * Runs inside the store queue, so it sees the latest status: if the provider already completed
 * the order, the request is refused. The delivery handler re-checks the status before marking
 * an order delivered, so a late provider answer can never overwrite the cancellation.
 */
export async function cancelOrDeleteStuckOrder(orderId: string, mode: "CANCEL_AND_REFUND" | "DELETE_RECORD"): Promise<{ ok: true } | Err> {
  try {
    await commit(async (state) => {
      const actor = requireUser(await currentUser(state));
      requireAdmin(actor);
      const index = state.orders.findIndex((item) => item.id === orderId);
      if (index < 0) throw new Error("Order not found.");
      const order = state.orders[index];
      if (!isStuckStatus(order.status)) {
        throw new Error(
          order.status === "delivered" || order.status === "COMPLETED"
            ? "تم اكتمال الطلب تلقائياً عبر الـ API قبل الإلغاء · The order was completed by the API before it could be cancelled."
            : "This order is no longer processing.",
        );
      }
      refundOrder(state, order, `Refund ${order.receiptNumber ?? ""} · ${order.serviceName} (cancelled by admin)`);
      if (mode === "DELETE_RECORD") {
        state.orders.splice(index, 1);
      } else {
        order.status = "CANCELLED_BY_ADMIN";
        order.resolvedAt = new Date().toISOString();
      }
      return { state, result: undefined };
    });
    if (mode === "CANCEL_AND_REFUND") notifyAdmins({ kind: "order_result", id: orderId });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** Remember that this user enabled device notifications (no-op if already set). */
export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  try {
    await ensureReady();
    const state = memory ?? blankState();
    const user = await currentUser(state);
    if (!user || (user.notificationsEnabled === true) === enabled) return;
    await commit(async (draft) => {
      const target = requireUser(await currentUser(draft));
      target.notificationsEnabled = enabled;
      return { state: draft, result: undefined };
    });
  } catch {
    /* best effort */
  }
}

/* ------------------------------ v25: password recovery via guest live support ------------------------------ */

const GUEST_TICKET_KEY = "zovacharge_guest_ticket";
type GuestSession = { ticketId: string; guestKey: string };

function readGuestSession(): GuestSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GUEST_TICKET_KEY) ?? "null") as GuestSession | null;
    return parsed && typeof parsed.ticketId === "string" && typeof parsed.guestKey === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeGuestSession(session: GuestSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) window.localStorage.setItem(GUEST_TICKET_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(GUEST_TICKET_KEY);
  } catch {
    /* private mode */
  }
}

function findGuestTicket(state: NovaState, session: GuestSession | null): SupportTicket | undefined {
  if (!session) return undefined;
  return (state.supportTickets ?? []).find((ticket) => ticket.id === session.ticketId && ticket.guest === true && ticket.guestKey === session.guestKey);
}

/**
 * Forgot password → opens a high-priority "Password Recovery" ticket WITHOUT a session.
 * The guest keeps a private key in this browser so only they can continue the chat.
 * No email is sent and no code exists: the admin verifies the person in chat, then sets a
 * new password from the user dossier.
 */
export async function openGuestRecoveryTicket(input: { email: string; phone: string; language: "ar" | "en" }): Promise<Ok<{ ticket: SupportTicket }> | Err> {
  const parsed = resetRequestSchema.safeParse({ email: input.email });
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const email = parsed.data.email;
  // v26: the linked mobile number is mandatory for recovery.
  const phone = formatSyMobile(input.phone ?? "");
  if (!SY_MOBILE.test(phone)) return { ok: false, error: "Enter the mobile number linked to the account (09XX-XXX-XXX)." };
  let messageId = "";
  try {
    const ticket = await commit(async (state) => {
      state.supportTickets = state.supportTickets ?? [];
      // Same browser asking again within 10 minutes → reuse the open ticket instead of spamming.
      const existing = findGuestTicket(state, readGuestSession());
      if (existing && existing.status !== "CLOSED" && existing.userEmail === email) {
        return { state, result: cloneTicket(existing) };
      }
      const known = state.users.find((user) => user.email.toLowerCase() === email);
      const now = new Date().toISOString();
      const taken = new Set(state.supportTickets.map((item) => item.ticketNumber));
      let ticketNumber = "";
      do {
        ticketNumber = `TKT-${100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)}`;
      } while (taken.has(ticketNumber));
      const guestKey = randomId("gk") + randomId("gk");
      messageId = randomId("msg");
      const ar = input.language !== "en";
      const target: SupportTicket = {
        id: randomId("tkt"),
        ticketNumber,
        userId: known?.id ?? "guest",
        userName: known?.name ?? email.split("@")[0] ?? "Guest",
        userEmail: email,
        subject: "🔑 استعادة كلمة المرور / Password Recovery",
        category: "PASSWORD_RECOVERY",
        guest: true,
        guestKey,
        contactPhone: phone,
        status: "OPEN",
        messages: [
          {
            id: messageId,
            sender: "USER",
            text: ar
              ? `طلب استعادة كلمة المرور للحساب: ${email} — الهاتف: ${phone}${known ? "" : " (لا يوجد حساب بهذا البريد)"}`
              : `Password recovery request for: ${email} — phone: ${phone}${known ? "" : " (no account with this email)"}`,
            createdAt: now,
          },
          {
            id: randomId("msg"),
            sender: "ADMIN",
            isAutoReply: true,
            text: ar ? RECOVERY_AUTO_REPLY.ar : RECOVERY_AUTO_REPLY.en,
            createdAt: new Date(Date.parse(now) + 600).toISOString(),
          },
        ],
        unreadByAdmin: true,
        unreadByUser: false,
        createdAt: now,
        updatedAt: now,
      };
      state.supportTickets.unshift(target);
      state.supportTickets = state.supportTickets.slice(0, MAX_TICKETS);
      writeGuestSession({ ticketId: target.id, guestKey });
      return { state, result: cloneTicket(target) };
    });
    if (messageId) notifyAdmins({ kind: "recovery", id: ticket.id, messageId });
    return { ok: true, ticket };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** The guest's own recovery chat in this browser (null when none, or once it was closed). */
export async function getGuestTicket(): Promise<SupportTicket | null> {
  const session = readGuestSession();
  if (!session) return null;
  await ensureReady();
  const found = findGuestTicket(memory ?? blankState(), session);
  if (!found || found.hiddenForUser) {
    if (memory) writeGuestSession(null);
    return null;
  }
  return cloneTicket(found);
}

export function hasGuestTicket(): boolean {
  return readGuestSession() !== null;
}

export async function sendGuestSupportMessage(text: string, imageId?: string): Promise<Ok<{ ticket: SupportTicket }> | Err> {
  const clean = text.trim().slice(0, 1000);
  const image = imageId && /^[0-9a-f-]{36}$/i.test(imageId) ? imageId : undefined;
  if (!clean && !image) return { ok: false, error: "Write a message or attach a photo first." };
  const session = readGuestSession();
  let messageId = "";
  try {
    const ticket = await commit(async (state) => {
      const target = findGuestTicket(state, session);
      if (!target || target.status === "CLOSED") throw new Error("This conversation has ended. Start a new recovery request.");
      const wait = supportWait(target.messages);
      if (wait > 0) throw new Error(supportWaitError(wait));
      const now = new Date().toISOString();
      messageId = randomId("msg");
      target.messages.push({ id: messageId, sender: "USER", text: clean, createdAt: now, ...(image ? { imageId: image } : {}) });
      target.messages = target.messages.slice(-MAX_MESSAGES);
      target.status = "OPEN";
      target.unreadByAdmin = true;
      target.unreadByUser = false;
      target.updatedAt = now;
      return { state, result: cloneTicket(target) };
    });
    notifyAdmins({ kind: "recovery", id: ticket.id, messageId });
    return { ok: true, ticket };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/* ------------------------------ v26: support chat photos (server-only storage) ------------------------------ */

async function supportImageRequest(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; id?: string; data?: string }> {
  try {
    const response = await fetch("/api/support-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, token: readToken(), guestKey: readGuestSession()?.guestKey }),
    });
    return (await response.json().catch(() => ({ ok: false, error: `Server answered ${response.status}.` }))) as { ok: boolean; error?: string; id?: string; data?: string };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

/**
 * Uploads an already-compressed photo (data URL, < ~120 KB) and returns its private id.
 * Waits for pending saves first so a ticket created a moment ago is visible to the server.
 */
export async function uploadSupportImage(dataUrl: string, ticketId?: string): Promise<Ok<{ id: string }> | Err> {
  await whenSynced();
  const result = await supportImageRequest({ action: "upload", data: dataUrl, ticketId: ticketId ?? readGuestSession()?.ticketId });
  if (!result.ok || !result.id) return { ok: false, error: result.error ?? "Could not upload the photo." };
  imageCache.set(result.id, Promise.resolve(dataUrl));
  return { ok: true, id: result.id };
}

const imageCache = new Map<string, Promise<string | null>>();

/** Resolves a chat photo id to a displayable data URL (cached per page load). */
export function loadSupportImage(id: string): Promise<string | null> {
  const cached = imageCache.get(id);
  if (cached) return cached;
  const pending = supportImageRequest({ action: "get", id }).then((result) => (result.ok && result.data ? result.data : null));
  imageCache.set(id, pending);
  void pending.then((value) => {
    if (value === null) imageCache.delete(id); // let a later render retry
  });
  return pending;
}

/** Guest ends the chat: hidden from their screen, kept forever in the admin archive. */
export async function endGuestTicket(): Promise<void> {
  const session = readGuestSession();
  writeGuestSession(null);
  if (!session) return;
  try {
    await commit(async (state) => {
      const target = findGuestTicket(state, session);
      if (target) {
        const now = new Date().toISOString();
        target.status = "CLOSED";
        target.hiddenForUser = true;
        target.closedAt = now;
        target.updatedAt = now;
      }
      return { state, result: undefined };
    });
  } catch {
    /* best effort */
  }
}

export const seededServiceCount = SEED_SERVICES.length;
export const seededPackageCount = SEED_PACKAGES.length;

/* ------------------------------ v29: media out of the store + storage budget ------------------------------ */

export type MediaKind = "banner" | "service" | "group" | "avatar";

/** Longest side (px) and WebP quality per kind of picture. */
const MEDIA_LIMITS: Record<MediaKind, { max: number; quality: number }> = {
  banner: { max: 1080, quality: 0.75 },
  service: { max: 512, quality: 0.8 },
  group: { max: 720, quality: 0.78 },
  avatar: { max: 256, quality: 0.8 },
};
/** v32: a 512 × 512 service icon may be at most 28 KB (as a data URL ≈ 38 K characters). */
const SERVICE_ICON_MAX = 38_400;
/** A picture kept inside the store when the media bucket cannot be used (~35 KB). */
const INLINE_MEDIA_MAX = 48_000;
/** Any single browser storage key above this is a leftover dump and is removed at start-up. */
const LOCAL_KEY_LIMIT = 50_000;
/** The offline copy of the store is dropped instead of written when it grows past this. */
const STATE_CACHE_LIMIT = 1_000_000;

/** Removes oversized leftovers (old full-store dumps with embedded photos) from browser storage. */
export function cleanupBloatedStorage(): void {
  if (typeof window === "undefined") return;
  for (const area of [window.localStorage, window.sessionStorage]) {
    try {
      for (let index = area.length - 1; index >= 0; index -= 1) {
        const key = area.key(index);
        if (!key || key === SESSION_KEY) continue;
        const size = (area.getItem(key) ?? "").length;
        const limit = key === STATE_KEY || key === GUEST_CATALOG_KEY ? STATE_CACHE_LIMIT : LOCAL_KEY_LIMIT;
        if (size > limit) area.removeItem(key);
      }
    } catch {
      /* storage blocked: nothing to clean */
    }
  }
}

function encodeCanvas(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL("image/webp", quality);
  // Older Safari cannot export WebP and silently returns PNG; JPEG is far smaller then.
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
}

/** Draws the picture on a canvas no wider/taller than `max` and exports compressed WebP. */
async function compressImage(source: Blob | string, max: number, quality: number): Promise<string> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const width = image.naturalWidth || 1;
    const height = image.naturalHeight || 1;
    const scale = Math.min(1, max / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return encodeCanvas(canvas, quality);
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}

/** Smallest acceptable inline copy: steps the size and quality down until it fits ~35 KB. */
async function compressInline(source: Blob | string, kind: MediaKind): Promise<string> {
  const { max, quality } = MEDIA_LIMITS[kind];
  const steps: Array<[number, number]> = [[max, quality], [max * 0.8, 0.62], [max * 0.6, 0.55], [max * 0.45, 0.5], [max * 0.32, 0.45]];
  let last = "";
  for (const [size, q] of steps) {
    last = await compressImage(source, Math.round(size), q);
    if (last.length <= INLINE_MEDIA_MAX) return last;
  }
  return last;
}

/**
 * v29 — compresses a picture to WebP and stores it in the public `zovacharge-media` bucket,
 * returning a short CDN link to save instead of the picture itself. If the bucket cannot be
 * used yet, it falls back to a heavily compressed inline copy (≤ ~35 KB) so uploads still work.
 */
export async function uploadMediaAsset(source: Blob | string, kind: MediaKind): Promise<{ ok: true; url: string; inline: boolean } | Err> {
  if (typeof window === "undefined") return { ok: false, error: "Uploads only work in the browser." };
  const { max, quality } = MEDIA_LIMITS[kind];
  let compressed: string;
  try {
    compressed = await compressImage(source, max, quality);
    // v32: service icons stay 512 px but are squeezed to ≤ 28 KB (≈ 38 K base64 characters).
    if (kind === "service") {
      for (const q of [0.72, 0.64, 0.56, 0.48, 0.4]) {
        if (compressed.length <= SERVICE_ICON_MAX) break;
        compressed = await compressImage(source, max, q);
      }
    }
  } catch {
    return { ok: false, error: "This image could not be read. Try a JPG, PNG or WebP file." };
  }
  const token = readToken();
  if (token) {
    try {
      const response = await fetch("/api/support-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "media", kind, data: compressed, token }),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; url?: unknown } | null;
      if (response.ok && result?.ok && typeof result.url === "string" && /^https:\/\//.test(result.url)) {
        return { ok: true, url: result.url, inline: false };
      }
    } catch {
      /* offline or bucket not ready: inline fallback below */
    }
  }
  try {
    const inline = compressed.length <= INLINE_MEDIA_MAX ? compressed : await compressInline(source, kind);
    if (inline.length > 60_000) return { ok: false, error: "This image is too large. Try a smaller one." };
    return { ok: true, url: inline, inline: true };
  } catch {
    return { ok: false, error: "This image could not be read. Try a JPG, PNG or WebP file." };
  }
}

let mediaMigrationRan = false;

/**
 * v29 — admin only, once per visit: moves old inline photos (game icons, banners, group covers,
 * avatars) out of the store into the media bucket and saves the short links in one change.
 */
export async function migrateInlineMedia(): Promise<{ ok: true; moved: number } | Err> {
  if (mediaMigrationRan || typeof window === "undefined") return { ok: true, moved: 0 };
  mediaMigrationRan = true;
  try {
    await ensureReady();
    const snapshot = memory;
    if (!snapshot) return { ok: true, moved: 0 };
    const admin = await currentUser(snapshot);
    if (!admin || admin.role !== "ADMIN") return { ok: true, moved: 0 };
    const jobs = new Map<string, MediaKind>();
    const consider = (value: string | undefined, kind: MediaKind) => {
      if (value && value.startsWith("data:image") && value.length > INLINE_MEDIA_MAX) jobs.set(value, kind);
    };
    for (const service of snapshot.services ?? []) consider(service.imageUrl, "service");
    for (const banner of snapshot.heroBanners ?? []) consider(banner, "banner");
    for (const group of snapshot.serviceGroups ?? []) consider(group.imageUrl, "group");
    for (const user of snapshot.users ?? []) consider(user.avatarUrl, "avatar");
    if (!jobs.size) return { ok: true, moved: 0 };
    const replaced = new Map<string, string>();
    for (const [value, kind] of jobs) {
      const uploaded = await uploadMediaAsset(value, kind);
      if (uploaded.ok && uploaded.url.length < value.length) replaced.set(value, uploaded.url);
    }
    if (!replaced.size) return { ok: true, moved: 0 };
    const swap = (value: string | undefined) => (value ? replaced.get(value) ?? value : value);
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      state.services = state.services.map((service) => (replaced.has(service.imageUrl) ? { ...service, imageUrl: swap(service.imageUrl) ?? "" } : service));
      if (state.heroBanners) state.heroBanners = state.heroBanners.map((banner) => swap(banner) ?? banner);
      if (state.serviceGroups) {
        state.serviceGroups = state.serviceGroups.map((group) => (group.imageUrl && replaced.has(group.imageUrl) ? { ...group, imageUrl: swap(group.imageUrl) ?? "" } : group));
      }
      state.users = state.users.map((user) => (replaced.has(user.avatarUrl) ? { ...user, avatarUrl: swap(user.avatarUrl) ?? "" } : user));
      return { state, result: undefined };
    });
    return { ok: true, moved: replaced.size };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/* ------------------------------ v32: catalog import (additive, de-duplicated) ------------------------------ */

export type { ImportPackage, ImportService } from "@/lib/store/types";
/** fresh: new services · fills: existing services with no sizes that the list can fill · duplicates: skipped. */
export type ImportPlan = { fresh: ImportService[]; fills: ImportService[]; duplicates: Array<{ name: string; matches: string }> };

const IMPORT_PREFIXES = /^(شحن|بطاقات|بطاقة|رصيد|اشتراك|كوينز|جواهر|top[\s-]*up|topup|recharge|gift\s*cards?|cards?)\s+/i;
const IMPORT_SUFFIXES = /\s+(top[\s-]*up|gift\s*cards?|cards?|coins|diamonds|uc|points|credits|wallet|chips)$/i;

/** "شحن ببجي موبايل " / "PUBG Mobile UC Top-Up" → comparable keys. */
export function normalizeTitle(value: string): string {
  let text = (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, "") // Arabic diacritics
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^a-z0-9\u0621-\u064a]+/g, " ")
    .trim();
  for (let i = 0; i < 2; i += 1) text = text.replace(IMPORT_PREFIXES, "").replace(IMPORT_SUFFIXES, "").trim();
  return text.replace(/\s+/g, "");
}

export function importSlug(item: ImportService): string {
  const base = (item.slug || item.name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.slice(0, 60) || `svc-${Math.random().toString(36).slice(2, 8)}`;
}

function importCategory(value: string | undefined): Category {
  const known = CATEGORIES.map((item) => item.slug) as string[];
  const lower = (value ?? "").toLowerCase();
  if (known.includes(lower)) return lower as Category;
  if (/app|تطبيق|social|live|chat|بث/.test(lower)) return "apps" as Category;
  if (/sub|اشتراك|netflix|spotify|stream/.test(lower)) return "subscriptions" as Category;
  if (/mobile|isp|internet|رصيد|انترنت|إنترنت|اتصال/.test(lower)) return "mobile" as Category;
  return "games" as Category;
}

/** Splits a crawled list into services we don't have yet and ones that already exist (by name or slug). */
export async function planCatalogImport(items: ImportService[]): Promise<ImportPlan> {
  await ensureReady();
  const state = memory ?? blankState();
  const taken = new Map<string, string>();
  for (const service of state.services) {
    for (const key of [service.name, service.nameAr ?? "", service.slug.replace(/-/g, " ")]) {
      const normal = normalizeTitle(key);
      if (normal) taken.set(normal, service.nameAr || service.name);
    }
  }
  const plan: ImportPlan = { fresh: [], fills: [], duplicates: [] };
  const emptyKeys = new Set<string>();
  for (const service of state.services) {
    if (state.packages.some((pack) => pack.serviceId === service.id) || service.serviceMode === "POINT_COUNTER") continue;
    for (const key of [service.name, service.nameAr ?? "", service.slug.replace(/-/g, " ")]) emptyKeys.add(normalizeTitle(key));
  }
  for (const item of items) {
    if (!item?.name) continue;
    item.packages = Array.isArray(item.packages) ? item.packages : [];
    const keys = [item.name, item.nameAr ?? "", item.slug ?? ""].map(normalizeTitle).filter(Boolean);
    const hit = keys.map((key) => taken.get(key)).find(Boolean);
    if (hit) {
      // An existing service that still has no sizes can take this list's packages.
      if ((item.packages.length || item.counter || item.regions?.length) && keys.some((key) => emptyKeys.has(key))) plan.fills.push(item);
      else plan.duplicates.push({ name: item.nameAr || item.name, matches: hit });
      continue;
    }
    keys.forEach((key) => taken.set(key, item.nameAr || item.name)); // also de-dupes inside the list
    plan.fresh.push(item);
  }
  return plan;
}

/**
 * Adds the new services (instant, player-ID input, up to 20 sizes each) on top of the live
 * catalog. Existing services are never touched; the save goes out as per-record upserts.
 * `markup` (percent) is added to every price; `icons` maps the slug → uploaded icon URL.
 */
export async function importCatalog(input: { items: ImportService[]; markup?: number; vipDiscount?: number; icons?: Record<string, string> }): Promise<{ ok: true; added: number; skipped: number; filled: number } | Err> {
  try {
    if (!hasConfirmedRemoteCatalog && supabaseEnv().enabled) {
      await loadAuthoritative();
      if (!hasVerifiedRemoteRead) throw new Error(notVerified());
    }
    const markup = Math.max(-50, Math.min(300, Number(input.markup) || 0)) / 100;
    const vipCut = Math.max(0, Math.min(50, Number(input.vipDiscount) || 0)) / 100;
    const icons = input.icons ?? {};
    const result = await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      // Re-check against the freshest catalog inside the save itself.
      const taken = new Set<string>();
      const slugs = new Set(state.services.map((service) => service.slug));
      for (const service of state.services) {
        for (const key of [service.name, service.nameAr ?? "", service.slug.replace(/-/g, " ")]) {
          const normal = normalizeTitle(key);
          if (normal) taken.add(normal);
        }
      }
      let added = 0;
      let skipped = 0;
      let filled = 0;
      const addPacks = (serviceId: string, packs: ImportPackage[]) =>
        packs.forEach((pack, index) => {
          const usd = Math.round(Number(pack.price) * (1 + markup) * 100);
          const syp = pack.priceSyp ? Math.round(Number(pack.priceSyp) * (1 + markup) * 100) : 0;
          state.packages.push({
            id: randomId("pkg"),
            serviceId,
            sizeName: String(pack.sizeName).trim().slice(0, 60),
            normalPriceCents: usd,
            vipPriceCents: Math.round(usd * (1 - vipCut)),
            normalPriceSypCents: syp,
            vipPriceSypCents: syp ? Math.round(syp * (1 - vipCut)) : 0,
            apiEndpoint: "",
            apiSecretCode: "",
            sortOrder: index,
          });
        });
      /** Typed-amount pricing (bills) → the store's counter: price per 100 units. */
      const counterOf = (item: ImportService) => {
        if (!item.counter || !(Number(item.counter.per100Usd) > 0)) return undefined;
        const per100 = Math.round(Number(item.counter.per100Usd) * (1 + markup) * 100);
        return normalizeCounter({
          pricePer100UsdCents: per100,
          vipPricePer100UsdCents: Math.round(per100 * (1 - vipCut)),
          minPoints: Math.max(1, Math.round(Number(item.counter.min) || 1)),
          stepPoints: Math.max(1, Math.round(Number(item.counter.step) || 1)),
        });
      };
      const regionsOfItem = (item: ImportService): ServiceRegion[] =>
        (item.regions ?? [])
          .filter((region) => region && (region.nameAr || region.nameEn))
          .slice(0, MAX_REGIONS)
          .map((region) => ({ id: randomId("rgn"), nameAr: String(region.nameAr ?? "").slice(0, 60), nameEn: String(region.nameEn ?? "").slice(0, 60) }));
      const fieldsOfItem = (item: ImportService) => (item.customFields ?? []).filter((field) => field?.id && (field.labelAr || field.labelEn)).slice(0, MAX_CUSTOM_FIELDS);
      for (const item of input.items) {
        const keys = [item.name, item.nameAr ?? "", item.slug ?? ""].map(normalizeTitle).filter(Boolean);
        const packs = (item.packages ?? []).filter((pack) => pack?.sizeName && Number(pack.price) > 0).slice(0, MAX_PACKAGES);
        const counter = counterOf(item);
        if (!item.name) {
          skipped += 1;
          continue;
        }
        if (keys.some((key) => taken.has(key))) {
          // Existing service: only an empty one (no sizes yet) gets this list's packages.
          const existing = state.services.find((service) =>
            [service.name, service.nameAr ?? "", service.slug.replace(/-/g, " ")].some((key) => keys.includes(normalizeTitle(key))),
          );
          const empty = existing && existing.serviceMode !== "POINT_COUNTER" && !state.packages.some((pack) => pack.serviceId === existing.id);
          if (existing && empty && !packs.length && !counter && !existing.regions?.length && regionsOfItem(item).length) {
            // Region step only: the admin adds the sizes of each region afterwards.
            existing.regions = regionsOfItem(item);
            filled += 1;
          } else if (existing && empty && (packs.length || counter)) {
            if (counter && !packs.length) {
              existing.serviceMode = "POINT_COUNTER";
              existing.counter = counter;
            } else {
              addPacks(existing.id, packs);
            }
            if (!existing.customFields?.length && fieldsOfItem(item).length) existing.customFields = fieldsOfItem(item);
            filled += 1;
          } else {
            skipped += 1;
          }
          continue;
        }
        let slug = importSlug(item);
        while (slugs.has(slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`;
        const serviceId = randomId("svc");
        const mode = item.mode === "VAULT" ? "VAULT" : counter && !packs.length ? "POINT_COUNTER" : "PACKAGES";
        state.services.push({
          id: serviceId,
          name: item.name.trim().slice(0, 80),
          nameAr: (item.nameAr ?? "").trim().slice(0, 80),
          slug,
          category: importCategory(item.category),
          description: (item.description ?? "").trim().slice(0, 300),
          descriptionAr: (item.descriptionAr ?? "").trim().slice(0, 300),
          // Instant unless the list says manual (vault pieces are always delivered instantly).
          deliverySpeed: item.speed === "MANUAL" && mode !== "VAULT" ? "MANUAL" : "INSTANT",
          targetInputType: item.input === "LANDLINE_PHONE" ? "LANDLINE_PHONE" : "PLAYER_ID",
          serviceMode: mode,
          groupId: item.groupId || undefined,
          counter: mode === "POINT_COUNTER" ? counter : undefined,
          regions: regionsOfItem(item).length ? regionsOfItem(item) : undefined,
          customFields: mode === "VAULT" ? undefined : fieldsOfItem(item).length ? fieldsOfItem(item) : undefined,
          instructions: "",
          instructionsAr: "",
          badge: null,
          imageUrl: icons[slug] ?? icons[importSlug(item)] ?? "",
          createdAt: new Date().toISOString(),
        });
        if (mode !== "POINT_COUNTER") addPacks(serviceId, packs);
        state.deletedSlugs = (state.deletedSlugs ?? []).filter((item) => item !== slug);
        keys.forEach((key) => taken.add(key));
        slugs.add(slug);
        added += 1;
      }
      return { state, result: { added, skipped, filled } };
    });
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/**
 * Official App Store artwork for a game / app name (via our server), compressed in the
 * browser to a 512 × 512 WebP ≤ 28 KB and uploaded to the media bucket. Returns the CDN URL.
 */
export async function fetchOfficialIcon(term: string): Promise<{ ok: true; url: string; matched: string } | Err> {
  try {
    const response = await fetch("/api/support-image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "artwork", term, token: readToken() }),
    });
    const found = (await response.json().catch(() => null)) as { ok?: boolean; dataUrl?: string; matched?: string; error?: string } | null;
    if (!response.ok || !found?.ok || !found.dataUrl) return { ok: false, error: found?.error ?? "No artwork found." };
    const uploaded = await uploadMediaAsset(found.dataUrl, "service");
    if (!uploaded.ok) return uploaded;
    if (uploaded.inline) return { ok: false, error: "Media bucket unavailable — icon not saved." };
    return { ok: true, url: uploaded.url, matched: found.matched ?? "" };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** Services whose icon is missing or low quality (site favicons, inline photos). */
export async function servicesNeedingIcons(): Promise<Array<{ slug: string; name: string; nameAr: string }>> {
  await ensureReady();
  return (memory ?? blankState()).services
    .filter((service) => !service.imageUrl || service.imageUrl.startsWith("data:") || /google\.com\/s2\/favicons/.test(service.imageUrl))
    .map((service) => ({ slug: service.slug, name: service.name, nameAr: service.nameAr ?? "" }));
}

/** Saves new icon URLs onto existing services (one small per-record change). */
export async function setServiceIcons(icons: Record<string, string>): Promise<{ ok: true; updated: number } | Err> {
  try {
    const updated = await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      let count = 0;
      for (const service of state.services) {
        const url = icons[service.slug];
        if (url && /^https:\/\//.test(url)) {
          service.imageUrl = url;
          count += 1;
        }
      }
      return { state, result: count };
    });
    return { ok: true, updated };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** v32 — admin: mark a service out of stock (cover + no sales) or back in stock. One small change. */
export async function setServiceStock(slug: string, outOfStock: boolean): Promise<{ ok: true } | Err> {
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const service = state.services.find((item) => item.slug === slug);
      if (!service) throw new Error("Service not found.");
      service.outOfStock = outOfStock || undefined;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/* ------------------------------ v33: package-name cleaner ------------------------------ */

/**
 * Admin, one click: strips each service's own name and filler prefixes from its package titles
 * ("PUBG Mobile 60 UC" → "60 UC"), keeping the size and coin name. Titles that would lose
 * meaning are left as they are. Returns how many titles changed.
 */
export async function sanitizePackageNames(): Promise<{ ok: true; changed: number } | Err> {
  try {
    const changed = await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const byId = new Map(state.services.map((service) => [service.id, service]));
      let count = 0;
      for (const pack of state.packages) {
        const service = byId.get(pack.serviceId);
        if (!service) continue;
        const clean = cleanPackName(pack.sizeName, [service.name, service.nameAr ?? "", service.slug.replace(/-/g, " ")]);
        if (clean && clean !== pack.sizeName) {
          pack.sizeName = clean.slice(0, 60);
          count += 1;
        }
      }
      return { state, result: count };
    });
    return { ok: true, changed };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/* ------------------------------ v33: honeypot (decoy admin URLs) ------------------------------ */

const HONEYPOT_CAP = 150;

/**
 * Records a visit to a decoy admin URL by a guest or non-admin (once per path per browser
 * session), flags the signed-in account, and — when `pin` is given — adds the PIN they typed.
 * Returns the event id. Silent: never throws to the page.
 */
export async function reportHoneypot(input: { path: string; pin?: string; eventId?: string }): Promise<string | null> {
  try {
    if (typeof window === "undefined") return null;
    const ip = await quickIp();
    const id = await commit(async (state) => {
      const user = await currentUser(state);
      if (user?.role === "ADMIN") return { state, result: null as string | null };
      state.honeypotEvents = state.honeypotEvents ?? [];
      if (input.eventId) {
        const event = state.honeypotEvents.find((item) => item.id === input.eventId);
        if (event && input.pin) event.enteredPayload = input.pin.slice(0, 32);
        return { state, result: input.eventId };
      }
      const event: HoneypotEvent = {
        id: randomId("trap"),
        userId: user?.id,
        email: user?.email,
        fullName: user?.name,
        attemptedPath: input.path.slice(0, 120),
        ip: ip || undefined,
        country: cachedCountry || undefined,
        userAgent: navigator.userAgent.slice(0, 200),
        createdAt: new Date().toISOString(),
      };
      state.honeypotEvents = [event, ...state.honeypotEvents].slice(0, HONEYPOT_CAP);
      if (user) user.honeypotFlagged = true;
      return { state, result: event.id };
    });
    if (id && !input.eventId) notifyTelegram({ kind: "honeypot", id });
    return id;
  } catch {
    return null;
  }
}

/** Admin: the honeypot radar (newest first). */
export async function listHoneypotEvents(): Promise<HoneypotEvent[]> {
  await ensureReady();
  const state = memory;
  if (!state) return [];
  const user = await currentUser(state);
  if (user?.role !== "ADMIN") return [];
  return (state.honeypotEvents ?? []).slice(0, HONEYPOT_CAP);
}

/* ------------------------------ v33: live presence (admin-only view) ------------------------------ */

type PresenceChannel = ReturnType<NonNullable<ReturnType<typeof getSupabase>>["channel"]>;
let presenceChannel: PresenceChannel | null = null;
let presenceKey = "";
let onlineNow = new Set<string>();
const presenceListeners = new Set<(ids: Set<string>) => void>();

/**
 * Joins the lightweight Supabase Realtime presence channel while this tab is open (no database
 * reads, no polling — one websocket message on join / leave). Only the opaque account id is
 * shared; names stay in the admin view. Returns a leave function.
 */
export function joinPresence(userId: string): () => void {
  const client = getSupabase();
  if (!client || typeof window === "undefined" || !userId) return () => undefined;
  if (presenceChannel && presenceKey === userId) return leavePresence;
  leavePresence();
  presenceKey = userId;
  const channel = client.channel("zovacharge-online-presence", { config: { presence: { key: userId } } });
  channel.on("presence", { event: "sync" }, () => {
    if (!presenceListeners.size) return; // only the admin screen does anything with it
    onlineNow = new Set(Object.keys(channel.presenceState()));
    presenceListeners.forEach((listener) => listener(onlineNow));
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") void channel.track({ userId, onlineAt: Date.now() });
  });
  presenceChannel = channel;
  window.addEventListener("pagehide", leavePresence, { once: true });
  return leavePresence;
}

function leavePresence(): void {
  const channel = presenceChannel;
  presenceChannel = null;
  presenceKey = "";
  if (!channel) return;
  void channel.untrack().catch(() => undefined);
  void getSupabase()?.removeChannel(channel);
}

/** Admin: listen to who is online right now (account ids). */
export function onPresence(listener: (ids: Set<string>) => void): () => void {
  presenceListeners.add(listener);
  if (presenceChannel) {
    onlineNow = new Set(Object.keys(presenceChannel.presenceState()));
    listener(onlineNow);
  }
  return () => presenceListeners.delete(listener);
}

/* ------------------------------ v35: owner secure session (SQL part 9 guard) ------------------------------ */

type GuardState = "unknown" | "absent" | "trusted" | "untrusted";
/** absent = part 9 not installed · trusted = this browser holds the owner's confirmed Supabase session. */
let guardState: GuardState = "unknown";

/** Asks the database whether the money guard is installed and whether this browser is the verified owner. */
export async function refreshGuardStatus(): Promise<GuardState> {
  const client = getSupabase();
  if (!client || !supabaseEnv().enabled) {
    guardState = "absent";
    return guardState;
  }
  try {
    const { data, error } = await withTimeout(client.rpc("nova_guard_status"), 4500);
    if (error) {
      const code = String((error as { code?: string }).code ?? "");
      if (code === "PGRST202" || code === "42883" || /could not find the function/i.test(error.message ?? "")) guardState = "absent";
    } else {
      guardState = (data as { admin?: boolean } | null)?.admin ? "trusted" : "untrusted";
    }
  } catch {
    /* offline: keep the last answer */
  }
  return guardState;
}

export function getGuardState(): GuardState {
  return guardState;
}

function ownerSessionText(): string {
  const english = typeof document !== "undefined" && document.documentElement.lang === "en";
  return english
    ? "🔐 Saving money, price or catalog changes needs the owner's secure session: Admin → Settings → “Turn on secure session”."
    : "🔐 حفظ التغييرات المالية والأسعار يحتاج «جلسة المالك الآمنة»: الإدارة ← الإعدادات ← «تفعيل الجلسة الآمنة».";
}

const GUARDED_KEYS = [
  "services", "packages", "sypRate", "shamcashAddress", "syriatelCashAddress", "mtnCashAddress", "serviceGroups",
  "heroBanners", "offersTickerText", "offersTickerTextAr", "offersTickerUpdatedAt", "deletedSlugs", "avgTopupMinutes", "transactions",
] as const;

/** True when a change touches what SQL part 9 only accepts from the owner's secure session. */
function touchesGuarded(before: NovaState, after: NovaState): boolean {
  const a = before as unknown as Record<string, unknown>;
  const b = after as unknown as Record<string, unknown>;
  if (GUARDED_KEYS.some((key) => JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null))) return true;
  const money = (user: StoredUser) => `${user.balanceCents}|${user.role}|${user.isBlocked === true}`;
  const users = new Map(before.users.map((user) => [user.id, user]));
  for (const user of after.users) {
    const old = users.get(user.id);
    if (old && (money(old) !== money(user) || (old.isLocked === true && user.isLocked !== true))) return true;
  }
  const orders = new Map(before.orders.map((order) => [order.id, `${order.status}|${order.priceCents}|${order.refunded === true}`]));
  if (after.orders.some((order) => orders.get(order.id) !== `${order.status}|${order.priceCents}|${order.refunded === true}`)) return true;
  const requests = new Map(before.balanceRequests.map((item) => [item.id, `${item.status}|${item.cents}`]));
  return after.balanceRequests.some((item) => (requests.has(item.id) ? requests.get(item.id) !== `${item.status}|${item.cents}` : item.status !== "PROCESSING"));
}

/**
 * Owner: signs the owner's Supabase Auth account in (email + password) and keeps that session on this
 * device. It is what SQL part 9 trusts for money / price changes and what the backup route checks.
 * Runs by itself when the admin signs in; the Settings card can run it again.
 */
export async function activateOwnerSession(password: string): Promise<{ ok: true } | Err> {
  const client = getSupabase();
  const english = typeof document !== "undefined" && document.documentElement.lang === "en";
  if (!client) return { ok: false, error: "Supabase is not configured on this site." };
  try {
    const { data, error } = await withTimeout(client.auth.signInWithPassword({ email: ADMIN_EMAIL, password }), 6000);
    if (error || !data.session) {
      const message = error?.message ?? "";
      if (/not confirmed/i.test(message)) {
        return { ok: false, error: english ? "Confirm majd@elmadani.com in Supabase → Authentication → Users first." : "أكّد البريد majd@elmadani.com أولاً من Supabase ← Authentication ← Users." };
      }
      return {
        ok: false,
        error: english
          ? "Supabase didn't accept this password. One-time setup: Supabase → Authentication → Users → Add user → majd@elmadani.com, the same password as the store admin, tick “Auto Confirm User”."
          : "لم يقبل Supabase كلمة المرور. إعداد لمرة واحدة: Supabase ← Authentication ← Users ← Add user ← majd@elmadani.com بنفس كلمة مرور المدير في المتجر، مع تفعيل «Auto Confirm User».",
      };
    }
    guardState = "unknown";
    await refreshGuardStatus();
    return { ok: true };
  } catch {
    return { ok: false, error: english ? "The connection is slow — please try again." : "الاتصال بطيء — حاول مجدداً." };
  }
}

/* ------------------------------ v35: admin backup (server-checked) ------------------------------ */

/** Downloads the JSON backup. The server checks the owner's Supabase token before sending anything. */
export async function downloadAdminBackup(): Promise<{ ok: true; blob: Blob; filename: string } | Err> {
  const client = getSupabase();
  if (!client) return { ok: false, error: "Supabase is not configured on this site." };
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: ownerSessionText() };
  try {
    const response = await fetch("/api/admin-backup", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? (response.status === 401 || response.status === 403 ? ownerSessionText() : `HTTP ${response.status}`) };
    }
    const blob = await response.blob();
    const filename = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? `zovacharge-backup-${new Date().toISOString().slice(0, 10)}.json`;
    return { ok: true, blob, filename };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/* ------------------------------ v35: wallet statement ------------------------------ */

/** Every wallet line of the signed-in customer, newest first, with the balance after each one. */
export async function listMyLedger(): Promise<WalletLedgerEntry[]> {
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  if (!user) return [];
  let running = user.balanceCents;
  return state.transactions
    .filter((txn) => txn.userId === user.id)
    .map((txn) => {
      const after = typeof txn.balanceAfterCents === "number" ? txn.balanceAfterCents : running;
      running = after - txn.cents;
      const adminLine = /^Admin |^Added by /.test(txn.note);
      const type: WalletLedgerEntry["type"] =
        txn.kind === "purchase" ? "PURCHASE" : txn.kind === "self_topup" ? "TOPUP" : txn.kind === "refund" && !adminLine && txn.cents > 0 ? "REFUND" : "ADMIN_ADJUST";
      const labels: Record<WalletLedgerEntry["type"], [string, string]> = {
        TOPUP: ["شحن المحفظة", "Wallet top-up"],
        PURCHASE: ["شراء", "Purchase"],
        REFUND: ["استرداد", "Refund"],
        ADMIN_ADJUST: [txn.cents >= 0 ? "إضافة من الإدارة" : "خصم من الإدارة", txn.cents >= 0 ? "Added by admin" : "Deducted by admin"],
      };
      const [labelAr, labelEn] = labels[type];
      const detail = txn.note.replace(/^Admin (set|add|deduct) by [^·]+(· )?/, "").replace(/^Added by .+$/, "").trim();
      return {
        id: txn.id,
        userId: txn.userId,
        type,
        amountUsd: txn.cents,
        balanceAfterUsd: after,
        referenceId: txn.referenceId ?? (/#?((?:TOP|ZC|NC)-\d{4,})/.exec(txn.note)?.[1] ?? ""),
        labelAr: detail ? `${labelAr} · ${detail}` : labelAr,
        labelEn: detail ? `${labelEn} · ${detail}` : labelEn,
        createdAt: txn.createdAt,
      };
    });
}

/* ------------------------------ v34: 6-digit email verification (Supabase Auth + your SMTP) ------------------------------ */

/** Rejects after `ms` so a slow network can never leave a spinner hanging. */
function withTimeout<P extends PromiseLike<unknown>>(promise: P, ms: number, message = "timeout"): Promise<Awaited<P>> {
  return new Promise<Awaited<P>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value as Awaited<P>);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** What the person typed on the sign-up form, kept by Supabase until the code is confirmed. */
export type PendingSignUp = { name: string; phone: string; birthDate: string; currency?: string };

/** "verify" → show the code step · "skip" → verification is off / unavailable, register now. */
export type EmailCodeStart = { ok: true; status: "verify" | "skip" } | Err;

function verifyText(ar: boolean) {
  return {
    rate: ar ? "طلبات كثيرة لإرسال الرمز. انتظر دقيقة ثم حاول مجدداً." : "Too many code requests. Wait a minute and try again.",
    email: ar ? "عنوان البريد الإلكتروني غير صالح." : "That email address isn't valid.",
    exists: ar ? "يوجد حساب بهذا البريد الإلكتروني. سجّل الدخول بدلاً من ذلك." : "An account with that email already exists. Sign in instead.",
    wrong: ar ? "الرمز غير صحيح أو منتهي الصلاحية، حاول مجدداً" : "The code is wrong or has expired — try again",
    slow: ar ? "الاتصال بطيء — حاول مجدداً." : "The connection is slow — please try again.",
    send: ar ? "تعذّر إرسال رمز التحقق إلى بريدك الآن. حاول بعد دقيقة." : "We couldn't send the verification code right now. Try again in a minute.",
  };
}

/** Whether ZovaCharge already has an account with this email. */
export async function accountExists(email: string): Promise<boolean> {
  await ensureReady();
  const lower = email.trim().toLowerCase();
  return Boolean(memory?.users.some((user) => user.email.toLowerCase() === lower));
}

/**
 * v34 — step 1 of email sign-up: Supabase Auth sends the 6-digit code (through your SMTP, e.g.
 * Resend). The form details ride along as Supabase user metadata, so a visitor who closes the
 * browser can finish later from the sign-in form. Google sign-up never comes here.
 */
export async function startEmailSignUp(input: { email: string; password: string } & PendingSignUp, language: "ar" | "en" = "ar"): Promise<EmailCodeStart> {
  const text = verifyText(language === "ar");
  const client = getSupabase();
  // Without Supabase (local preview) there is nobody to send a code: register directly.
  if (!client) return { ok: true, status: "skip" };
  if (await accountExists(input.email)) return { ok: false, error: text.exists };
  const email = input.email.trim().toLowerCase();
  const meta = { full_name: input.name, phone: input.phone, birthdate: input.birthDate, currency: input.currency ?? "" };
  try {
    const { data, error } = await withTimeout(client.auth.signUp({ email, password: input.password, options: { data: meta } }), 6000);
    if (error) {
      const message = `${error.status ?? ""} ${error.message ?? ""}`.toLowerCase();
      if (/rate limit|too many|429/.test(message)) return { ok: false, error: text.rate };
      if (/invalid.*email|email.*invalid/.test(message)) return { ok: false, error: text.email };
      // Already known to Supabase (e.g. an earlier attempt): send a sign-in code instead.
      if (/already|registered|exists/.test(message)) return await sendEmailOtp(email, meta, text);
      return { ok: false, error: text.send };
    }
    // v35: the code step is mandatory for email sign-ups. When Supabase did not send a sign-up
    // code ("Confirm email" off → session, or an already-confirmed email → no identities),
    // send a 6-digit email code through the same SMTP instead.
    if (data.session) {
      await client.auth.signOut({ scope: "local" }).catch(() => undefined);
      return await sendEmailOtp(email, meta, text);
    }
    if (!data.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) return await sendEmailOtp(email, meta, text);
    codeChannel.set(email, "signup");
    return { ok: true, status: "verify" };
  } catch {
    return { ok: false, error: text.slow };
  }
}

/** Which Supabase email the code came in: the sign-up confirmation or a sign-in ("Magic Link") code. */
const codeChannel = new Map<string, "signup" | "email">();

async function sendEmailOtp(email: string, meta: Record<string, string>, text: ReturnType<typeof verifyText>): Promise<EmailCodeStart> {
  const client = getSupabase();
  if (!client) return { ok: false, error: text.send };
  try {
    const { error } = await withTimeout(client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, data: meta } }), 6000);
    if (error) return { ok: false, error: /rate limit|too many|429/i.test(error.message ?? "") ? text.rate : text.send };
    codeChannel.set(email, "email");
    return { ok: true, status: "verify" };
  } catch {
    return { ok: false, error: text.slow };
  }
}

/** Sends a new code (the 60 s cooldown is enforced by the screen). */
export async function resendEmailCode(email: string, language: "ar" | "en" = "ar"): Promise<{ ok: true } | Err> {
  const text = verifyText(language === "ar");
  const client = getSupabase();
  if (!client) return { ok: false, error: text.slow };
  const lower = email.trim().toLowerCase();
  try {
    const { error } =
      codeChannel.get(lower) === "email"
        ? await withTimeout(client.auth.signInWithOtp({ email: lower, options: { shouldCreateUser: false } }), 4500)
        : await withTimeout(client.auth.resend({ type: "signup", email: lower }), 4500);
    if (error) return { ok: false, error: /rate limit|too many|429/i.test(error.message ?? "") ? text.rate : error.message };
    return { ok: true };
  } catch {
    return { ok: false, error: text.slow };
  }
}

/**
 * Checks the 6-digit code. On success returns the details saved at sign-up (for a visitor who
 * comes back later) and closes the temporary Supabase session — ZovaCharge keeps its own.
 */
export async function verifyEmailCode(email: string, code: string, language: "ar" | "en" = "ar"): Promise<Ok<{ pending: PendingSignUp }> | Err> {
  const text = verifyText(language === "ar");
  const client = getSupabase();
  if (!client) return { ok: false, error: text.slow };
  if (!/^\d{6}$/.test(code)) return { ok: false, error: text.wrong };
  const lower = email.trim().toLowerCase();
  const order: Array<"signup" | "email"> = codeChannel.get(lower) === "email" ? ["email", "signup"] : ["signup", "email"];
  try {
    for (const type of order) {
      const { data, error } = await withTimeout(client.auth.verifyOtp({ email: lower, token: code, type }), 5000);
      if (error || !data.user) continue;
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const str = (value: unknown) => (typeof value === "string" ? value : "");
      await client.auth.signOut({ scope: "local" }).catch(() => undefined);
      codeChannel.delete(lower);
      return { ok: true, pending: { name: str(meta.full_name), phone: str(meta.phone), birthDate: str(meta.birthdate), currency: str(meta.currency) || undefined } };
    }
    return { ok: false, error: text.wrong };
  } catch {
    return { ok: false, error: text.slow };
  }
}

/**
 * Sign-in recovery: no ZovaCharge account with this email, but Supabase knows a sign-up that was
 * never confirmed (the browser closed before the code was typed) → send a fresh code. True when
 * the code step should open.
 */
export async function resumePendingSignUp(email: string, password: string): Promise<boolean> {
  const client = getSupabase();
  if (!client || (await accountExists(email))) return false;
  try {
    const lower = email.trim().toLowerCase();
    const { data, error } = await withTimeout(client.auth.signInWithPassword({ email: lower, password }), 5000);
    if (data?.session) {
      // Confirmed in Supabase but the ZovaCharge account was never created: confirm by code, then create it.
      await client.auth.signOut({ scope: "local" }).catch(() => undefined);
      const sent = await sendEmailOtp(lower, {}, verifyText(document.documentElement.lang !== "en"));
      return sent.ok;
    }
    if (!error || !/not confirmed/i.test(error.message ?? "")) return false;
    await withTimeout(client.auth.resend({ type: "signup", email: lower }), 4500).catch(() => undefined);
    codeChannel.set(lower, "signup");
    return true;
  } catch {
    return false;
  }
}
