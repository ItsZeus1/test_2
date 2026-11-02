import { getSupabase, supabaseEnv } from "@/lib/supabase";
import {
  dbDeleteService,
  dbFetchCatalog,
  dbFetchSettings,
  dbSaveService,
  dbSaveSettings,
  dbSeedCatalog,
  dbStatus,
  dbUpsertUsers,
  type DbSettings,
} from "@/lib/db";
import { readPreviewCurrency, writePreviewCurrency } from "@/lib/money";
import {
  ADMIN_BALANCE_CENTS,
  ADMIN_EMAIL,
  ADMIN_NAME,
  ADMIN_PASSWORD,
  ADMIN_USER_ID,
  ADMIN_USERNAME,
  DEFAULT_SHAMCASH,
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
  packPrice,
  rateFor,
  serviceTargetLabel,
  toProfile,
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
  ServiceWrite,
  StoreSettings,
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
  sypRateSchema,
  tickerSchema,
  slugSchema,
  syncSchema,
  usernameCheckSchema,
  zodError,
} from "@/lib/validation";

export type SyncMode = "table" | "storage" | "local";

export type SyncStatus = {
  configured: boolean;
  mode: SyncMode;
  detail: string;
};

type Ok<T extends object = object> = { ok: true } & T;
type Err = { ok: false; error: string };

const listeners = new Set<() => void>();
const SESSION_MS = 1000 * 60 * 60 * 24 * 30;
const ONLINE_MS = 1000 * 60 * 15;
const BALANCE_CAP = 2_000_000_000;

let memory: NovaState | null = null;
let mode: SyncMode = "local";
let modeDetail = "Waiting to sync.";
let queue: Promise<unknown> = Promise.resolve();
let ready: Promise<void> | null = null;
let writing = false;
let pollStarted = false;
let cachedIp = "";
let cachedIpAt = 0;
let dbOnline = false;
let dbSignature = "";
let pollTick = 0;

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
    detail: dbOnline ? `Catalog & settings live from the online database. ${modeDetail}` : dbStatus().detail || modeDetail,
  };
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

function writeLocal(state: NovaState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* quota or private mode: the online database stays the source of truth */
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
    modeDetail = "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to sync devices.";
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
    modeDetail = "Cloud tables are not created yet. NovaCharge is live in this browser and will attach when Storage or the state table accepts the anon key.";
  }
  return null;
}

