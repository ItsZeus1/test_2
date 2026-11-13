-- NovaCharge Supabase setup. Run each PART once in Supabase → SQL Editor (safe to re-run).
-- The admin dashboard has a copy button for each part.

-- =====================================================================
-- PART 1 · Core store (state, catalog, settings, RPC)
-- =====================================================================
-- NovaCharge 0002: online source of truth for the catalog, store settings and the app-state row.
-- Run once in the Supabase SQL editor (Dashboard -> SQL -> New query). Safe to re-run.
--
-- SECURITY NOTE: NovaCharge runs entirely in the browser with the public anon key, so the policies
-- below must let the anon role write. That means anyone who has the anon key can edit these rows.
-- The provider API endpoint + secret code are intentionally NOT stored in the public tables
-- (services / service_packages / store_settings). For real protection move admin writes behind a
-- Supabase Edge Function or server route and tighten the policies to the service role.

-- 1) App-state row (accounts, wallets, orders, top-up requests, secrets). Already used by the app.
create table if not exists public.novacharge_state (
  id         text primary key,
  version    bigint      not null default 0,
  payload    jsonb       not null,
  updated_at timestamptz not null default now()
);

-- 2) Catalog
create table if not exists public.services (
  id             text primary key,
  slug           text        not null unique,
  name           text        not null,
  name_ar        text        not null default '',
  category       text        not null check (category in ('games','apps','subscriptions','mobile')),
  description    text        not null default '',
  description_ar text        not null default '',
  instructions   text        not null default '',
  badge          text,
  image_url      text        not null default '',  -- https URL or data:image/... (uploaded photo)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.service_packages (
  id                  text primary key,
  service_id          text   not null references public.services(id) on delete cascade,
  size_name           text   not null,
  price_usd_cents     bigint not null default 0,   -- normal price, USD cents
  vip_price_usd_cents bigint not null default 0,   -- VIP price, USD cents
  price_syp_cents     bigint not null default 0,   -- normal price, New SYP x100 (0 = USD x syp_rate)
  vip_price_syp_cents bigint not null default 0,   -- VIP price, New SYP x100 (0 = USD x syp_rate)
  sort_order          int    not null default 0,
  updated_at          timestamptz not null default now()
);
create index if not exists service_packages_service_idx on public.service_packages(service_id);

-- 3) Store settings (single row)
create table if not exists public.store_settings (
  id                    text primary key,
  shamcash_address      text    not null default '',
  offers_ticker_text    text    not null default '',
  offers_ticker_text_ar text    not null default '',
  syp_rate              numeric not null default 110,   -- New SYP per 1 USD (placeholder, set it in Admin)
  deleted_slugs         jsonb   not null default '[]'::jsonb,
  state_version         bigint  not null default 0,
  updated_at            timestamptz not null default now()
);

-- Offer banner photos for the hero carousel (https URLs or data:image/...)
alter table public.store_settings add column if not exists hero_banners jsonb not null default '[]'::jsonb;

-- 3b) RPC used by the app as its first write path. Version-guarded so an older
--     browser copy can never overwrite newer data. If this function is missing the
--     app silently falls back to direct table writes (no error popups).
create or replace function public.novacharge_action(action text, payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  incoming bigint;
  row_data public.novacharge_state;
begin
  if action = 'load_state' then
    select * into row_data from public.novacharge_state where id = 'primary';
    if not found then
      return null;
    end if;
    return jsonb_build_object('version', row_data.version, 'payload', row_data.payload);
  elsif action = 'save_state' then
    incoming := coalesce((payload->>'version')::bigint, 0);
    insert into public.novacharge_state (id, version, payload, updated_at)
    values ('primary', incoming, payload, now())
    on conflict (id) do update
      set version = excluded.version, payload = excluded.payload, updated_at = now()
      where public.novacharge_state.version <= excluded.version;
    return jsonb_build_object('ok', true, 'version', incoming);
  end if;
  raise exception 'novacharge_action: unknown action %', action;
end;
$fn$;

grant execute on function public.novacharge_action(text, jsonb) to anon, authenticated;

-- 4) Row level security + anon policies
do $$
declare t text;
begin
  foreach t in array array['novacharge_state','services','service_packages','store_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "nova_read"   on public.%I', t);
    execute format('drop policy if exists "nova_insert" on public.%I', t);
    execute format('drop policy if exists "nova_update" on public.%I', t);
    execute format('drop policy if exists "nova_delete" on public.%I', t);
    execute format('create policy "nova_read"   on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "nova_insert" on public.%I for insert to anon, authenticated with check (true)', t);
    execute format('create policy "nova_update" on public.%I for update to anon, authenticated using (true) with check (true)', t);
    execute format('create policy "nova_delete" on public.%I for delete to anon, authenticated using (true)', t);
  end loop;
