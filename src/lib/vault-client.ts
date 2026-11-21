"use client";

import { whenSynced } from "@/lib/store/api";
import { SESSION_KEY } from "@/lib/store/data";
import { getSupabase } from "@/lib/supabase";

import type { VaultType } from "@/lib/store/types";

/** What the buyer sees for a vault order: a redeem code, or an account (email + password). */
export type RevealedPiece = {
  vaultType?: VaultType;
  redeemCode?: string;
  pinOrSerial?: string;
  email: string;
  password: string;
  extraInfo: string;
  packageId?: string;
  receiptNumber?: string;
  soldAt?: string;
  orderId?: string;
};

/** v30: live stock for a vault service — total, per package size, and pieces for "any size". */
export type VaultStock = { available: number | null; byPackage: Record<string, number>; shared: number };

/** Stock for one package size (its own pieces + pieces saved for any size). */
export function packageStock(stock: VaultStock | null, packageId: string): number | null {
  if (!stock || stock.available == null) return null;
  return (stock.byPackage[packageId] ?? 0) + stock.shared;
}

function token(): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

/** v35: the owner's verified Supabase token (only the owner's browser holds one). */
async function ownerBearer(): Promise<Record<string, string>> {
  try {
    const session = (await getSupabase()?.auth.getSession())?.data.session;
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch {
    return {};
  }
}

async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(url.endsWith("/admin") ? await ownerBearer() : {}) },
    body: JSON.stringify({ token: token(), ...body }),
  });
  return (await response.json().catch(() => ({ ok: false, error: `Server answered ${response.status}.` }))) as T;
}

/** Public stock counts for a vault service (null = unknown / not configured). */
export async function getVaultStock(serviceId: string): Promise<VaultStock> {
  try {
    const response = await fetch(`/api/vault/stock?serviceId=${encodeURIComponent(serviceId)}`, { cache: "no-store" });
    const data = (await response.json()) as Partial<VaultStock>;
    return { available: typeof data.available === "number" ? data.available : null, byPackage: data.byPackage ?? {}, shared: data.shared ?? 0 };
  } catch {
    return { available: null, byPackage: {}, shared: 0 };
  }
}

/** Claims the piece for a just-paid vault order (waits for the order to finish uploading first). */
export async function claimVault(orderId: string): Promise<{ ok: true; item: RevealedPiece } | { ok: false; error: string }> {
  await whenSynced();
  return post("/api/vault/claim", { orderId });
}

export async function listMyVault(): Promise<RevealedPiece[]> {
  const result = await post<{ ok: boolean; items?: RevealedPiece[] }>("/api/vault/mine", {});
  return result.ok ? (result.items ?? []) : [];
}

export type AdminPiece = RevealedPiece & { id: string; packageId: string; vaultType: VaultType; status: "AVAILABLE" | "SOLD"; buyer: string | null; createdAt: string };
export type NewPiece = { vaultType: VaultType; redeemCode?: string; pinOrSerial?: string; email?: string; password?: string; extraInfo: string };
export type AdminVaultList = {
  ok: boolean;
  error?: string;
  needsSql?: boolean;
  upgraded?: boolean;
  packages?: Array<{ id: string; sizeName: string }>;
  stock?: Record<string, number>;
  shared?: number;
  available?: number;
  sold?: number;
  items?: AdminPiece[];
};

export function adminVault(action: "list", serviceId: string, packageId: string): Promise<AdminVaultList>;
export function adminVault(action: "add", serviceId: string, packageId: string, items: NewPiece[]): Promise<{ ok: boolean; error?: string; needsSql?: boolean; added?: number }>;
export function adminVault(action: "delete", serviceId: string, packageId: string, id: string): Promise<{ ok: boolean; error?: string; needsSql?: boolean }>;
export function adminVault(action: "list" | "add" | "delete", serviceId: string, packageId: string, extra?: unknown) {
  return post("/api/vault/admin", {
    action,
    serviceId,
    packageId,
    ...(action === "add" ? { items: extra } : action === "delete" ? { id: extra } : {}),
  });
}
