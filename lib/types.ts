import type { CategorySlug } from "./constants";

export type Role = "NORMAL" | "VIP" | "ADMIN";
export type OrderStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface Profile {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  balance: number;
  last_ip: string | null;
  last_seen: string | null;
  created_at: string;
}

export interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  category: CategorySlug;
  image_url: string | null;
  description: string | null;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
}

export interface StoreService extends ServiceRow {
  starting_price: number | null;
  is_favorite: boolean;
}

/** Client-safe package: only the price that applies to the viewer's role. */
export interface PublicPackage {
  id: string;
  size_name: string;
  price: number;
}

export interface TransactionRow {
  id: string;
  user_id: string;
  service_id: string | null;
  package_id: string | null;
  service_name: string;
  size_name: string;
  target_account_id: string;
  amount_paid: number;
  user_ip: string | null;
  status: OrderStatus;
  created_at: string;
}

export interface BalanceRequestRow {
  id: string;
  user_id: string;
  amount: number;
  payment_method: string;
  reference_note: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: string;
  user_name?: string;
  user_username?: string;
}