async function pushCloud(state: NovaState): Promise<void> {
  if (!supabaseEnv().enabled) return;
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
      currency: "USD",
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

function dbFingerprint(state: NovaState): string {
  return JSON.stringify([
    state.services,
    state.packages,
    state.shamcashAddress,
    state.offersTickerText,
    state.offersTickerTextAr,
    state.sypRate,
  ]);
}

/** Copies DB-owned fields (catalog + settings) from `source` so an older blob never reverts them. */
function keepDbFields(target: NovaState, source: NovaState | null): NovaState {
  if (!dbOnline || !source) return target;
  target.services = source.services;
  target.packages = source.packages;
  target.shamcashAddress = source.shamcashAddress;
  target.offersTickerText = source.offersTickerText ?? DEFAULT_TICKER_EN;
  target.offersTickerTextAr = source.offersTickerTextAr ?? DEFAULT_TICKER_AR;
  target.sypRate = source.sypRate;
  return target;
}

/**
 * Reads services, service_packages and store_settings from the online database and makes them
 * authoritative. The first time the tables are empty, the current catalog/settings are uploaded.
 */
async function overlayDb(state: NovaState): Promise<{ state: NovaState; changed: boolean }> {
  let catalog: Awaited<ReturnType<typeof dbFetchCatalog>>;
  let settings: Awaited<ReturnType<typeof dbFetchSettings>>;
  try {
    [catalog, settings] = await Promise.all([dbFetchCatalog(), dbFetchSettings()]);
  } catch (error) {
    modeDetail = fail(error);
    return { state, changed: false };
  }
  if (catalog === "offline" || settings === "offline") {
    dbOnline = false;
    return { state, changed: false };
  }
  dbOnline = true;
  const seedSettings: Partial<DbSettings> = {};
  if (settings?.shamcashAddress) state.shamcashAddress = settings.shamcashAddress;
  else seedSettings.shamcashAddress = state.shamcashAddress;
  if (settings?.offersTickerText) state.offersTickerText = settings.offersTickerText;
  else seedSettings.offersTickerText = state.offersTickerText ?? "";
  if (settings?.offersTickerTextAr) state.offersTickerTextAr = settings.offersTickerTextAr;
  else seedSettings.offersTickerTextAr = state.offersTickerTextAr ?? "";
  if (settings) state.sypRate = settings.sypRate;
  else seedSettings.sypRate = state.sypRate;
  try {
    if (catalog.services.length === 0 && !settings?.catalogSeeded) {
      await dbSeedCatalog(state.services, state.packages);
    } else {
      state.services = catalog.services;
      state.packages = catalog.packages;
      if (!settings?.catalogSeeded) seedSettings.catalogSeeded = true;
    }
    if (Object.keys(seedSettings).length) await dbSaveSettings(seedSettings);
  } catch (error) {
    modeDetail = fail(error);
  }
  const signature = dbFingerprint(state);
  const changed = signature !== dbSignature;
  dbSignature = signature;
  return { state, changed };
}

function mirrorKey(user: StoredUser): string {
  return [user.name, user.username, user.email, user.phone, user.role, user.currency, user.balanceCents, user.isBlocked].join("|");
}

/** Write-through of profile/currency/balance changes into the users table. */
function mirrorUsers(before: NovaState, after: NovaState): void {
  if (!dbOnline) return;
  const changed = after.users.filter((user) => {
    const prior = before.users.find((item) => item.id === user.id);
    return !prior || mirrorKey(prior) !== mirrorKey(user);
  });
  if (changed.length) void dbUpsertUsers(changed).catch((error) => (modeDetail = fail(error)));
}

async function loadAuthoritative(): Promise<NovaState> {
  const local = memory ?? readLocal() ?? blankState();
  let remote: NovaState | null = null;
  try {
    remote = await pullCloud();
  } catch (error) {
    mode = "local";
    modeDetail = fail(error);
  }
  const healed = (await overlayDb(await heal(prefer(local, remote)))).state;
  memory = healed;
  writeLocal(healed);
  if (remote === null || healed.version !== remote.version || healed.updatedAt !== remote.updatedAt) {
    try {
      await pushCloud(healed);
    } catch (error) {
      modeDetail = fail(error);
    }
  }
  return healed;
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
  window.setInterval(() => {
    if (writing) return;
    void enqueue(async () => {
      const current = memory;
      if (!current) return;
      let next: NovaState | null = null;
      const remote = await pullCloud();
      if (!remote || remote.version < current.version) {
        if (supabaseEnv().enabled) await pushCloud(current);
      } else if (remote.version !== current.version) {
        next = keepDbFields(await heal(remote), current);
      }
      // Pull catalog + settings straight from the online tables so every device sees admin edits.
      // Every 2nd tick (~12s) keeps image-heavy catalog reads light; also on focus (below).
      pollTick += 1;
      const overlay =
        pollTick % 2 === 0 || next ? await overlayDb(next ?? cloneState(current)) : { state: current, changed: false };
      if (!next && !overlay.changed) return;
      if (writing) return;
      memory = overlay.state;
      writeLocal(memory);
      emit();
    });
  }, 6000);
  window.addEventListener("focus", () => {
    void enqueue(async () => {
      if (!memory || writing) return;
      const overlay = await overlayDb(cloneState(memory));
      if (!overlay.changed || writing) return;
      memory = overlay.state;
      writeLocal(memory);
      emit();
    });
  });
}

export async function ensureReady(): Promise<void> {
  if (!ready) {
    ready = enqueue(async () => {
      await loadAuthoritative();
      startPoll();
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
        let remote: NovaState | null = null;
        try {
          remote = await pullCloud();
        } catch {
          remote = null;
        }
        if (remote && remote.version > base.version) {
          memory = keepDbFields(await heal(remote), memory);
          writeLocal(memory);
          continue;
        }
        memory = drafted.state;
        dbSignature = dbFingerprint(drafted.state);
        writeLocal(drafted.state);
        try {
          await pushCloud(drafted.state);
        } catch (error) {
          modeDetail = fail(error);
        }
        mirrorUsers(base, drafted.state);
        emit();
        return drafted.result;
      }
      throw new Error("NovaCharge could not sync. Try again.");
    } finally {
      writing = false;
    }
  });
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
    createdAt: order.createdAt,
  };
}

