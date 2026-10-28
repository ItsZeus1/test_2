import { getSupabase, supabaseEnv } from "@/lib/supabase";
import {
  ADMIN_BALANCE_CENTS,
  ADMIN_EMAIL,
  ADMIN_NAME,
  ADMIN_PASSWORD,
  ADMIN_USER_ID,
  ADMIN_USERNAME,
  DEFAULT_SHAMCASH,
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
  mergeSeedCatalog,
  normalizeState,
  priceFor,
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
  OrderRow,
  Profile,
  Role,
  ServiceDetail,
  ServiceWrite,
} from "@/lib/store/types";
import {
  adminRoleSchema,
  adminTopUpSchema,
  balanceRequestSchema,
  loginSchema,
  purchaseSchema,
  registerSchema,
  requestIdSchema,
  serviceWriteSchema,
  shamcashSchema,
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
  window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
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
      passwordHash: hashed.passwordHash,
      passwordSalt: hashed.passwordSalt,
      role: "ADMIN",
      balanceCents: ADMIN_BALANCE_CENTS,
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
  let remote: NovaState | null = null;
  try {
    remote = await pullCloud();
  } catch (error) {
    mode = "local";
    modeDetail = fail(error);
  }
  const healed = await heal(prefer(local, remote));
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
      const remote = await pullCloud();
      if (!remote || remote.version < current.version) {
        if (supabaseEnv().enabled) await pushCloud(current);
        return;
      }
      if (remote.version === current.version) return;
      memory = await heal(remote);
      writeLocal(memory);
      emit();
    });
  }, 6000);
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
          memory = await heal(remote);
          writeLocal(memory);
          continue;
        }
        memory = drafted.state;
        writeLocal(drafted.state);
        try {
          await pushCloud(drafted.state);
        } catch (error) {
          modeDetail = fail(error);
        }
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

function requireAdmin(user: StoredUser): void {
  if (user.role !== "ADMIN") throw new Error("Admin access only.");
}

function mapOrder(order: StoredOrder): OrderRow {
  return {
    id: order.id,
    serviceName: order.serviceName,
    serviceSlug: order.serviceSlug,
    packageName: order.packageName,
    targetId: order.targetId,
    priceCents: order.priceCents,
    status: order.status,
    fulfillmentRef: order.fulfillmentRef,
    createdAt: order.createdAt,
  };
}

function catalogOf(state: NovaState, role: Role | null): CatalogService[] {
  return state.services
    .map((service) => {
      const packs = state.packages.filter((pack) => pack.serviceId === service.id);
      const starting = packs.reduce((min, pack) => {
        const price = priceFor(role, pack.normalPriceCents, pack.vipPriceCents);
        return Math.min(min, price);
      }, packs[0] ? priceFor(role, packs[0].normalPriceCents, packs[0].vipPriceCents) : 0);
      return {
        id: service.id,
        name: service.name,
        slug: service.slug,
        category: service.category,
        description: service.description,
        badge: service.badge,
        imageUrl: service.imageUrl || "",
        startingPriceCents: starting,
        rate: rateFor(role),
      };
    })
    .sort((left, right) => {
      const category = CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category);
      if (category !== 0) return category;
      return left.name.localeCompare(right.name);
    });
}

function detailOf(state: NovaState, slug: string, role: Role | null): ServiceDetail | null {
  const service = state.services.find((item) => item.slug === slug);
  if (!service) return null;
  const packages = state.packages
    .filter((pack) => pack.serviceId === service.id)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((pack) => ({
      id: pack.id,
      sizeName: pack.sizeName,
      priceCents: priceFor(role, pack.normalPriceCents, pack.vipPriceCents),
      rate: rateFor(role),
    }));
  const starting = packages.reduce((min, pack) => Math.min(min, pack.priceCents), packages[0]?.priceCents ?? 0);
  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    category: service.category,
    description: service.description,
    badge: service.badge,
    imageUrl: service.imageUrl || "",
    instructions: service.instructions,
    targetLabel: serviceTargetLabel(service.category),
    startingPriceCents: starting,
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
        passwordHash: hashed.passwordHash,
        passwordSalt: hashed.passwordSalt,
        role: admin ? "ADMIN" : "NORMAL",
        balanceCents: admin ? ADMIN_BALANCE_CENTS : 0,
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
  return catalogOf(memory ?? blankState(), null);
}

