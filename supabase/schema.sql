-- ============================================================
-- NovaCharge — Database Schema
-- ============================================================

create type user_role as enum ('NORMAL', 'VIP', 'ADMIN');
create type transaction_status as enum ('PENDING', 'SUCCESS', 'FAILED');

-- ------------------------------------------------------------
-- Profiles (extends auth.users — never store role in a client-
-- editable table; every write to this table goes through a
-- server-side, RLS-protected path)
-- ------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  username text unique not null,
  email text unique not null,
  role user_role not null default 'NORMAL',
  balance numeric(12,2) not null default 0 check (balance >= 0),
  last_ip text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Categories
-- ------------------------------------------------------------
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null
);

-- ------------------------------------------------------------
-- Services (a "slug" — e.g. a specific game or app)
-- ------------------------------------------------------------
create table services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  slug text unique not null,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Packages (charge sizes belonging to a service)
-- api_endpoint / api_secret_code must NEVER be selectable by
-- anon/authenticated roles directly — only by the service-role
-- key inside a Server Action. See RLS policies below.
-- ------------------------------------------------------------
create table packages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  size_name text not null,
  normal_price numeric(10,2) not null check (normal_price >= 0),
  vip_price numeric(10,2) not null check (vip_price >= 0),
  api_endpoint text not null,
  api_secret_code text not null,
  created_at timestamptz not null default now()
);

-- Public-safe view: exposes everything EXCEPT the endpoint/secret.
-- All client reads should go through this view, never the base table.
create view packages_public as
  select id, service_id, size_name, normal_price, vip_price, created_at
  from packages;

-- ------------------------------------------------------------
-- Transactions
-- ------------------------------------------------------------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  package_id uuid not null references packages(id),
  target_account_id text not null,
  amount_deducted numeric(10,2) not null,
  status transaction_status not null default 'PENDING',
  ip_address text,
  created_at timestamptz not null default now()
);

create index idx_transactions_created_at on transactions(created_at desc);
create index idx_services_category on services(category_id);
create index idx_packages_service on packages(service_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table categories enable row level security;
alter table services enable row level security;
alter table packages enable row level security;
alter table transactions enable row level security;

-- Profiles: users can read/update only their own row; nobody can
-- change their own `role` or `balance` directly (those columns are
-- only ever written by service-role server actions).
create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own_limited" on profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);
-- NOTE: enforce the "no self-editing role/balance" rule with a
-- BEFORE UPDATE trigger (below), since RLS alone can't restrict
-- column-level writes within an allowed row.

create or replace function prevent_role_balance_self_edit()
returns trigger as $$
begin
  if (new.role <> old.role or new.balance <> old.balance)
     and auth.uid() = old.id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Cannot modify role or balance directly';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_prevent_role_balance_self_edit
  before update on profiles
  for each row execute function prevent_role_balance_self_edit();

-- Categories & services: publicly readable, writable only by admins.
create policy "categories_select_all" on categories for select using (true);
create policy "services_select_active" on services for select using (is_active = true);

create policy "categories_admin_write" on categories
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN')
  );

create policy "services_admin_write" on services
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN')
  );

-- Packages: base table is locked down entirely (no anon/authenticated
-- select) because it holds api_secret_code. Only service_role
-- (used inside Server Actions) can read it. The `packages_public`
-- view is what the client-facing pages actually query.
create policy "packages_no_direct_client_access" on packages
  for select using (false);

create policy "packages_admin_write" on packages
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN')
  );

-- Transactions: users see only their own; admins see all.
create policy "transactions_select_own_or_admin" on transactions
  for select using (
    auth.uid() = user_id
    or exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN')
  );

-- Inserts to transactions only ever happen via the service-role
-- key inside purchaseAction — no direct client insert policy is
-- defined, so it's denied by default.

-- ============================================================
-- Seed: categories
-- ============================================================
insert into categories (name, slug) values
  ('Games', 'games'),
  ('Apps', 'apps'),
  ('Subscriptions', 'subscriptions'),
  ('Mobile Charge', 'mobile-charge');

-- ============================================================
-- Atomic balance RPCs — used by Server Actions instead of a
-- read-then-write from application code, so concurrent purchases
-- or top-ups can't race each other.
-- ============================================================
create or replace function deduct_balance(p_user_id uuid, p_amount numeric)
returns void as $$
begin
  update profiles
  set balance = balance - p_amount
  where id = p_user_id and balance >= p_amount;

  if not found then
    raise exception 'Insufficient balance';
  end if;
end;
$$ language plpgsql security definer;

create or replace function refund_balance(p_user_id uuid, p_amount numeric)
returns void as $$
begin
  update profiles set balance = balance + p_amount where id = p_user_id;
end;
$$ language plpgsql security definer;

create or replace function increment_balance(p_user_id uuid, p_amount numeric)
returns void as $$
begin
  update profiles set balance = balance + p_amount where id = p_user_id;
end;
$$ language plpgsql security definer;

-- These run as security definer so the service-role caller can execute
-- them, but the balance/role self-edit trigger above still applies to
-- any *direct* table update attempted by a regular user session.

-- ============================================================
-- Admin account seeding
-- ------------------------------------------------------------
-- Do NOT hardcode a plaintext password anywhere in app code.
-- Create the auth user via the Supabase Admin API (service-role
-- key, run once from a trusted server/script — see
-- scripts/seed-admin.ts) so the password is bcrypt-hashed by
-- Supabase Auth itself. That script then upserts the matching
-- `profiles` row with role = 'ADMIN':
--
--   insert into profiles (id, name, username, email, role, balance)
--   values ('<uid-from-auth-user>', 'Majd', 'majd', 'majd@elmadani.com', 'ADMIN', 0)
--   on conflict (id) do update set role = 'ADMIN';
--
-- Change the seeded password immediately after first login in a
-- real deployment, and keep it out of version control.
-- ============================================================