function lowest(values: number[]): number {
  return values.length ? Math.min(...values) : 0;
}

function viewerCurrency(user: StoredUser | null): Currency {
  return user ? (user.currency === "SYP" ? "SYP" : "USD") : readPreviewCurrency();
}

function catalogOf(state: NovaState, role: Role | null, currency: Currency): CatalogService[] {
  return state.services
    .map((service) => {
      const packs = state.packages.filter((pack) => pack.serviceId === service.id);
      const usd = lowest(packs.map((pack) => packPrice(pack, role, "USD", state.sypRate)));
      const syp = lowest(packs.map((pack) => packPrice(pack, role, "SYP", state.sypRate)));
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
        startingPriceCents: currency === "SYP" ? syp : usd,
        startingPriceUsdCents: usd,
        startingPriceSypCents: syp,
        currency,
        rate: rateFor(role),
      };
    })
    .sort((left, right) => {
      const category = CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category);
      if (category !== 0) return category;
      return left.name.localeCompare(right.name);
    });
}

function detailOf(state: NovaState, slug: string, role: Role | null, currency: Currency): ServiceDetail | null {
  const service = state.services.find((item) => item.slug === slug);
  if (!service) return null;
  const packages = state.packages
    .filter((pack) => pack.serviceId === service.id)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((pack) => {
      const usd = packPrice(pack, role, "USD", state.sypRate);
      const syp = packPrice(pack, role, "SYP", state.sypRate);
      return {
        id: pack.id,
        sizeName: pack.sizeName,
        priceCents: currency === "SYP" ? syp : usd,
        priceUsdCents: usd,
        priceSypCents: syp,
        currency,
        rate: rateFor(role),
      };
    });
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
    instructions: service.instructions,
    targetLabel: serviceTargetLabel(service.category),
    startingPriceCents: lowest(packages.map((pack) => pack.priceCents)),
    startingPriceUsdCents: lowest(packages.map((pack) => pack.priceUsdCents)),
    startingPriceSypCents: lowest(packages.map((pack) => pack.priceSypCents)),
    currency,
    rate: rateFor(role),
    packages,
  };
}

function endpointIsCallable(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host.endsWith(".invalid") || host === "localhost" || host.endsWith(".local")) return false;
    if (/^(127\.|10\.|192\.168\.|0\.|169\.254\.)/.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function dispatchProvider(
  endpoint: string,
  targetId: string,
  code: string,
): Promise<"delivered" | "processing"> {
  if (!endpointIsCallable(endpoint)) return "processing";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_id: targetId, code }),
      signal: AbortSignal.timeout(2500),
    });
    return response.ok ? "delivered" : "processing";
  } catch {
    return "processing";
  }
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