end $$;

grant select, insert, update, delete on public.novacharge_state, public.services,
  public.service_packages, public.store_settings to anon, authenticated;

-- 5) Storage fallback bucket (used only if the state table is unavailable)
insert into storage.buckets (id, name, public, file_size_limit)
values ('novacharge', 'novacharge', true, 5242880)
on conflict (id) do nothing;

drop policy if exists "novacharge_storage_all" on storage.objects;
create policy "novacharge_storage_all" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'novacharge') with check (bucket_id = 'novacharge');

-- 6) Make PostgREST pick up the new tables immediately
notify pgrst, 'reload schema';

-- =====================================================================
-- PART 2 · Web Push (admin & customer alerts)
-- =====================================================================
-- NovaCharge 0003: Web Push for admin alerts (works with the browser closed).
-- Run once in the Supabase SQL editor. Safe to re-run.
-- Both tables have RLS ON and NO policies: only the server (service-role key on Vercel) can use them.

create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  p256dh       text not null,
  auth         text not null,
  user_id      text not null,
  user_email   text not null default '',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

-- One row per event already announced, so an alert is never sent twice.
create table if not exists public.push_events (
  id         text primary key,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.push_events enable row level security;

revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.push_events from anon, authenticated;

-- =====================================================================
-- PART 3 · Digital Vault (server-only stock)
-- =====================================================================
-- NovaCharge 0004: Digital Vault (ready accounts / codes). Run once in the Supabase SQL editor. Safe to re-run.
-- RLS ON + no policies + revoked grants: only the Vercel server (service-role key) can read or change it.
-- Stock credentials never go into the public novacharge_state row.

create extension if not exists pgcrypto;

create table if not exists public.vault_items (
  id              uuid primary key default gen_random_uuid(),
  service_id      text        not null,
  email           text        not null,
  password        text        not null,
  extra_info      text        not null default '',
  status          text        not null default 'AVAILABLE' check (status in ('AVAILABLE', 'SOLD')),
  sold_to_user_id text,
  sold_at         timestamptz,
  order_id        text unique,
  receipt_number  text,
  created_at      timestamptz not null default now()
);
create index if not exists vault_items_stock_idx on public.vault_items (service_id, status, created_at);
create index if not exists vault_items_buyer_idx on public.vault_items (sold_to_user_id);

alter table public.vault_items enable row level security;
revoke all on public.vault_items from anon, authenticated;

-- Atomically hands the oldest available piece to an order. Idempotent: calling it again for the
-- same order returns the same piece. SKIP LOCKED means two buyers can never get the same piece.
create or replace function public.claim_vault_item(p_service_id text, p_order_id text, p_user_id text, p_receipt text)
returns setof public.vault_items
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return query select * from public.vault_items where order_id = p_order_id;
  if found then
    return;
  end if;
  return query
    update public.vault_items
       set status = 'SOLD', sold_to_user_id = p_user_id, sold_at = now(), order_id = p_order_id, receipt_number = p_receipt
     where id = (
       select id from public.vault_items
        where service_id = p_service_id and status = 'AVAILABLE'
        order by created_at
        for update skip locked
        limit 1
     )
    returning *;
end;
$fn$;

revoke execute on function public.claim_vault_item(text, text, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- PART 4 · Package secrets (server-only provider endpoints & codes)
-- =====================================================================
-- Provider API endpoints and secret codes live here, NOT in the public store row.
-- RLS on + no policies: only the server (service-role key on Vercel) can read or write.
create table if not exists public.package_secrets (
  package_id      text primary key,
  api_endpoint    text not null default '',
  api_secret_code text not null default '',
  updated_at      timestamptz not null default now()
);
-- One row per order already sent to a provider (prevents double delivery).
create table if not exists public.dispatched_orders (
  order_id   text primary key,
  status     text not null,
  created_at timestamptz not null default now()
);
alter table public.package_secrets enable row level security;
alter table public.dispatched_orders enable row level security;
revoke all on public.package_secrets from anon, authenticated;
revoke all on public.dispatched_orders from anon, authenticated;

-- =====================================================================
-- PART 5 · Realtime (instant sync & alerts)
-- =====================================================================
-- Lets every open browser hear store changes instantly (the app also sends a broadcast signal).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'novacharge_state'
  ) then
    alter publication supabase_realtime add table public.novacharge_state;
  end if;
end $$;

-- =====================================================================
-- PART 6 · Password reset codes (server-only, emailed via Resend)
-- =====================================================================
create table if not exists public.password_resets (
  email      text primary key,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.password_resets enable row level security;
revoke all on public.password_resets from anon, authenticated;
