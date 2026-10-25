-- ============================================================
-- NovaCharge — complete schema, RLS, triggers, seed data
-- Re-runnable. WARNING: it DROPS and recreates the app tables below
-- (profiles, services, packages, transactions, balance_requests,
-- favorites, plus the old categories table / enum types). Your
-- auth.users accounts are NOT touched; profiles are re-created at the
-- bottom of this script for every existing auth user.
-- ============================================================

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop view if exists public.packages_public;
drop table if exists public.favorites cascade;
drop table if exists public.balance_requests cascade;
drop table if exists public.transactions cascade;
drop table if exists public.packages cascade;
drop table if exists public.services cascade;
drop table if exists public.categories cascade;
drop table if exists public.profiles cascade;
drop type if exists public.user_role cascade;
drop type if exists public.transaction_status cascade;

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  username text unique not null,
  email text unique not null,
  role text not null default 'NORMAL' check (role in ('NORMAL','VIP','ADMIN')),
  balance numeric(12,2) not null default 0 check (balance >= 0),
  last_ip text,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  category text not null check (category in ('games','apps','subscriptions','mobile')),
  image_url text,
  description text,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.packages (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  size_name text not null,
  normal_price numeric(10,2) not null check (normal_price >= 0),
  vip_price numeric(10,2) not null check (vip_price >= 0),
  api_endpoint text not null,
  api_secret_code text not null,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  package_id uuid references public.packages(id) on delete set null,
  service_name text not null,
  size_name text not null,
  target_account_id text not null,
  amount_paid numeric(10,2) not null,
  user_ip text,
  status text not null default 'COMPLETED' check (status in ('PENDING','COMPLETED','FAILED')),
  api_response jsonb,
  created_at timestamptz not null default now()
);

create table public.balance_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  payment_method text not null,
  reference_note text,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  created_at timestamptz not null default now()
);

create table public.favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, service_id)
);

create index idx_services_category on public.services(category);
create index idx_packages_service on public.packages(service_id);
create index idx_transactions_created on public.transactions(created_at desc);
create index idx_transactions_user on public.transactions(user_id);
create index idx_profiles_last_seen on public.profiles(last_seen desc);

-- ------------------------------------------------------------
-- Row Level Security
-- Everything privileged (admin tools, purchases, balance changes,
-- reading packages.api_secret_code) runs server-side with the
-- service-role key, which bypasses RLS. Browsers/anon get only:
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.packages enable row level security;
alter table public.transactions enable row level security;
alter table public.balance_requests enable row level security;
alter table public.favorites enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "services_select_active" on public.services
  for select using (is_active = true);

-- packages: NO policies on purpose -> anon/authenticated can never read
-- api_endpoint / api_secret_code. Only the service role can.

create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);

create policy "balance_requests_select_own" on public.balance_requests
  for select using (auth.uid() = user_id);

create policy "favorites_select_own" on public.favorites
  for select using (auth.uid() = user_id);
create policy "favorites_insert_own" on public.favorites
  for insert with check (auth.uid() = user_id);
create policy "favorites_delete_own" on public.favorites
  for delete using (auth.uid() = user_id);

-- No insert/update policies on profiles: users can never edit their own
-- role or balance. Only server code (service role) writes profiles.

-- ------------------------------------------------------------
-- Atomic balance functions (server-side only)
-- ------------------------------------------------------------
create or replace function public.deduct_balance(p_user_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set balance = balance - p_amount
   where id = p_user_id and balance >= p_amount;
  if not found then
    raise exception 'Insufficient balance';
  end if;
end;
$$;

create or replace function public.refund_balance(p_user_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set balance = balance + p_amount where id = p_user_id;
end;
$$;

create or replace function public.increment_balance(p_user_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set balance = balance + p_amount where id = p_user_id;
end;
$$;

-- Critical: without this, any logged-in user could call these via the
-- public API and mint themselves money.
revoke all on function public.deduct_balance(uuid, numeric) from public, anon, authenticated;
revoke all on function public.refund_balance(uuid, numeric) from public, anon, authenticated;
revoke all on function public.increment_balance(uuid, numeric) from public, anon, authenticated;
grant execute on function public.deduct_balance(uuid, numeric) to service_role;
grant execute on function public.refund_balance(uuid, numeric) to service_role;
grant execute on function public.increment_balance(uuid, numeric) to service_role;

-- ------------------------------------------------------------
-- New-user trigger: creates the profile, and auto-promotes the
-- owner email to ADMIN with a $10,000 starting balance.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_admin boolean := lower(new.email) = 'majd@elmadani.com';
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1));
  v_username text := coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1));
  v_suffix text := substr(replace(new.id::text, '-', ''), 1, 6);
