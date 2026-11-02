/**
 * Relational online database layer (Supabase tables from migrations/0002_novacharge.sql).
 * Catalog (services + service_packages) and store_settings are the source of truth here.
 * users is a profile mirror (currency, role, balance) without password material.
 *
 * Every function returns "offline" when Supabase env vars are missing or the tables
 * have not been created yet, so callers can fall back to the local/blob copy.
 */
import { getSupabase } from "@/lib/supabase";
import { asCurrency, asRate, type StoredPackage, type StoredService, type StoredUser } from "@/lib/store/data";
import { isCategory } from "@/lib/store/types";

export type DbOffline = "offline";

export type DbSettings = {
  shamcashAddress: string;
  offersTickerText: string;
  offersTickerTextAr: string;
  sypRate: number;
  catalogSeeded: boolean;
};

type PgError = { code?: string; message?: string } | null;

const SETTINGS_ID = "primary";
let tablesMissing = false;
let lastError = "";

function missing(error: PgError): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table")
  );
}

function client() {
  if (tablesMissing) return null;
  return getSupabase();
}

function check(error: PgError): DbOffline | null {
  if (!error) return null;
  if (missing(error)) {
    tablesMissing = true;
    lastError = "Online tables are missing. Run migrations/0002_novacharge.sql in Supabase.";
    return "offline";
  }
  lastError = error.message || "Database request failed.";
  throw new Error(lastError);
}

export function dbStatus(): { online: boolean; detail: string } {
  return { online: !tablesMissing && getSupabase() !== null, detail: lastError };
}

/* ----------------------------- catalog ----------------------------- */

type ServiceRow = {
  id: string;
  slug: string;
  name: string;
  name_ar: string | null;
  category: string;
  description: string | null;
  description_ar: string | null;
  instructions: string | null;
  badge: string | null;
  image_url: string | null;
  created_at: string | null;
};

type PackageRow = {
  id: string;
  service_id: string;
  size_name: string;
  price_usd_cents: number | null;
  vip_price_usd_cents: number | null;
  price_syp_cents: number | string | null;
  vip_price_syp_cents: number | string | null;
  api_endpoint: string | null;
  api_secret_code: string | null;
  sort_order: number | null;
};