function pushRequest(
  state: NovaState,
  entry: Omit<StoredBalanceRequest, "id" | "createdAt" | "resolvedAt"> & { status: StoredBalanceRequest["status"] },
): string {
  const now = new Date().toISOString();
  const id = randomId("bal");
  state.balanceRequests.unshift({
    ...entry,
    id,
    createdAt: now,
    resolvedAt: entry.status === "PROCESSING" ? null : now,
  });
  state.balanceRequests = state.balanceRequests.slice(0, 500);
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
    const ip = await clientIp();
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
        phone: "",
        avatarUrl: "",
        passwordHash: hashed.passwordHash,
        passwordSalt: hashed.passwordSalt,
        role: admin ? "ADMIN" : "NORMAL",
        balanceCents: admin ? ADMIN_BALANCE_CENTS : 0,
        currency: parsed.data.currency,
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
    const ip = await clientIp();
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

export async function readProfile(): Promise<Profile | null> {
  await ensureReady();
  const state = memory ?? (await loadAuthoritative());
  const user = await currentUser(state);
  return user ? toProfile(user) : null;
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
    const ip = await clientIp();
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

export async function getPublicCatalog(): Promise<CatalogService[]> {
  await ensureReady();
  return catalogOf(memory ?? blankState(), null, readPreviewCurrency());
}

export async function getViewerCatalog(): Promise<CatalogService[]> {
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  return catalogOf(state, user?.role ?? null, viewerCurrency(user));
}

export async function getPublicService(input: unknown): Promise<ServiceDetail | null> {
  const parsed = slugSchema.parse(unwrap(input));
  await ensureReady();
  return detailOf(memory ?? blankState(), parsed.slug, null, readPreviewCurrency());
}

export async function getViewerService(input: unknown): Promise<ServiceDetail | null> {
  const parsed = slugSchema.parse(unwrap(input));
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  return detailOf(state, parsed.slug, user?.role ?? null, viewerCurrency(user));
}

export async function purchase(input: unknown): Promise<Ok<{ order: OrderRow; profile: Profile }> | Err> {
  const parsed = purchaseSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const ip = await clientIp();
    const outcome = await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      assertCanTransact(user);
      const pack = state.packages.find((item) => item.id === parsed.data.packageId);
      if (!pack) throw new Error("That charge size is no longer available.");
      const service = state.services.find((item) => item.id === pack.serviceId);
      if (!service) throw new Error("That service is no longer available.");
      const currency = viewerCurrency(user);
      const price = packPrice(pack, user.role, currency, state.sypRate);
      if (user.balanceCents < price) throw new Error("Not enough wallet balance for this package.");
      user.balanceCents -= price;
      user.lastIp = ip;
      user.lastSeenAt = new Date().toISOString();
      const orderId = randomId("ord");
      const status = await dispatchProvider(pack.apiEndpoint, parsed.data.targetId, pack.apiSecretCode);
      const order: StoredOrder = {
        id: orderId,
        userId: user.id,
        serviceId: service.id,
        packageId: pack.id,
        serviceName: service.name,
        serviceSlug: service.slug,
        packageName: pack.sizeName,
        targetId: parsed.data.targetId,
        priceCents: price,
        currency,
        roleAtPurchase: user.role,
        ipAddress: ip,
        status,
        fulfillmentRef: `NC-${orderId.slice(4, 10).toUpperCase()}`,
        createdAt: new Date().toISOString(),
      };
      state.orders.unshift(order);
      pushTxn(state, {
        userId: user.id,
        kind: "purchase",
        cents: -price,
        currency,
        note: `${service.name} · ${pack.sizeName}`,
      });
      return { state, result: { order: mapOrder(order), profile: toProfile(user) } };
    });
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

export async function submitBalanceRequest(
  input: unknown,
): Promise<Ok<{ id: string; request: BalanceRequest }> | Err> {
  const parsed = balanceRequestSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const request = await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      assertCanTransact(user);
      const id = pushRequest(state, {
        userId: user.id,
        username: user.username,
        cents: parsed.data.cents,
        currency: viewerCurrency(user),
        status: "PROCESSING",
        note: parsed.data.referenceNote,
        referenceNote: parsed.data.referenceNote,
      });
      const stored = state.balanceRequests.find((item) => item.id === id);
      return {
        state,
        result: {
          id,
          request: {
            id,
            userId: user.id,
            username: user.username,
            cents: parsed.data.cents,
            currency: viewerCurrency(user),
            status: "PROCESSING" as const,
            note: parsed.data.referenceNote,
            referenceNote: parsed.data.referenceNote,
            createdAt: stored?.createdAt ?? new Date().toISOString(),
          },
        },
      };
    });
    return { ok: true, ...request };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export async function requestBalance(input: { cents: number; note?: string }): Promise<Ok<{ id: string }> | Err> {
  const submitted = await submitBalanceRequest({
    cents: input.cents,
    referenceNote: input.note?.trim() || "Balance request",
  });
  if (!submitted.ok) return submitted;
  return { ok: true, id: submitted.id };
}

