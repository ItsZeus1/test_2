import { clsx, type ClassValue } from "clsx";
import type { Role } from "./types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(amount) || 0
  );
}

/** The single rule for which price a viewer pays. */
export function priceForRole(role: Role | "GUEST", normal: number, vip: number): number {
  return role === "VIP" || role === "ADMIN" ? Number(vip) : Number(normal);
}

export function isPlaceholderEndpoint(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host.endsWith(".invalid") ||
      host.endsWith(".example") ||
      host.endsWith(".test") ||
      host === "example.com" ||
      host.endsWith(".example.com")
    );
  } catch {
    return true;
  }
}

/** Deterministic artwork gradient for services without an image. */
export function gradientFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  const h2 = (hash + 55) % 360;
  return `linear-gradient(145deg, hsl(${hash} 70% 38%) 0%, hsl(${h2} 75% 16%) 100%)`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
