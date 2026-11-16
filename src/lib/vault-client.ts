"use client";

import { whenSynced } from "@/lib/store/api";
import { SESSION_KEY } from "@/lib/store/data";

export type RevealedPiece = { email: string; password: string; extraInfo: string; receiptNumber?: string; soldAt?: string; orderId?: string };

function token(): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

async function post<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token(), ...body }),
  });
  return (await response.json().catch(() => ({ ok: false, error: `Server answered ${response.status}.` }))) as T;
}

/** Public stock count for a vault service (null = unknown / not configured). */
export async function getVaultStock(serviceId: string): Promise<number | null> {
  try {
    const response = await fetch(`/api/vault/stock?serviceId=${encodeURIComponent(serviceId)}`, { cache: "no-store" });
    const data = (await response.json()) as { available: number | null };
    return data.available;
  } catch {
    return null;
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

export type AdminPiece = RevealedPiece & { id: string; status: "AVAILABLE" | "SOLD"; buyer: string | null; createdAt: string };

export function adminVault(action: "list", serviceId: string): Promise<{ ok: boolean; error?: string; needsSql?: boolean; available?: number; sold?: number; items?: AdminPiece[] }>;
export function adminVault(action: "add", serviceId: string, items: Array<{ email: string; password: string; extraInfo: string }>): Promise<{ ok: boolean; error?: string; needsSql?: boolean; added?: number }>;
export function adminVault(action: "delete", serviceId: string, id: string): Promise<{ ok: boolean; error?: string; needsSql?: boolean }>;
export function adminVault(action: "list" | "add" | "delete", serviceId: string, extra?: unknown) {
  return post("/api/vault/admin", {
    action,
    serviceId,
    ...(action === "add" ? { items: extra } : action === "delete" ? { id: extra } : {}),
  });
}
