-- NovaCharge 0002: relational catalog, settings, user mirror, dual currency (USD + New Syrian Pound).
-- Run once in the Supabase SQL editor (safe to re-run).
--
-- Money columns are integer minor units ("cents"): USD cents and SYP piastres (1 SYP = 100).
-- SYP package prices of 0 mean "derive from USD x store_settings.syp_rate".

-- Legacy state blob (auth, sessions, orders, wallets). Created here too in case 0001 was never run.
create table if not exists public.novacharge_state (
  id text primary key,
  version integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id text primary key,
  slug text not null unique,
  name text not null,
  name_ar text not null default '',
  category text not null check (category in ('games', 'apps', 'subscriptions', 'mobile')),
  description text not null default '',
  description_ar text not null default '',
  instructions text not null default '',
  badge text,
  image_url text not null default '', -- https URL or data:image/... base64 (uploads)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_packages (
  id text primary key,
  service_id text not null references public.services (id) on delete cascade,
  size_name text not null,
  price_usd_cents integer not null default 0 check (price_usd_cents >= 0),
  vip_price_usd_cents integer not null default 0 check (vip_price_usd_cents >= 0),
  price_syp_cents bigint not null default 0 check (price_syp_cents >= 0),
  vip_price_syp_cents bigint not null default 0 check (vip_price_syp_cents >= 0),
  api_endpoint text not null default '',
  api_secret_code text not null default '',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists service_packages_service_id_idx on public.service_packages (service_id, sort_order);

-- Existing installs: add the SYP columns if the table predates this migration.
alter table public.service_packages add column if not exists price_syp_cents bigint not null default 0;
alter table public.service_packages add column if not exists vip_price_syp_cents bigint not null default 0;

create table if not exists public.store_settings (
  id text primary key default 'primary',
  shamcash_address text not null default '',
  offers_ticker_text text not null default '',
  offers_ticker_text_ar text not null default '',
  syp_rate numeric(12, 4) not null default 120 check (syp_rate > 0), -- SYP per 1 USD
  catalog_seeded boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.store_settings add column if not exists syp_rate numeric(12, 4) not null default 120;
alter table public.store_settings add column if not exists catalog_seeded boolean not null default false;
insert into public.store_settings (id) values ('primary') on conflict (id) do nothing;

-- Profile mirror (no password material). Wallet balance is in the user's own currency.
create table if not exists public.users (
  id text primary key,
  name text not null default '',
  username text not null,
  email text not null unique,
  phone text not null default '',
  role text not null default 'NORMAL' check (role in ('NORMAL', 'VIP', 'ADMIN')),
  currency text not null default 'USD' check (currency in ('USD', 'SYP')),
  balance_cents bigint not null default 0,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.users add column if not exists currency text not null default 'USD';

-- Row level security. NovaCharge currently authenticates in-app with the anon key, so the
-- anon role needs read/write. Tighten these once auth moves to Supabase Auth or a server.
alter table public.novacharge_state enable row level security;
alter table public.services enable row level security;
alter table public.service_packages enable row level security;
alter table public.store_settings enable row level security;
alter table public.users enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['novacharge_state', 'services', 'service_packages', 'store_settings', 'users'] loop
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
      t || '_anon_all',
      t
    );
  end loop;
end $$;

grant select, insert, update, delete on
  public.novacharge_state, public.services, public.service_packages, public.store_settings, public.users
  to anon, authenticated;