begin
  begin
    insert into public.profiles (id, name, username, email, role, balance)
    values (new.id, v_name, v_username, new.email,
            case when v_is_admin then 'ADMIN' else 'NORMAL' end,
            case when v_is_admin then 10000 else 0 end);
  exception when unique_violation then
    insert into public.profiles (id, name, username, email, role, balance)
    values (new.id, v_name, v_username || '_' || v_suffix, new.email,
            case when v_is_admin then 'ADMIN' else 'NORMAL' end,
            case when v_is_admin then 10000 else 0 end);
  end;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Seed: 8 services
-- ------------------------------------------------------------
insert into public.services (name, slug, category, description, is_featured) values
 ('PUBG Mobile','pubg-mobile','games','Instant UC top-up for PUBG Mobile. Enter your Player ID and receive UC within minutes.', true),
 ('Free Fire','free-fire','games','Diamonds delivered straight to your Free Fire account using your Player ID.', true),
 ('Valorant','valorant','games','Valorant Points (VP) for skins, battle passes and agents.', true),
 ('Bigo Live','bigo-live','apps','Recharge Bigo Live diamonds to your Bigo ID instantly.', false),
 ('TikTok Coins','tiktok-coins','apps','Top up TikTok coins to support creators and send gifts.', true),
 ('PlayStation Store','playstation-store','subscriptions','PlayStation Store gift cards delivered digitally.', false),
 ('Netflix','netflix','subscriptions','Netflix gift cards and subscription credit.', false),
 ('Telecom Recharge','telecom-recharge','mobile','Direct mobile balance recharge and data bundles for your phone number.', false);

