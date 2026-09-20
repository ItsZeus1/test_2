import type { PackagePublic, UserRole } from "@/types";

/**
 * The single source of truth for "which price does this user see/pay".
 * Used both for rendering (client) and for re-verifying the charge
 * amount server-side inside the purchase Server Action — never trust
 * a price passed up from the client.
 */
export function getPriceForRole(pkg: PackagePublic, role: UserRole): number {
  return role === "VIP" || role === "ADMIN" ? pkg.vip_price : pkg.normal_price;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}
