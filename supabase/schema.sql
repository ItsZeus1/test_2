-- =========================================================
-- GAME TOP-UP & DIGITAL CODE STORE — FULL SUPABASE SCHEMA
-- Run this once, top to bottom, in the Supabase SQL Editor.
-- =========================================================

-- 0. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 1. ROLE + STATUS ENUMS
create type public.user_role as enum ('USER', 'ADMIN');
create type public.order_status as enum ('PENDING', 'COMPLETED', 'FAILED');

-- =========================================================
-- 2. PROFILES TABLE (linked 1:1 with auth.users)
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role user_role not null default 'USER',
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'USER'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- 3. GAMES
-- =========================================================
create table public.games (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  slug text not null unique,
  publisher text,
  image_url text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 4. PRODUCTS (top-up packages per game)
-- =========================================================
create table public.products (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_products_game_id on public.products(game_id);

-- =========================================================
-- 5. ORDERS
-- =========================================================
create table public.orders (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id),
  status order_status not null default 'PENDING',
  amount numeric(10, 2) not null,
  created_at timestamptz not null default now()
);

create index idx_orders_user_id on public.orders(user_id);

-- =========================================================
-- 6. SECRET CODES (inventory)
-- =========================================================
create table public.secret_codes (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  code_string text not null,
  is_used boolean not null default false,
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now()
);

create index idx_secret_codes_product_unused
  on public.secret_codes(product_id)
  where is_used = false;

create unique index idx_secret_codes_unique_string
  on public.secret_codes(product_id, code_string);

-- =========================================================
-- 7. ATOMIC "CLAIM A CODE" FUNCTION
-- FOR UPDATE SKIP LOCKED makes this safe under concurrent buyers.
-- =========================================================
create or replace function public.claim_secret_code(
  p_product_id uuid,
  p_order_id uuid
)
returns table (id uuid, code_string text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_code_id uuid;
  v_code_string text;
begin
  select sc.id, sc.code_string
  into v_code_id, v_code_string
  from public.secret_codes sc
  where sc.product_id = p_product_id
    and sc.is_used = false
  order by sc.created_at asc
  limit 1
  for update skip locked;

  if v_code_id is null then
    raise exception 'OUT_OF_STOCK';
  end if;

  update public.secret_codes
  set is_used = true, order_id = p_order_id
  where secret_codes.id = v_code_id;

  return query select v_code_id, v_code_string;
end;
$$;

-- =========================================================
-- 8. ROW LEVEL SECURITY
-- =========================================================
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.secret_codes enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN'
  );
$$;

-- ---- PROFILES ----
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ---- GAMES (public read, admin write) ----
create policy "Anyone can view active games"
  on public.games for select
  using (true);

create policy "Admins can insert games"
  on public.games for insert
  with check (public.is_admin());

create policy "Admins can update games"
  on public.games for update
  using (public.is_admin());

-- ---- PRODUCTS ----
create policy "Anyone can view active products"
  on public.products for select
  using (true);

create policy "Admins can insert products"
  on public.products for insert
  with check (public.is_admin());

create policy "Admins can update products"
  on public.products for update
  using (public.is_admin());

-- ---- ORDERS ----
create policy "Users can view their own orders"
  on public.orders for select
  using (auth.uid() = user_id or public.is_admin());

create policy "Users can create their own orders"
  on public.orders for insert
  with check (auth.uid() = user_id);

-- ---- SECRET CODES ----
create policy "Users can view codes tied to their own orders"
  on public.secret_codes for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = secret_codes.order_id
        and o.user_id = auth.uid()
    )
    or public.is_admin()
  );

create policy "Admins can insert codes"
  on public.secret_codes for insert
  with check (public.is_admin());

-- =========================================================
-- 9. OPTIONAL: seed one game + product so the UI isn't empty
-- (safe to delete — comment out if you don't want sample data)
-- =========================================================
-- insert into public.games (title, slug, publisher, image_url, description)
-- values ('Mobile Legends', 'mobile-legends', 'Moonton',
--         'https://picsum.photos/seed/ml/600/400', 'Top up diamonds instantly.');
--
-- insert into public.products (game_id, name, description, price)
-- select id, '86 Diamonds', 'Small top-up pack', 1.99 from public.games where slug = 'mobile-legends';