-- ------------------------------------------------------------
-- Seed: 4 packages per service (placeholder .invalid endpoints are
-- simulated by the app — replace with your real provider URL/code in
-- the Admin → Services editor)
-- ------------------------------------------------------------
insert into public.packages (service_id, size_name, normal_price, vip_price, api_endpoint, api_secret_code)
select s.id, v.size_name, v.np, v.vp, v.ep, v.code
from (values
 ('pubg-mobile','60 UC',0.99,0.89,'https://api.provider.invalid/pubg/topup','SAMPLE_PUBG_60'),
 ('pubg-mobile','325 UC',4.99,4.49,'https://api.provider.invalid/pubg/topup','SAMPLE_PUBG_325'),
 ('pubg-mobile','660 UC',9.99,9.09,'https://api.provider.invalid/pubg/topup','SAMPLE_PUBG_660'),
 ('pubg-mobile','1800 UC',24.99,22.99,'https://api.provider.invalid/pubg/topup','SAMPLE_PUBG_1800'),
 ('free-fire','100 Diamonds',0.99,0.90,'https://api.provider.invalid/freefire/topup','SAMPLE_FF_100'),
 ('free-fire','310 Diamonds',2.99,2.75,'https://api.provider.invalid/freefire/topup','SAMPLE_FF_310'),
 ('free-fire','520 Diamonds',4.99,4.59,'https://api.provider.invalid/freefire/topup','SAMPLE_FF_520'),
 ('free-fire','1060 Diamonds',9.99,9.19,'https://api.provider.invalid/freefire/topup','SAMPLE_FF_1060'),
 ('valorant','475 VP',4.99,4.69,'https://api.provider.invalid/valorant/topup','SAMPLE_VAL_475'),
 ('valorant','1000 VP',9.99,9.39,'https://api.provider.invalid/valorant/topup','SAMPLE_VAL_1000'),
 ('valorant','2050 VP',19.99,18.79,'https://api.provider.invalid/valorant/topup','SAMPLE_VAL_2050'),
 ('valorant','3650 VP',34.99,32.99,'https://api.provider.invalid/valorant/topup','SAMPLE_VAL_3650'),
 ('bigo-live','100 Diamonds',1.19,1.09,'https://api.provider.invalid/bigo/recharge','SAMPLE_BIGO_100'),
 ('bigo-live','500 Diamonds',5.79,5.35,'https://api.provider.invalid/bigo/recharge','SAMPLE_BIGO_500'),
 ('bigo-live','1000 Diamonds',11.49,10.59,'https://api.provider.invalid/bigo/recharge','SAMPLE_BIGO_1000'),
 ('bigo-live','5000 Diamonds',56.99,52.49,'https://api.provider.invalid/bigo/recharge','SAMPLE_BIGO_5000'),
 ('tiktok-coins','70 Coins',0.99,0.92,'https://api.provider.invalid/tiktok/coins','SAMPLE_TT_70'),
 ('tiktok-coins','350 Coins',4.99,4.65,'https://api.provider.invalid/tiktok/coins','SAMPLE_TT_350'),
 ('tiktok-coins','700 Coins',9.99,9.35,'https://api.provider.invalid/tiktok/coins','SAMPLE_TT_700'),
 ('tiktok-coins','1750 Coins',24.99,23.40,'https://api.provider.invalid/tiktok/coins','SAMPLE_TT_1750'),
 ('playstation-store','$10 Gift Card',10.50,10.20,'https://api.provider.invalid/psn/giftcard','SAMPLE_PSN_10'),
 ('playstation-store','$25 Gift Card',26.00,25.20,'https://api.provider.invalid/psn/giftcard','SAMPLE_PSN_25'),
 ('playstation-store','$50 Gift Card',51.50,50.00,'https://api.provider.invalid/psn/giftcard','SAMPLE_PSN_50'),
 ('playstation-store','$100 Gift Card',102.00,99.00,'https://api.provider.invalid/psn/giftcard','SAMPLE_PSN_100'),
 ('netflix','$15 Gift Card',15.60,15.10,'https://api.provider.invalid/netflix/giftcard','SAMPLE_NF_15'),
 ('netflix','$25 Gift Card',26.00,25.20,'https://api.provider.invalid/netflix/giftcard','SAMPLE_NF_25'),
 ('netflix','$50 Gift Card',51.50,50.00,'https://api.provider.invalid/netflix/giftcard','SAMPLE_NF_50'),
 ('netflix','$100 Gift Card',102.00,99.00,'https://api.provider.invalid/netflix/giftcard','SAMPLE_NF_100'),
 ('telecom-recharge','$5 Balance',5.25,5.10,'https://api.provider.invalid/telecom/recharge','SAMPLE_TEL_5'),
 ('telecom-recharge','$10 Balance',10.40,10.10,'https://api.provider.invalid/telecom/recharge','SAMPLE_TEL_10'),
 ('telecom-recharge','$20 Balance',20.70,20.10,'https://api.provider.invalid/telecom/recharge','SAMPLE_TEL_20'),
 ('telecom-recharge','$50 Balance',51.50,50.00,'https://api.provider.invalid/telecom/recharge','SAMPLE_TEL_50')
) as v(slug, size_name, np, vp, ep, code)
join public.services s on s.slug = v.slug;

-- ------------------------------------------------------------
-- Re-create profiles for every EXISTING auth user (their auth rows
-- survive the drops above). The owner email is promoted to ADMIN.
-- ------------------------------------------------------------
insert into public.profiles (id, name, username, email, role, balance)
select u.id,
       coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), split_part(u.email, '@', 1)),
       coalesce(nullif(trim(u.raw_user_meta_data->>'username'), ''), split_part(u.email, '@', 1))
         || '_' || substr(replace(u.id::text, '-', ''), 1, 6),
       u.email,
       case when lower(u.email) = 'majd@elmadani.com' then 'ADMIN' else 'NORMAL' end,
       case when lower(u.email) = 'majd@elmadani.com' then 10000 else 0 end
from auth.users u
where u.email is not null
on conflict do nothing;