export async function listMyBalanceRequests(): Promise<BalanceRequest[]> {
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  if (!user) return [];
  return state.balanceRequests
    .filter((item) => item.userId === user.id)
    .slice(0, 20)
    .map((item) => ({
      id: item.id,
      userId: item.userId,
      username: item.username,
      cents: item.cents,
      currency: item.currency === "SYP" ? ("SYP" as const) : ("USD" as const),
      status: item.status,
      note: item.note,
      referenceNote: item.referenceNote,
      createdAt: item.createdAt,
    }));
}

function adminServiceOf(state: NovaState, slug: string): AdminService | null {
  const service = state.services.find((item) => item.slug === slug);
  if (!service) return null;
  return {
    id: service.id,
    name: service.name,
    nameAr: service.nameAr || "",
    slug: service.slug,
    category: service.category,
    description: service.description,
    descriptionAr: service.descriptionAr || "",
    instructions: service.instructions,
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
      const arabic = arabicFor(body.slug);
      const nameAr = body.nameAr.trim() || arabic?.nameAr || "";
      const descriptionAr = body.descriptionAr.trim() || arabic?.descriptionAr || "";
      if (!service) {
        service = {
          id: randomId("svc"),
          name: body.name,
          nameAr,
          slug: body.slug,
          category: body.category,
          description: body.description,
          descriptionAr,
          instructions: body.instructions,
          badge: body.badge.trim() ? body.badge.trim() : null,
          imageUrl: body.imageUrl.trim(),
          createdAt: new Date().toISOString(),
        };
        state.services.push(service);
      } else {
        service.name = body.name;
        service.slug = body.slug;
        service.category = body.category;
        service.description = body.description;
        service.instructions = body.instructions;
        service.badge = body.badge.trim() ? body.badge.trim() : null;
        service.imageUrl = body.imageUrl.trim();
        service.nameAr = nameAr;
        service.descriptionAr = descriptionAr;
      }
      state.deletedSlugs = (state.deletedSlugs ?? []).filter((slug) => slug !== body.slug);
      const serviceId = service.id;
      state.packages = state.packages.filter((pack) => pack.serviceId !== serviceId);
      const packs: StoredPackage[] = body.packages.map((pack, index) => ({
        id: pack.id && !pack.id.startsWith("draft-") ? pack.id : randomId("pkg"),
        serviceId,
        sizeName: pack.sizeName,
        normalPriceCents: pack.normalPriceCents,
        vipPriceCents: pack.vipPriceCents,
        normalPriceSypCents: pack.normalPriceSypCents ?? 0,
        vipPriceSypCents: pack.vipPriceSypCents ?? 0,
        apiEndpoint: pack.apiEndpoint,
        apiSecretCode: pack.apiSecretCode,
        sortOrder: index,
      }));
      state.packages.push(...packs);
      // Online database is the source of truth: a failed write aborts the save.
      await dbSaveService(service, packs);
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
      await dbDeleteService(service.id);
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
    revenueCents: state.orders
      .filter((order) => order.status !== "failed" && order.currency !== "SYP")
      .reduce((sum, order) => sum + order.priceCents, 0),
    revenueSypCents: state.orders
      .filter((order) => order.status !== "failed" && order.currency === "SYP")
      .reduce((sum, order) => sum + order.priceCents, 0),
    recent,
  };
}

let usersBackfilled = false;

