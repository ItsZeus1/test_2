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
} from "@/lib/store/types";
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
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
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
  if (!parsed) return null;
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
      return normalizeState(JSON.parse(text));
    } catch {
      return null;
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
      return table;
    }
    if (table === "blocked" && mode === "table") return null;
  }
  const stored = await readStorage();
  if (stored !== "missing" && stored !== "blocked") {
    mode = "storage";
    modeDetail = `Synced through Storage ${STORAGE_BUCKET}/${STORAGE_OBJECT}.`;
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

const inList = (ids: string[]) => `(${ids.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`;

/** Write-through of the catalog + settings to real tables so every device reads the same rows. */
async function writeRelational(state: NovaState): Promise<void> {
  const client = getSupabase();
  if (!client) {
    catalogMode = "off";
    return;
  }
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
    const steps = [
      serviceRows.length ? await client.from("services").upsert(serviceRows, { onConflict: "id" }) : null,
      serviceRows.length
        ? await client.from("services").delete().not("id", "in", inList(serviceRows.map((row) => row.id)))
        : await client.from("services").delete().neq("id", ""),
      packageRows.length ? await client.from("service_packages").upsert(packageRows, { onConflict: "id" }) : null,
      packageRows.length
        ? await client.from("service_packages").delete().not("id", "in", inList(packageRows.map((row) => row.id)))
        : await client.from("service_packages").delete().neq("id", ""),
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

async function pushCloud(state: NovaState): Promise<void> {
  try {
    await pushBlob(state);
  } catch (error) {
    modeDetail = fail(error);
  }
  await writeRelational(state);
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
function notifyAdmins(body: { kind: "topup" | "support" | "manual" | "topup_result" | "order_result"; id: string; messageId?: string }): void {
  if (typeof window === "undefined" || !supabaseEnv().enabled) return;
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
  if (probed !== null && probed === current.version) return; // nothing new: done in one small request
  if (probed !== null && probed < current.version) {
    await pushCloud(current); // an earlier write did not land; retry it
    return;
  }
  const [remote, rel] = await Promise.all([pullCloud().catch(() => null), readRelational()]);
  const base = remote && remote.version >= current.version ? remote : current;
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
    // Hidden tabs stay quiet (except the admin's alert watcher) unless a live signal says something changed.
    if (writing || (!force && document.visibilityState === "hidden" && !backgroundSync)) return;
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
      const cached = readLocal();
      if (cached) {
        memory = cached;
      } else {
        memory = await heal(blankState());
        writeLocal(memory);
      }
      startPoll();
      void clientIp();
      void enqueue(async () => {
        const before = memory ? `${memory.version}:${memory.updatedAt}` : "";
        await loadAuthoritative();
        const after = memory ? `${memory.version}:${memory.updatedAt}` : "";
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

async function commit<T>(
  mutator: (state: NovaState) => { state: NovaState; result: T } | Promise<{ state: NovaState; result: T }>,
): Promise<T> {
  await ensureReady();
  return enqueue(async () => {
    writing = true;
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const base = cloneState(memory ?? (await loadAuthoritative()));
        const drafted = await mutator(cloneState(base));
        drafted.state.version = base.version + 1;
        drafted.state.updatedAt = new Date().toISOString();
        // Only download the full store when someone else saved in the meantime.
        let remote: NovaState | null = null;
        const probed = await probeRemoteVersion();
        if (probed === null || probed > base.version) {
          remote = await pullCloud().catch(() => null);
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

async function clientIp(): Promise<string> {
  const now = Date.now();
  if (cachedIp && now - cachedIpAt < 60_000) return cachedIp;
  try {
    const response = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      const body = (await response.json()) as { ip?: string };
      if (body.ip) {
        cachedIp = body.ip.slice(0, 64);
        cachedIpAt = now;
        return cachedIp;
      }
    }
  } catch {
    // Browser-only fallback is enough when the lookup is blocked.
  }
  cachedIp = "browser";
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
  };
}

function catalogOf(state: NovaState, role: Role | null, currency: Currency = "USD"): CatalogService[] {
  const sypRate = state.sypRate ?? DEFAULT_SYP_RATE_VALUE;
  return state.services
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
  };
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

function pushTxn(state: NovaState, entry: Omit<StoredTransaction, "id" | "createdAt">): void {
  state.transactions.unshift({
    ...entry,
    id: randomId("txn"),
    createdAt: new Date().toISOString(),
  });
  state.transactions = state.transactions.slice(0, 500);
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

export async function registerAccount(input: unknown): Promise<Ok<{ token: string; profile: Profile }> | Err> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const ip = await quickIp();
    const token = await commit(async (state) => {
      const email = parsed.data.email.toLowerCase();
      if (state.users.some((user) => user.email.toLowerCase() === email)) {
        throw new Error("An account with that email already exists.");
      }
      if (usernameTaken(state, parsed.data.username)) throw new Error("That username is already taken.");
      const hashed = await hashPassword(parsed.data.password);
      const now = new Date().toISOString();
      const admin = isAdminEmail(email);
      const user: StoredUser = {
        id: admin ? ADMIN_USER_ID : randomId("usr"),
        name: parsed.data.name,
        username: parsed.data.username,
        email,
        phone: formatSyMobile(parsed.data.phone),
        avatarUrl: "",
        passwordHash: hashed.passwordHash,
        passwordSalt: hashed.passwordSalt,
        role: admin ? "ADMIN" : "NORMAL",
        currency: admin ? "USD" : parsed.data.currency,
        balanceCents: admin ? ADMIN_BALANCE_CENTS : 0,
        isBlocked: false,
        lastIp: ip,
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

export async function loginAccount(input: unknown): Promise<Ok<{ token: string; profile: Profile }> | Err> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const ip = await quickIp();
    const token = await commit(async (state) => {
      const user = state.users.find((item) => item.email.toLowerCase() === parsed.data.email.toLowerCase());
      if (!user) throw new Error("Email or password is incorrect.");
      const hashed = await hashPassword(parsed.data.password, user.passwordSalt);
      if (!safeEqual(hashed.passwordHash, user.passwordHash)) {
        throw new Error("Email or password is incorrect.");
      }
      if (user.isBlocked) throw new Error("This account is blocked.");
      user.lastIp = ip;
      user.lastSeenAt = new Date().toISOString();
      if (isAdminEmail(user.email)) user.role = "ADMIN";
      const issued = await openSession(state, user.id);
      writeToken(issued);
      return { state, result: issued };
    });
    notifyAuth();
    const profile = await readProfile();
    if (!profile) return { ok: false, error: "Signed in, but the profile could not be read." };
    return { ok: true, token, profile };
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
      user.lastIp = ip;
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

export async function purchase(input: unknown): Promise<Ok<{ order: OrderRow; profile: Profile }> | Err> {
  const parsed = purchaseSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const callAt = Date.now();
  try {
    const ip = await quickIp();
    const outcome = await commit(async (state) => {
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
        packageName = pack.sizeName;
      }
      const targetId = mode === "VAULT" ? "" : parsed.data.targetId;
      if (mode !== "VAULT" && targetId.length < 3) throw new Error("Enter the full account or player ID.");
      if (user.balanceCents < price) throw new Error("Not enough wallet balance for this package.");
      user.balanceCents -= price;
      user.lastIp = ip;
      user.lastSeenAt = new Date().toISOString();
      const manual = service.deliverySpeed === "MANUAL";
      if (service.targetInputType === "LANDLINE_PHONE" && !/^0\d{2}-?\d{6,7}$/.test(targetId.replace(/\s/g, ""))) {
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
      };
      state.orders.unshift(order);
      pushTxn(state, {
        userId: user.id,
        kind: "purchase",
        cents: -price,
        note: `${service.name} · ${packageName}`,
      });
      return { state, result: { order: mapOrder(order), profile: toProfile(user) } };
    });
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
  const { cents, method, transferNumber } = parsed.data;
  const senderName = method === "SHAMCASH" ? parsed.data.senderName : "";
  const senderPhone = method === "SHAMCASH" ? "" : parsed.data.senderPhone.replace(/[\s-]/g, "");
  const reference = `${METHOD_LABEL[method]} · ${senderName || senderPhone} · #${transferNumber}`;
  try {
    const request = await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      assertCanTransact(user);
      const duplicate = state.balanceRequests.some(
        (item) =>
          (item.method ?? "SHAMCASH") === method &&
          item.transferNumber &&
          item.transferNumber.toLowerCase() === transferNumber.toLowerCase() &&
          item.status !== "REJECTED",
      );
      if (duplicate) throw new Error("This transfer number was already submitted. · رقم التحويل هذا مُرسل مسبقاً.");
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
      })),
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
      }
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

export async function sendSupportMessage(input: unknown): Promise<Ok<{ ticket: SupportTicket }> | Err> {
  const parsed = supportMessageSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  let userMessageId = "";
  try {
    const ticket = await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      if (user.isBlocked) throw new Error("This account is blocked.");
      const now = new Date().toISOString();
      state.supportTickets = state.supportTickets ?? [];
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
      target.messages.push({ id: userMessageId, sender: "USER", text: parsed.data.text, createdAt: now });
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
      target.messages.push({ id: randomId("msg"), sender: "ADMIN", text: parsed.data.text, createdAt: now });
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
        const user = state.users.find((item) => item.id === order.userId);
        if (user) {
          user.balanceCents = Math.min(balanceCap(asCurrency(user.currency)), user.balanceCents + order.priceCents);
          pushTxn(state, { userId: user.id, kind: "refund", cents: order.priceCents, note: `Refund ${order.receiptNumber ?? ""} · ${order.serviceName}` });
        }
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

/**
 * Password recovery request. Always answers the same way (so nobody can probe which emails
 * have accounts). If the account exists, the admin gets a support ticket + alert.
 * Hook for a real email service later: set NEXT_PUBLIC_PASSWORD_RESET_ENDPOINT.
 */
export async function requestPasswordReset(input: unknown): Promise<{ ok: true } | Err> {
  const raw = typeof input === "string" ? { email: input } : unwrap(input);
  const parsed = resetRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const email = parsed.data.email;
  const endpoint = process.env.NEXT_PUBLIC_PASSWORD_RESET_ENDPOINT;
  if (endpoint) {
    void fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => undefined);
  }
  try {
    await ensureReady();
    const snapshot = memory ?? blankState();
    const known = snapshot.users.find((user) => user.email.toLowerCase() === email);
    if (!known) return { ok: true };
    let created: { ticketId: string; messageId: string } | null = null;
    await commit(async (state) => {
      const user = state.users.find((item) => item.id === known.id);
      if (!user) return { state, result: undefined };
      state.supportTickets = state.supportTickets ?? [];
      const recent = state.supportTickets.find(
        (ticket) => ticket.userId === user.id && ticket.subject.startsWith("") && Date.now() - Date.parse(ticket.updatedAt) < 10 * 60_000,
      );
      if (recent) return { state, result: undefined }; // at most one request per 10 minutes
      const now = new Date().toISOString();
      const messageId = randomId("msg");
      const ticketId = randomId("tkt");
      state.supportTickets.unshift({
        id: ticketId,
        ticketNumber: `TKT-${100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)}`,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        subject: "استعادة كلمة المرور / Password reset",
        status: "OPEN",
        messages: [{ id: messageId, sender: "USER", text: `Password reset requested for ${user.email} (${user.phone || "no phone"}).`, createdAt: now }],
        unreadByAdmin: true,
        unreadByUser: false,
        createdAt: now,
        updatedAt: now,
      });
      created = { ticketId, messageId };
      return { state, result: undefined };
    });
    const made = created as { ticketId: string; messageId: string } | null;
    if (made) notifyAdmins({ kind: "support", id: made.ticketId, messageId: made.messageId });
    return { ok: true };
  } catch {
    return { ok: true };
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
          lastIp: ip,
          lastSeenAt: now,
          createdAt: now,
        };
        state.users.push(user);
      } else {
        if (!user.avatarUrl && avatar) user.avatarUrl = avatar;
        user.lastIp = ip;
        user.lastSeenAt = now;
        if (isAdminEmail(user.email)) user.role = "ADMIN";
      }
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
      const user = state.users.find((item) => item.id === order.userId);
      if (user) {
        user.balanceCents = Math.min(balanceCap(asCurrency(user.currency)), user.balanceCents + order.priceCents);
        pushTxn(state, { userId: user.id, kind: "refund", cents: order.priceCents, note: `Refund ${order.receiptNumber ?? ""} · ${order.serviceName} (cancelled by admin)` });
      }
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

export const seededServiceCount = SEED_SERVICES.length;
export const seededPackageCount = SEED_PACKAGES.length;