function toService(row: ServiceRow): StoredService {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameAr: row.name_ar ?? "",
    category: isCategory(row.category) ? row.category : "games",
    description: row.description ?? "",
    descriptionAr: row.description_ar ?? "",
    instructions: row.instructions ?? "",
    badge: row.badge && row.badge.trim() ? row.badge : null,
    imageUrl: row.image_url ?? "",
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function toPackage(row: PackageRow): StoredPackage {
  return {
    id: row.id,
    serviceId: row.service_id,
    sizeName: row.size_name,
    normalPriceCents: Number(row.price_usd_cents) || 0,
    vipPriceCents: Number(row.vip_price_usd_cents) || 0,
    normalPriceSypCents: Number(row.price_syp_cents) || 0,
    vipPriceSypCents: Number(row.vip_price_syp_cents) || 0,
    apiEndpoint: row.api_endpoint ?? "",
    apiSecretCode: row.api_secret_code ?? "",
    sortOrder: Number(row.sort_order) || 0,
  };
}

function serviceRow(service: StoredService) {
  return {
    id: service.id,
    slug: service.slug,
    name: service.name,
    name_ar: service.nameAr ?? "",
    category: service.category,
    description: service.description,
    description_ar: service.descriptionAr ?? "",
    instructions: service.instructions,
    badge: service.badge,
    image_url: service.imageUrl ?? "",
    created_at: service.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function packageRow(pack: StoredPackage) {
  return {
    id: pack.id,
    service_id: pack.serviceId,
    size_name: pack.sizeName,
    price_usd_cents: pack.normalPriceCents,
    vip_price_usd_cents: pack.vipPriceCents,
    price_syp_cents: pack.normalPriceSypCents ?? 0,
    vip_price_syp_cents: pack.vipPriceSypCents ?? 0,
    api_endpoint: pack.apiEndpoint,
    api_secret_code: pack.apiSecretCode,
    sort_order: pack.sortOrder,
    updated_at: new Date().toISOString(),
  };
}

export async function dbFetchCatalog(): Promise<{ services: StoredService[]; packages: StoredPackage[] } | DbOffline> {
  const db = client();
  if (!db) return "offline";
  const [services, packages] = await Promise.all([
    db.from("services").select("*"),
    db.from("service_packages").select("*").order("sort_order", { ascending: true }),
  ]);
  const bad = check(services.error) ?? check(packages.error);
  if (bad) return bad;
  return {
    services: ((services.data ?? []) as ServiceRow[]).map(toService),
    packages: ((packages.data ?? []) as PackageRow[]).map(toPackage),
  };
}

/** Upserts one service and replaces its packages. */
export async function dbSaveService(service: StoredService, packages: StoredPackage[]): Promise<"ok" | DbOffline> {
  const db = client();
  if (!db) return "offline";
  const saved = await db.from("services").upsert(serviceRow(service), { onConflict: "id" });
  const bad = check(saved.error);
  if (bad) return bad;
  const keep = packages.map((pack) => pack.id);
  let prune = db.from("service_packages").delete().eq("service_id", service.id);
  if (keep.length) prune = prune.not("id", "in", `(${keep.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`);
  const pruned = await prune;
  check(pruned.error);
  if (packages.length) {
    const upserted = await db.from("service_packages").upsert(packages.map(packageRow), { onConflict: "id" });
    check(upserted.error);
  }
  return "ok";
}

export async function dbDeleteService(serviceId: string): Promise<"ok" | DbOffline> {
  const db = client();
  if (!db) return "offline";
  const packs = await db.from("service_packages").delete().eq("service_id", serviceId);
  const bad = check(packs.error);
  if (bad) return bad;
  const removed = await db.from("services").delete().eq("id", serviceId);
  check(removed.error);
  return "ok";
}

/** One-time bulk seed of the catalog into an empty database. */
export async function dbSeedCatalog(services: StoredService[], packages: StoredPackage[]): Promise<"ok" | DbOffline> {
  const db = client();
  if (!db) return "offline";
  if (services.length) {
    const saved = await db.from("services").upsert(services.map(serviceRow), { onConflict: "id" });
    const bad = check(saved.error);
    if (bad) return bad;
  }
  const ids = new Set(services.map((service) => service.id));
  const owned = packages.filter((pack) => ids.has(pack.serviceId));
  if (owned.length) {
    const saved = await db.from("service_packages").upsert(owned.map(packageRow), { onConflict: "id" });
    check(saved.error);
  }
  return dbSaveSettings({ catalogSeeded: true });
}

/* ----------------------------- settings ----------------------------- */

export async function dbFetchSettings(): Promise<DbSettings | null | DbOffline> {
  const db = client();
  if (!db) return "offline";
  const { data, error } = await db.from("store_settings").select("*").eq("id", SETTINGS_ID).maybeSingle();
  const bad = check(error);
  if (bad) return bad;
  if (!data) return null;
  const row = data as {
    shamcash_address?: unknown;
    offers_ticker_text?: unknown;
    offers_ticker_text_ar?: unknown;
    syp_rate?: unknown;
    catalog_seeded?: unknown;
  };
  return {
    shamcashAddress: typeof row.shamcash_address === "string" ? row.shamcash_address : "",
    offersTickerText: typeof row.offers_ticker_text === "string" ? row.offers_ticker_text : "",
    offersTickerTextAr: typeof row.offers_ticker_text_ar === "string" ? row.offers_ticker_text_ar : "",
    sypRate: asRate(row.syp_rate),
    catalogSeeded: row.catalog_seeded === true,
  };
}

export async function dbSaveSettings(patch: Partial<DbSettings>): Promise<"ok" | DbOffline> {
  const db = client();
  if (!db) return "offline";
  const row: Record<string, unknown> = { id: SETTINGS_ID, updated_at: new Date().toISOString() };
  if (patch.shamcashAddress !== undefined) row["shamcash_address"] = patch.shamcashAddress;
  if (patch.offersTickerText !== undefined) row["offers_ticker_text"] = patch.offersTickerText;
  if (patch.offersTickerTextAr !== undefined) row["offers_ticker_text_ar"] = patch.offersTickerTextAr;
  if (patch.sypRate !== undefined) row["syp_rate"] = patch.sypRate;
  if (patch.catalogSeeded !== undefined) row["catalog_seeded"] = patch.catalogSeeded;
  const { error } = await db.from("store_settings").upsert(row, { onConflict: "id" });
  const bad = check(error);
  return bad ?? "ok";
}

/* ------------------------------ users ------------------------------ */

export async function dbUpsertUsers(users: StoredUser[]): Promise<"ok" | DbOffline> {
  const db = client();
  if (!db || users.length === 0) return db ? "ok" : "offline";
  const now = new Date().toISOString();
  const { error } = await db.from("users").upsert(
    users.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email.toLowerCase(),
      phone: user.phone ?? "",
      role: user.role,
      currency: asCurrency(user.currency),
      balance_cents: user.balanceCents,
      is_blocked: user.isBlocked === true,
      created_at: user.createdAt,
      updated_at: now,
    })),
    { onConflict: "id" },
  );
  const bad = check(error);
  return bad ?? "ok";
}
