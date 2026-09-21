export type UserRole = "NORMAL" | "VIP" | "ADMIN";
export type TransactionStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface Profile {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  balance: number;
  last_ip?: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Service {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  image_url?: string | null;
  is_active: boolean;
  created_at: string;
}

/** Client-safe package shape — no api_endpoint / api_secret_code. */
export interface PackagePublic {
  id: string;
  service_id: string;
  size_name: string;
  normal_price: number;
  vip_price: number;
  created_at: string;
}

/** Server-only shape — never send this to the client. */
export interface PackagePrivate extends PackagePublic {
  api_endpoint: string;
  api_secret_code: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  package_id: string;
  target_account_id: string;
  amount_deducted: number;
  status: TransactionStatus;
  ip_address?: string | null;
  created_at: string;
  // Joined fields for the admin feed:
  user_name?: string;
  service_name?: string;
  size_name?: string;
}

export interface AdminMetrics {
  activeSessions: number;
  totalActiveServices: number;
  totalRevenue: number;
}