export async function getViewerCatalog(): Promise<CatalogService[]> {
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  return catalogOf(state, user?.role ?? null);
}

export async function getPublicService(input: unknown): Promise<ServiceDetail | null> {
  const parsed = slugSchema.parse(unwrap(input));
  await ensureReady();
  return detailOf(memory ?? blankState(), parsed.slug, null);
}

export async function getViewerService(input: unknown): Promise<ServiceDetail | null> {
  const parsed = slugSchema.parse(unwrap(input));
  await ensureReady();
  const state = memory ?? blankState();
  const user = await currentUser(state);
  return detailOf(state, parsed.slug, user?.role ?? null);
}

export async function purchase(input: unknown): Promise<Ok<{ order: OrderRow; profile: Profile }> | Err> {
  const parsed = purchaseSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    const ip = await clientIp();
    const outcome = await commit(async (state) => {
      const user = requireUser(await currentUser(state));
      const pack = state.packages.find((item) => item.id === parsed.data.packageId);
      if (!pack) throw new Error("That charge size is no longer available.");
      const service = state.services.find((item) => item.id === pack.serviceId);
      if (!service) throw new Error("That service is no longer available.");
      const price = priceFor(user.role, pack.normalPriceCents, pack.vipPriceCents);
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
      const id = pushRequest(state, {
        userId: user.id,
        username: user.username,
        cents: parsed.data.cents,
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
    slug: service.slug,
    category: service.category,
    description: service.description,
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
      if (!service) {
        service = {
          id: randomId("svc"),
          name: body.name,
          slug: body.slug,
          category: body.category,
          description: body.description,
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
      }
      const serviceId = service.id;
      state.packages = state.packages.filter((pack) => pack.serviceId !== serviceId);
      body.packages.forEach((pack, index) => {
        const stored: StoredPackage = {
          id: pack.id && !pack.id.startsWith("draft-") ? pack.id : randomId("pkg"),
          serviceId,
          sizeName: pack.sizeName,
          normalPriceCents: pack.normalPriceCents,
          vipPriceCents: pack.vipPriceCents,
          apiEndpoint: pack.apiEndpoint,
          apiSecretCode: pack.apiSecretCode,
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
      .filter((order) => order.status !== "failed")
      .reduce((sum, order) => sum + order.priceCents, 0),
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
      balanceCents: user.balanceCents,
      lastIp: user.lastIp,
      lastSeenAt: user.lastSeenAt,
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

export async function setUserRole(input: unknown): Promise<{ ok: true } | Err> {
  const parsed = adminRoleSchema.safeParse(unwrap(input));
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  try {
    await commit(async (state) => {
      requireAdmin(requireUser(await currentUser(state)));
      const target = state.users.find((user) => user.id === parsed.data.userId);
      if (!target) throw new Error("User not found.");
      target.role = isAdminEmail(target.email) ? "ADMIN" : parsed.data.role;
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
        note: `Added by ${actor.username}`,
      });
      pushRequest(state, {
        userId: target.id,
        username: target.username,
        cents: parsed.data.cents,
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
      target.balanceCents = Math.min(BALANCE_CAP, target.balanceCents + request.cents);
      request.status = "APPROVED";
      request.resolvedAt = new Date().toISOString();
      pushTxn(state, {
        userId: target.id,
        kind: "self_topup",
        cents: request.cents,
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
      state.shamcashAddress = parsed.data.address;
      return { state, result: undefined };
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: fail(error) };
  }
}

export const seededServiceCount = SEED_SERVICES.length;
export const seededPackageCount = SEED_PACKAGES.length;
