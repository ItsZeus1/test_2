export type UserRole = "USER" | "ADMIN";
export type OrderStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface Game {
  id: string;
  title: string;
  slug: string;
  publisher: string | null;
  image_url: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  game_id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  product_id: string;
  status: OrderStatus;
  amount: number;
  created_at: string;
  // joined fields, populated by the dashboard query
  products?: {
    name: string;
    games?: {
      title: string;
    } | null;
  } | null;
  secret_codes?: { code_string: string }[];
}

export interface SecretCode {
  id: string;
  product_id: string;
  code_string: string;
  is_used: boolean;
  order_id: string | null;
  created_at: string;
}

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string };