function usersOf(state: NovaState): AdminUser[] {
  return [...state.users]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((user) => ({
      userId: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      balanceCents: user.balanceCents,
      currency: user.currency === "SYP" ? ("SYP" as const) : ("USD" as const),
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
    // Backfill the online users table (profile + currency + balance) once per session.
    if (dbOnline && !usersBackfilled) {
      usersBackfilled = true;
      void dbUpsertUsers(state.users).catch(() => (usersBackfilled = false));
    }
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
      target.balanceCents = Math.min(BALANCE_CAP, target.balanceCents + parsed.data.cents);
      pushTxn(state, {
        userId: target.id,
        kind: "admin_topup",
        cents: parsed.data.cents,
        currency: target.currency,
        note: `Added by ${actor.username}`,
      });
      pushRequest(state, {
        userId: target.id,
        username: target.username,
        cents: parsed.data.cents,
        currency: target.currency,
        status: "APPROVED",
        note: `Admin credit by ${actor.username}`,
        referenceNote: `Admin credit by ${actor.username}`,
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
      if ((request.currency ?? "USD") !== target.currency) {
        throw new Error("This request was made in a different currency than the user's wallet.");
      }
      target.balanceCents = Math.min(BALANCE_CAP, target.balanceCents + request.cents);
      request.status = "APPROVED";
      request.resolvedAt = new Date().toISOString();
      pushTxn(state, {
        userId: target.id,
        kind: "self_topup",
        cents: request.cents,
        currency: request.currency,
        note: `ShamCash ${request.referenceNote}`,
      });
      return { state, result: undefined };
    });
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
      await dbSaveSettings({ shamcashAddress: parsed.data.address });
      state.shamcashAddress = parsed.data.address;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export type OffersTicker = { text: string; textAr: string };

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
      await dbSaveSettings({ offersTickerText: parsed.data.text, offersTickerTextAr: parsed.data.textAr });
      state.offersTickerText = parsed.data.text;
      state.offersTickerTextAr = parsed.data.textAr;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/* ---------------- Store settings, currency & named DB-first API ---------------- */

export async function getStoreSettings(): Promise<StoreSettings> {
  await ensureReady();
  const state = memory ?? blankState();
  return {
    shamcashAddress: state.shamcashAddress || DEFAULT_SHAMCASH,
    offersTickerText: state.offersTickerText || DEFAULT_TICKER_EN,
    offersTickerTextAr: state.offersTickerTextAr || DEFAULT_TICKER_AR,
    sypRate: state.sypRate,
  };
}

export async function setSypRate(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = sypRateSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      await dbSaveSettings({ sypRate: parsed.data.rate });
      state.sypRate = parsed.data.rate;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

/** Admin: patch any store setting. Writes to store_settings first, then the local cache. */
export async function updateStoreSettings(
  patch: Partial<Pick<StoreSettings, "shamcashAddress" | "offersTickerText" | "offersTickerTextAr" | "sypRate">>,
): Promise<{ ok: true } | Err> {
  if (patch.shamcashAddress !== undefined) {
    const result = await setShamcashAddress({ address: patch.shamcashAddress });
    if (!result.ok) return result;
  }
  if (patch.offersTickerText !== undefined || patch.offersTickerTextAr !== undefined) {
    const current = await getOffersTicker();
    const result = await setOffersTicker({
      text: patch.offersTickerText ?? current.text,
      textAr: patch.offersTickerTextAr ?? current.textAr,
    });
    if (!result.ok) return result;
  }
  if (patch.sypRate !== undefined) {
    const result = await setSypRate({ rate: patch.sypRate });
    if (!result.ok) return result;
  }
  return { ok: true };
}

export async function createService(input: Omit<ServiceWrite, "id">): Promise<Ok<{ slug: string }> | Err> {
  return saveServiceAction({ ...input, id: undefined });
}

export async function updateService(input: ServiceWrite & { id: string }): Promise<Ok<{ slug: string }> | Err> {
  return saveServiceAction(input);
}

export async function deleteService(slug: string): Promise<{ ok: true } | Err> {
  return deleteServiceAction({ slug });
}

/** Forces a fresh read of catalog + settings from the online database (falls back to the local copy). */
export async function fetchStoreState(): Promise<{
  online: boolean;
  services: CatalogService[];
  settings: StoreSettings;
}> {
  await ensureReady();
  await enqueue(async () => {
    const overlay = await overlayDb(cloneState(memory ?? blankState()));
    if (overlay.changed && !writing) {
      memory = overlay.state;
      writeLocal(memory);
      emit();
    }
  });
  return { online: dbOnline, services: await getViewerCatalog(), settings: await getStoreSettings() };
}

/** Visitor-only currency preview. Signed-in users always see their account currency. */
export function setVisitorCurrency(currency: Currency): void {
  writePreviewCurrency(currency);
  emit();
}

export function getVisitorCurrency(): Currency {
  return readPreviewCurrency();
}

export const seededServiceCount = SEED_SERVICES.length;
export const seededPackageCount = SEED_PACKAGES.length;
