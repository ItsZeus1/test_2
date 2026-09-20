/**
 * In-memory mock "database" — same shapes as supabase/schema.sql, so
 * every component can be built against a stable interface now and
 * swapped for real Supabase calls later without touching UI code.
 *
 * IMPORTANT: this module is for local development / UI-first building
 * only. `api_secret_code` values below are placeholders and must never
 * ship to a client bundle — in the real app they only ever live in the
 * `packages` table, read exclusively inside Server Actions.
 */
import type {
  Profile,
  Category,
  Service,
  PackagePrivate,
  PackagePublic,
  Transaction,
} from "@/types";

export const mockCategories: Category[] = [
  { id: "cat_games", name: "Games", slug: "games" },
  { id: "cat_apps", name: "Apps", slug: "apps" },
  { id: "cat_subs", name: "Subscriptions", slug: "subscriptions" },
  { id: "cat_mobile", name: "Mobile Charge", slug: "mobile-charge" },
];

export const mockServices: Service[] = [
  {
    id: "svc_valorant",
    category_id: "cat_games",
    name: "Valorant",
    slug: "valorant",
    image_url: "/images/services/valorant.jpg",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "svc_pubgm",
    category_id: "cat_games",
    name: "PUBG Mobile",
    slug: "pubg-mobile",
    image_url: "/images/services/pubgm.jpg",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "svc_netflix",
    category_id: "cat_subs",
    name: "Netflix Gift Card",
    slug: "netflix",
    image_url: "/images/services/netflix.jpg",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
];

/** Private table — server-only. Never import this into a client component. */
export const mockPackagesPrivate: PackagePrivate[] = [
  {
    id: "pkg_valorant_1",
    service_id: "svc_valorant",
    size_name: "125 VP",
    normal_price: 1.29,
    vip_price: 1.09,
    api_endpoint: "https://provider.example.com/api/valorant/topup",
    api_secret_code: "sk_live_REPLACE_ME",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "pkg_valorant_2",
    service_id: "svc_valorant",
    size_name: "420 VP",
    normal_price: 3.99,
    vip_price: 3.49,
    api_endpoint: "https://provider.example.com/api/valorant/topup",
    api_secret_code: "sk_live_REPLACE_ME",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "pkg_pubgm_1",
    service_id: "svc_pubgm",
    size_name: "60 UC",
    normal_price: 0.99,
    vip_price: 0.85,
    api_endpoint: "https://provider.example.com/api/pubgm/topup",
    api_secret_code: "sk_live_REPLACE_ME",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "pkg_netflix_1",
    service_id: "svc_netflix",
    size_name: "$25 Gift Card",
    normal_price: 25,
    vip_price: 23.5,
    api_endpoint: "https://provider.example.com/api/netflix/giftcard",
    api_secret_code: "sk_live_REPLACE_ME",
    created_at: "2026-01-01T00:00:00Z",
  },
];

/** Client-safe derived view — strips endpoint/secret, mirrors `packages_public`. */
export const mockPackagesPublic: PackagePublic[] = mockPackagesPrivate.map(
  ({ api_endpoint, api_secret_code, ...rest }) => rest
);

export const mockUsers: Profile[] = [
  {
    id: "usr_admin",
    name: "Majd",
    username: "majd",
    email: "majd@elmadani.com",
    role: "ADMIN",
    balance: 0,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "usr_normal_1",
    name: "Sam Rivera",
    username: "samr",
    email: "sam@example.com",
    role: "NORMAL",
    balance: 42.5,
    created_at: "2026-02-10T00:00:00Z",
  },
  {
    id: "usr_vip_1",
    name: "Jordan Lee",
    username: "jlee",
    email: "jordan@example.com",
    role: "VIP",
    balance: 150,
    created_at: "2026-02-15T00:00:00Z",
  },
];

export const mockTransactions: Transaction[] = [
  {
    id: "txn_1",
    user_id: "usr_normal_1",
    package_id: "pkg_valorant_1",
    target_account_id: "SamR#1234",
    amount_deducted: 1.29,
    status: "SUCCESS",
    ip_address: "203.0.113.5",
    created_at: "2026-09-18T14:22:00Z",
    user_name: "Sam Rivera",
    service_name: "Valorant",
    size_name: "125 VP",
  },
  {
    id: "txn_2",
    user_id: "usr_vip_1",
    package_id: "pkg_netflix_1",
    target_account_id: "jordan@example.com",
    amount_deducted: 23.5,
    status: "SUCCESS",
    ip_address: "198.51.100.9",
    created_at: "2026-09-19T09:05:00Z",
    user_name: "Jordan Lee",
    service_name: "Netflix Gift Card",
    size_name: "$25 Gift Card",
  },
];

// ---- Simple mock "queries" (swap for Supabase calls later) ----

export function getCategoryBySlug(slug: string) {
  return mockCategories.find((c) => c.slug === slug) ?? null;
}

export function getServicesByCategory(categoryId: string) {
  return mockServices.filter((s) => s.category_id === categoryId && s.is_active);
}

export function getServiceBySlug(slug: string) {
  return mockServices.find((s) => s.slug === slug) ?? null;
}

export function getPublicPackagesForService(serviceId: string): PackagePublic[] {
  return mockPackagesPublic.filter((p) => p.service_id === serviceId);
}

/** Server-only lookup — mirrors a service-role query against `packages`. */
export function getPrivatePackageById(id: string): PackagePrivate | null {
  return mockPackagesPrivate.find((p) => p.id === id) ?? null;
}
