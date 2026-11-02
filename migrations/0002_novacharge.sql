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
