/** Exact copy of migrations/novacharge.sql (part 1) for the admin "Copy Database SQL" button. Keep in sync. */
export const NOVACHARGE_SQL = `-- ZovaCharge 0002: online source of truth for the catalog, store settings and the app-state row.
-- Run once in the Supabase SQL editor (Dashboard -> SQL -> New query). Safe to re-run.
--
-- SECURITY NOTE: ZovaCharge runs entirely in the browser with the public anon key, so the policies
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
`;

/** Exact copy of migrations/novacharge.sql (part 2) (Web Push tables). Keep in sync. */
export const NOVACHARGE_PUSH_SQL = `-- ZovaCharge 0003: Web Push for admin alerts (works with the browser closed).
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
`;

/** Exact copy of migrations/novacharge.sql (part 3) (Digital Vault). Keep in sync. */
export const NOVACHARGE_VAULT_SQL = `-- ZovaCharge 0004: Digital Vault (ready accounts / codes) + v30 part 8 (codes & accounts per package). Run once in the Supabase SQL editor. Safe to re-run.
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
-- PART 8 · Vault v30 (codes & accounts per package size)
-- =====================================================================
-- Every piece now belongs to a service AND a package size, and is either a gift-card /
-- redeem code or a ready account. Old pieces (no package) still sell for any size.
alter table public.vault_items add column if not exists package_id  text not null default '';
alter table public.vault_items add column if not exists vault_type  text not null default 'ACCOUNT';
alter table public.vault_items add column if not exists redeem_code text not null default '';
alter table public.vault_items add column if not exists pin_serial  text not null default '';
alter table public.vault_items alter column email set default '';
alter table public.vault_items alter column password set default '';
do $chk$ begin
  alter table public.vault_items add constraint vault_items_type_chk check (vault_type in ('ACCOUNT', 'REDEEM_CODE'));
exception when duplicate_object then null;
end $chk$;
create index if not exists vault_items_pkg_stock_idx on public.vault_items (service_id, package_id, status, created_at);

-- Same guarantees as claim_vault_item (idempotent per order, SKIP LOCKED), but prefers a piece
-- for the exact package size, then one saved for "any size".
create or replace function public.claim_vault_item_v2(p_service_id text, p_package_id text, p_order_id text, p_user_id text, p_receipt text)
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
        where service_id = p_service_id
          and status = 'AVAILABLE'
          and (package_id = coalesce(p_package_id, '') or package_id = '')
        order by (package_id = coalesce(p_package_id, '')) desc, created_at
        for update skip locked
        limit 1
     )
    returning *;
end;
$fn$;

revoke execute on function public.claim_vault_item_v2(text, text, text, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
`;

/** migrations/novacharge.sql (part 4): server-only package secrets. Keep in sync. */
export const NOVACHARGE_SECRETS_SQL = `-- =====================================================================
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
do \$\$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'novacharge_state'
  ) then
    alter publication supabase_realtime add table public.novacharge_state;
  end if;
end \$\$;

-- =====================================================================
-- PART 6 · Support chat photos (server-only)
-- =====================================================================
-- Screenshots / receipts sent in support chats. Kept OUT of the public store row:
-- only the Vercel server (service-role key) reads them, for the ticket owner or the admin.
create table if not exists public.support_images (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id text,
  ticket_id     text,
  mime          text not null,
  data          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists support_images_ticket_idx on public.support_images (ticket_id);
alter table public.support_images enable row level security;
revoke all on public.support_images from anon, authenticated;
-- The old email-code table from v24 is no longer used.
drop table if exists public.password_resets;
-- =====================================================================
-- PART 7 · Change-only saves (v29)
-- =====================================================================
-- Applies a small list of changes to the store instead of re-uploading the whole thing:
--   {"op":"set","key":K,"value":V}                       replace one top-level field
--   {"op":"upsert","key":K,"idKey":"id","value":{..},"at":"start"|"end"}  add / replace one record
--   {"op":"delete","key":K,"idKey":"id","id":"..."}      remove one record
-- Two people saving at once no longer overwrite each other: different records merge.
create or replace function public.novacharge_patch(ops jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  current_payload jsonb;
  current_version bigint;
  op jsonb;
  k text;
  idk text;
  arr jsonb;
  item jsonb;
  present boolean;
  next_version bigint;
begin
  if jsonb_typeof(ops) <> 'array' then
    raise exception 'ops must be an array';
  end if;
  select payload, version into current_payload, current_version
    from public.novacharge_state where id = 'primary' for update;
  if current_payload is null then
    raise exception 'store row missing';
  end if;
  for op in select value from jsonb_array_elements(ops) loop
    k := op->>'key';
    if k is null or k in ('version', 'updatedAt') then
      continue;
    end if;
    if op->>'op' = 'set' then
      current_payload := jsonb_set(current_payload, array[k], coalesce(op->'value', 'null'::jsonb), true);
    elsif op->>'op' in ('upsert', 'delete') then
      idk := coalesce(op->>'idKey', 'id');
      arr := coalesce(current_payload->k, '[]'::jsonb);
      if jsonb_typeof(arr) <> 'array' then
        arr := '[]'::jsonb;
      end if;
      if op->>'op' = 'delete' then
        select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into arr
          from jsonb_array_elements(arr) with ordinality t(e, ord)
          where e->>idk is distinct from op->>'id';
      else
        item := op->'value';
        select exists(select 1 from jsonb_array_elements(arr) e where e->>idk = item->>idk) into present;
        if present then
          select jsonb_agg(case when e->>idk = item->>idk then item else e end order by ord) into arr
            from jsonb_array_elements(arr) with ordinality t(e, ord);
        elsif op->>'at' = 'start' then
          arr := jsonb_build_array(item) || arr;
        else
          arr := arr || jsonb_build_array(item);
        end if;
      end if;
      current_payload := jsonb_set(current_payload, array[k], arr, true);
    end if;
  end loop;
  next_version := current_version + 1;
  current_payload := current_payload || jsonb_build_object(
    'version', next_version,
    'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  update public.novacharge_state
     set payload = current_payload, version = next_version, updated_at = now()
   where id = 'primary';
  return next_version;
end;
$$;
grant execute on function public.novacharge_patch(jsonb) to anon, authenticated;
`;

/** v37 · SQL parts 9–11 (money protection + private accounts + Mega). Same text as supabase_security.sql at the project root. */
export const NOVACHARGE_SECURITY_SQL = `-- =====================================================================
-- ZovaCharge · PARTS 9 + 10 + 11 · Money protection + private accounts + Mega automation (v38)
-- (paste the WHOLE file once in Supabase → SQL Editor → Run)
-- =====================================================================
-- Safe to re-run. Needs parts 1 and 7 (and parts 3 + 8 for the vault). Run it AFTER them, and
-- run it again if you ever re-run part 1 (part 1 re-opens the old public rules).
-- Deploy the site FIRST, then run this file (the site works before and after it).
-- From v37 on this file keeps the same name (supabase_security.sql) — just paste the newest one.
--
-- Everything lives in ONE jsonb row, public.novacharge_state (id = 'primary'): balances are
-- users[].balanceCents, roles users[].role, locks users[].isLocked / isBlocked.
--
--   PART 9  · purchase_service_atomic: price from the database, balance + vault piece locked in one
--             transaction, never charged twice. The guard trigger puts back any money / price /
--             catalog / approval change that does not come from the owner or the server.
--   PART 10 · Sign-in happens on the server (/api/auth), so sessions can't be faked. Browsers can no
--             longer download the store: novacharge_read returns the catalog + ONLY the caller's own
--             account, orders, wallet and tickets (the owner gets everything). Saves carry the session
--             token, and a browser can only change its own records. Tables for Telegram links and
--             email codes (server only).
--   PART 11 · Mega: one-time refunds of automatic orders (nova_refund_order), Mega event log,
--             Mega pricing settings protected like the catalog.
--   v38     · "Any amount" services (Jawaker tokens, bills, mobile credit): optional maximum,
--             unit name, finer price blocks for Mega quantity products, switched-off products refused.
--
-- Emergency undo of the save guard:  drop trigger if exists nova_money_guard on public.novacharge_state;
-- Emergency undo of private reads:   grant select on public.novacharge_state to anon, authenticated;
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Who is asking?
-- ---------------------------------------------------------------------
-- The request's JWT is signed by Supabase, so its claims can be trusted. The owner is the
-- confirmed Supabase Auth account majd@elmadani.com (email + password, signed in by the store's
-- normal admin sign-in). One-time setup: Supabase → Authentication → Users → Add user →
-- majd@elmadani.com with the SAME password as the store admin, tick "Auto Confirm User".
create or replace function public.nova_claims()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
begin
  return nullif(current_setting('request.jwt.claims', true), '')::jsonb;
exception when others then
  return null;
end;
$$;

create or replace function public.nova_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb := public.nova_claims();
begin
  if claims is null then
    return false;
  end if;
  if coalesce(claims->>'role', '') <> 'authenticated' then
    return false;
  end if;
  if lower(coalesce(claims->>'email', '')) <> 'majd@elmadani.com' then
    return false;
  end if;
  -- The Supabase Auth account behind this token must be the owner's and its email confirmed.
  -- With "Confirm email" on, nobody else can ever confirm that address.
  return exists (
    select 1 from auth.users u
     where u.id::text = coalesce(claims->>'sub', '')
       and lower(u.email) = 'majd@elmadani.com'
       and u.email_confirmed_at is not null
  );
exception when others then
  return false;
end;
$$;

-- True for: the money functions below, the server (service-role key), direct database
-- connections (SQL editor), and the verified owner. False for every browser using the public key.
create or replace function public.nova_trusted()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if current_setting('nova.trusted', true) = 'on' then
    return true;
  end if;
  if session_user::text <> 'authenticator' then
    return true;
  end if;
  if coalesce(public.nova_claims()->>'role', '') = 'service_role' then
    return true;
  end if;
  return public.nova_is_admin();
end;
$$;

-- Lets the app show "secure owner session: on / off" and know which version is installed.
create or replace function public.nova_guard_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('guard', true, 'version', 35, 'admin', public.nova_is_admin());
$$;

-- ---------------------------------------------------------------------
-- 1) Small helpers
-- ---------------------------------------------------------------------
-- Same as the app's num(): a non-negative number rounded, else the fallback.
create or replace function public.nova_num(v jsonb, fallback numeric)
returns numeric
language plpgsql
immutable
as $$
begin
  if v is null then
    return fallback;
  end if;
  if jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric >= 0 then
    return round((v #>> '{}')::numeric);
  end if;
  if jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\\s*[0-9]+(\\.[0-9]+)?\\s*$' then
    return round(trim(v #>> '{}')::numeric);
  end if;
  return fallback;
end;
$$;

-- SYP price from a USD price, rounded exactly like the shop's JavaScript (Math.round on doubles).
create or replace function public.nova_syp(usd numeric, rate numeric)
returns numeric
language sql
immutable
as $$
  select (floor((usd::float8 / 100::float8) * rate::float8 + 0.5::float8))::numeric * 100;
$$;

-- Normalised transfer reference: Arabic digits → 0-9, upper case, no spaces / dashes / # / _.
create or replace function public.nova_ref(v text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(translate(coalesce(v, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[\\s#_-]+', '', 'g'));
$$;

-- Copies one key from the saved record (or removes it when the saved record had none).
create or replace function public.nova_keep(cur jsonb, prev jsonb, k text)
returns jsonb
language sql
immutable
as $$
  select case when prev ? k then cur || jsonb_build_object(k, prev->k) else cur - k end;
$$;

create or replace function public.nova_iso(t timestamptz)
returns text
language sql
immutable
as $$
  select to_char(t at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- ---------------------------------------------------------------------
-- 2) Duplicate transfer references (runs for every save, trusted or not)
-- ---------------------------------------------------------------------
-- A new top-up request whose reference was already used by another request gets
-- isDuplicateRef = true, so the owner sees the red warning even if a browser lied about it.
create or replace function public.nova_flag_refs(old_payload jsonb, new_payload jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  reqs jsonb := new_payload->'balanceRequests';
  known jsonb := '{}'::jsonb;
  out_list jsonb := '[]'::jsonb;
  e jsonb;
  r text;
  is_new boolean;
  changed boolean := false;
  dup boolean;
begin
  if jsonb_typeof(reqs) <> 'array' then
    return new_payload;
  end if;
  if jsonb_typeof(old_payload->'balanceRequests') = 'array' then
    select coalesce(jsonb_object_agg(x->>'id', true), '{}'::jsonb) into known
      from jsonb_array_elements(old_payload->'balanceRequests') x
     where x ? 'id';
  end if;
  for e in select value from jsonb_array_elements(reqs) loop
    is_new := not (known ? coalesce(e->>'id', ''));
    r := public.nova_ref(coalesce(nullif(e->>'transactionRef', ''), e->>'transferNumber'));
    if is_new and length(r) >= 3 and r not like 'LEGACY%' then
      select exists (
        select 1 from jsonb_array_elements(reqs) o
         where coalesce(o->>'id', '') <> coalesce(e->>'id', '')
           and public.nova_ref(coalesce(nullif(o->>'transactionRef', ''), o->>'transferNumber')) = r
      ) into dup;
      if dup or coalesce(e->>'transactionRef', '') <> r then
        e := e || jsonb_build_object('transactionRef', r);
        if dup then
          e := e || jsonb_build_object('isDuplicateRef', true);
        end if;
        changed := true;
      end if;
    end if;
    out_list := out_list || jsonb_build_array(e);
  end loop;
  if not changed then
    return new_payload;
  end if;
  return jsonb_set(new_payload, '{balanceRequests}', out_list, true);
end;
$$;

-- ---------------------------------------------------------------------
-- 3) The guard: browsers can only change their OWN records, never money
-- ---------------------------------------------------------------------
-- Who is saving: novacharge_patch_v2 checks the browser's session token and sets
-- nova.viewer (the account id) and nova.guest (a guest ticket key). Sessions are created by the
-- server only, so this identity can't be faked. The owner's token makes the save trusted.
create or replace function public.nova_money_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb;
  n jsonb;
  k text;
  v text := coalesce(current_setting('nova.viewer', true), '');
  g text := coalesce(current_setting('nova.guest', true), '');
  frozen text[] := array[
    'services', 'packages', 'sypRate', 'shamcashAddress', 'syriatelCashAddress', 'mtnCashAddress',
    'serviceGroups', 'heroBanners', 'offersTickerText', 'offersTickerTextAr', 'offersTickerUpdatedAt',
    'deletedSlugs', 'avgTopupMinutes', 'transactions', 'sessions', 'megaSettings'
  ];
  user_locked text[] := array[
    'id', 'balanceCents', 'role', 'isBlocked', 'email', 'passwordHash', 'passwordSalt', 'authProvider',
    'emailVerified', 'failedLoginAttempts', 'lastFailedLoginAt', 'dailyLoginCount', 'lastLoginDate', 'createdAt'
  ];
  omap jsonb;
  nmap jsonb;
  prev jsonb;
  e jsonb;
  fixed jsonb;
  out_list jsonb;
  head_list jsonb;
  pending_topup boolean;
  before_text text;
begin
  if tg_op = 'INSERT' then
    new.payload := public.nova_flag_refs(null, new.payload);
    return new;
  end if;
  o := old.payload;
  n := public.nova_flag_refs(o, new.payload);
  if o is null or public.nova_trusted() then
    new.payload := n;
    return new;
  end if;
  before_text := n::text;
  if new.version > old.version + 1000 then
    new.version := old.version + 1;
    n := n || jsonb_build_object('version', new.version);
  end if;

  -- a) Catalog, prices, payment addresses, rate, ledger and sign-in sessions: owner / server only.
  foreach k in array frozen loop
    if (n->k) is distinct from (o->k) then
      n := public.nova_keep(n, o, k);
    end if;
  end loop;

  -- b) Accounts. Only the signed-in account's own record can change (name, phone, photo, saved IDs…);
  --    balance, role, block / lock, email, password and sign-in counters never change here.
  --    New accounts are created by the server only; no account can be deleted.
  if jsonb_typeof(o->'users') = 'array' then
    select coalesce(jsonb_object_agg(x->>'id', x), '{}'::jsonb) into nmap
      from jsonb_array_elements(case when jsonb_typeof(n->'users') = 'array' then n->'users' else '[]'::jsonb end) x where x ? 'id';
    select exists (
      select 1 from jsonb_array_elements(coalesce(o->'balanceRequests', '[]'::jsonb)) r
       where r->>'userId' = v and r->>'status' = 'PROCESSING'
    ) into pending_topup;
    out_list := '[]'::jsonb;
    for prev in select value from jsonb_array_elements(o->'users') loop
      e := nmap->(prev->>'id');
      if v <> '' and prev->>'id' = v and e is not null then
        fixed := e;
        foreach k in array user_locked loop
          fixed := public.nova_keep(fixed, prev, k);
        end loop;
        if coalesce(prev->>'isLocked', 'false') = 'true' then
          fixed := fixed || '{"isLocked": true}'::jsonb;
        end if;
        if coalesce(prev->>'honeypotFlagged', 'false') = 'true' then
          fixed := fixed || '{"honeypotFlagged": true}'::jsonb;
        end if;
        -- The wallet currency can only change while the wallet is empty and no top-up is waiting.
        if (fixed->'currency') is distinct from (prev->'currency')
           and (public.nova_num(prev->'balanceCents', 0) <> 0 or pending_topup) then
          fixed := public.nova_keep(fixed, prev, 'currency');
        end if;
        out_list := out_list || jsonb_build_array(fixed);
      else
        out_list := out_list || jsonb_build_array(prev);
      end if;
    end loop;
    n := jsonb_set(n, '{users}', out_list, true);
  end if;

  -- c) Orders: only purchase_service_atomic creates them. A browser may only move its own
  --    "processing" / "PENDING_VAULT" order to "delivered"; nothing else changes, nothing is deleted.
  if jsonb_typeof(o->'orders') = 'array' then
    select coalesce(jsonb_object_agg(x->>'id', x), '{}'::jsonb) into nmap
      from jsonb_array_elements(case when jsonb_typeof(n->'orders') = 'array' then n->'orders' else '[]'::jsonb end) x where x ? 'id';
    out_list := '[]'::jsonb;
    for prev in select value from jsonb_array_elements(o->'orders') loop
      e := nmap->(prev->>'id');
      if v <> '' and prev->>'userId' = v and e is not null
         and coalesce(prev->>'status', '') in ('processing', 'PENDING_VAULT') and e->>'status' = 'delivered' then
        fixed := prev || jsonb_build_object('status', 'delivered');
        if e ? 'resolvedAt' then
          fixed := fixed || jsonb_build_object('resolvedAt', e->'resolvedAt');
        end if;
        out_list := out_list || jsonb_build_array(fixed);
      else
        out_list := out_list || jsonb_build_array(prev);
      end if;
    end loop;
    n := jsonb_set(n, '{orders}', out_list, true);
  end if;

  -- d) Top-up requests: the signed-in customer may add their own (always "PROCESSING", with a
  --    unique receipt); existing requests never change here and can't be deleted.
  if jsonb_typeof(o->'balanceRequests') = 'array' then
    select coalesce(jsonb_object_agg(x->>'id', true), '{}'::jsonb) into omap from jsonb_array_elements(o->'balanceRequests') x where x ? 'id';
    head_list := '[]'::jsonb;
    if v <> '' and jsonb_typeof(n->'balanceRequests') = 'array' then
      for e in select value from jsonb_array_elements(n->'balanceRequests') loop
        if (e ? 'id') and not (omap ? (e->>'id')) and e->>'userId' = v then
          fixed := e || jsonb_build_object('status', 'PROCESSING', 'resolvedAt', null);
          if coalesce(fixed->>'receiptNumber', '') = '' or exists (
            select 1 from jsonb_array_elements(o->'balanceRequests') r where r->>'receiptNumber' = fixed->>'receiptNumber'
          ) then
            fixed := fixed || jsonb_build_object('receiptNumber', 'TOP-' || (100000 + floor(random() * 900000))::integer::text);
          end if;
          head_list := head_list || jsonb_build_array(fixed);
        end if;
      end loop;
    end if;
    n := jsonb_set(n, '{balanceRequests}', head_list || (o->'balanceRequests'), true);
  end if;

  -- e) Support chats: a customer may open / write in their own tickets, a guest only in the
  --    ticket whose key they hold. Other people's tickets never change; none can be deleted.
  if jsonb_typeof(o->'supportTickets') = 'array' or jsonb_typeof(n->'supportTickets') = 'array' then
    select coalesce(jsonb_object_agg(x->>'id', x), '{}'::jsonb) into nmap
      from jsonb_array_elements(case when jsonb_typeof(n->'supportTickets') = 'array' then n->'supportTickets' else '[]'::jsonb end) x where x ? 'id';
    select coalesce(jsonb_object_agg(x->>'id', true), '{}'::jsonb) into omap
      from jsonb_array_elements(case when jsonb_typeof(o->'supportTickets') = 'array' then o->'supportTickets' else '[]'::jsonb end) x where x ? 'id';
    head_list := '[]'::jsonb;
    if jsonb_typeof(n->'supportTickets') = 'array' then
      for e in select value from jsonb_array_elements(n->'supportTickets') loop
        if (e ? 'id') and not (omap ? (e->>'id'))
           and ((v <> '' and e->>'userId' = v) or (coalesce(e->>'guest', 'false') = 'true' and coalesce(e->>'guestKey', '') <> '')) then
          head_list := head_list || jsonb_build_array(e);
        end if;
      end loop;
    end if;
    out_list := '[]'::jsonb;
    if jsonb_typeof(o->'supportTickets') = 'array' then
      for prev in select value from jsonb_array_elements(o->'supportTickets') loop
        e := nmap->(prev->>'id');
        if e is not null and (
             (v <> '' and prev->>'userId' = v)
          or (g <> '' and coalesce(prev->>'guestKey', '') = g)
        ) then
          fixed := e;
          foreach k in array array['userId', 'userEmail', 'guest', 'guestKey', 'ticketNumber', 'category'] loop
            fixed := public.nova_keep(fixed, prev, k);
          end loop;
          out_list := out_list || jsonb_build_array(fixed);
        else
          out_list := out_list || jsonb_build_array(prev);
        end if;
      end loop;
    end if;
    n := jsonb_set(n, '{supportTickets}', head_list || out_list, true);
  end if;

  -- f) Admin-URL trap log: new events may be added, a PIN may be added once; nothing is removed.
  if jsonb_typeof(o->'honeypotEvents') = 'array' or jsonb_typeof(n->'honeypotEvents') = 'array' then
    select coalesce(jsonb_object_agg(x->>'id', x), '{}'::jsonb) into nmap
      from jsonb_array_elements(case when jsonb_typeof(n->'honeypotEvents') = 'array' then n->'honeypotEvents' else '[]'::jsonb end) x where x ? 'id';
    select coalesce(jsonb_object_agg(x->>'id', true), '{}'::jsonb) into omap
      from jsonb_array_elements(case when jsonb_typeof(o->'honeypotEvents') = 'array' then o->'honeypotEvents' else '[]'::jsonb end) x where x ? 'id';
    head_list := '[]'::jsonb;
    for e in select value from jsonb_array_elements(case when jsonb_typeof(n->'honeypotEvents') = 'array' then n->'honeypotEvents' else '[]'::jsonb end) loop
      if (e ? 'id') and not (omap ? (e->>'id')) then
        head_list := head_list || jsonb_build_array(e);
      end if;
    end loop;
    out_list := '[]'::jsonb;
    for prev in select value from jsonb_array_elements(case when jsonb_typeof(o->'honeypotEvents') = 'array' then o->'honeypotEvents' else '[]'::jsonb end) loop
      e := nmap->(prev->>'id');
      if e is not null and not (prev ? 'enteredPayload') and (e ? 'enteredPayload') then
        out_list := out_list || jsonb_build_array(prev || jsonb_build_object('enteredPayload', left(e->>'enteredPayload', 32)));
      else
        out_list := out_list || jsonb_build_array(prev);
      end if;
    end loop;
    n := jsonb_set(n, '{honeypotEvents}', (
      select coalesce(jsonb_agg(x order by i), '[]'::jsonb)
        from jsonb_array_elements(head_list || out_list) with ordinality t(x, i) where i <= 150
    ), true);
  end if;

  -- Something was put back: bump the version so every open browser re-downloads the real data.
  if n::text <> before_text then
    new.version := greatest(new.version, old.version) + 1;
    n := n || jsonb_build_object('version', new.version);
  end if;
  new.payload := n;
  return new;
end;
$$;

drop trigger if exists nova_money_guard on public.novacharge_state;
create trigger nova_money_guard
  before insert or update on public.novacharge_state
  for each row execute function public.nova_money_guard();

-- ---------------------------------------------------------------------
-- 4) Atomic purchase
-- ---------------------------------------------------------------------
create or replace function public.purchase_service_atomic(
  p_token text,
  p_order_id text,
  p_service_id text default null,
  p_package_id text default null,
  p_points integer default null,
  p_target_id text default '',
  p_fields jsonb default '[]'::jsonb,
  p_ip text default null,
  p_receipt text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  st jsonb;
  ver bigint;
  token_hash text;
  uid text;
  u jsonb;
  uidx integer;
  pack jsonb;
  svc jsonb;
  region jsonb;
  counter jsonb;
  existing jsonb;
  mode text;
  cur text;
  rate numeric;
  vip boolean;
  usd numeric;
  explicit_price numeric;
  per100 numeric;
  step_points numeric;
  min_points numeric;
  max_points numeric;
  per_points numeric;
  price numeric;
  bal numeric;
  pname text;
  status text;
  receipt text;
  claimed integer := -1;
  now_ms bigint;
  last_ms numeric;
  stamp text;
  fields jsonb := '[]'::jsonb;
  ord jsonb;
  txn jsonb;
  next_ver bigint;
  attempt integer;
begin
  if p_token is null or length(p_token) < 16 or length(p_token) > 200 then
    raise exception 'ZC_AUTH';
  end if;
  if p_order_id is null or p_order_id !~ '^ord_[A-Za-z0-9]{8,64}$' then
    raise exception 'ZC_BAD_ORDER';
  end if;

  -- One buyer at a time: the store row stays locked until this transaction ends.
  select payload, version into st, ver from public.novacharge_state where id = 'primary' for update;
  if st is null then
    raise exception 'ZC_STORE';
  end if;

  token_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select s->>'userId' into uid
    from jsonb_array_elements(coalesce(st->'sessions', '[]'::jsonb)) s
   where s->>'tokenHash' = token_hash and (s->>'expiresAt')::timestamptz > now()
   limit 1;
  if uid is null then
    raise exception 'ZC_AUTH';
  end if;
  select x, (i - 1)::integer into u, uidx
    from jsonb_array_elements(coalesce(st->'users', '[]'::jsonb)) with ordinality t(x, i)
   where x->>'id' = uid
   limit 1;
  if u is null then
    raise exception 'ZC_AUTH';
  end if;
  if coalesce(u->>'isBlocked', 'false') = 'true' then
    raise exception 'ZC_BLOCKED';
  end if;

  -- The same order id never charges twice (double click, retry, two tabs).
  select x into existing from jsonb_array_elements(coalesce(st->'orders', '[]'::jsonb)) x where x->>'id' = p_order_id limit 1;
  if existing is not null then
    if existing->>'userId' <> uid then
      raise exception 'ZC_BAD_ORDER';
    end if;
    return jsonb_build_object('ok', true, 'duplicate', true, 'order', existing, 'balanceCents', u->'balanceCents', 'version', ver);
  end if;

  -- 15 s between charges for the same account (any device).
  now_ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
  last_ms := public.nova_num(u->'lastChargeAt', 0);
  if now_ms - last_ms < 15000 then
    raise exception 'ZC_COOLDOWN:%', ceil((15000 - (now_ms - last_ms)) / 1000.0)::integer;
  end if;

  if coalesce(p_package_id, '') <> '' then
    select x into pack from jsonb_array_elements(coalesce(st->'packages', '[]'::jsonb)) x where x->>'id' = p_package_id limit 1;
    if pack is null or coalesce(pack->>'megaActive', 'true') = 'false' then
      raise exception 'ZC_GONE';
    end if;
    select x into svc from jsonb_array_elements(coalesce(st->'services', '[]'::jsonb)) x where x->>'id' = pack->>'serviceId' limit 1;
  else
    select x into svc from jsonb_array_elements(coalesce(st->'services', '[]'::jsonb)) x where x->>'id' = p_service_id limit 1;
  end if;
  if svc is null then
    raise exception 'ZC_GONE';
  end if;
  if coalesce(svc->>'outOfStock', 'false') = 'true' then
    raise exception 'ZC_OOS';
  end if;

  -- The price always comes from the database copy of the catalog, never from the browser.
  mode := coalesce(nullif(svc->>'serviceMode', ''), 'PACKAGES');
  cur := case when u->>'currency' = 'SYP' then 'SYP' else 'USD' end;
  rate := public.nova_num(st->'sypRate', 0);
  if rate <= 0 then
    rate := 145;
  end if;
  -- sypRate may have decimals: read it exactly.
  if jsonb_typeof(st->'sypRate') = 'number' and (st->>'sypRate')::numeric > 0 then
    rate := (st->>'sypRate')::numeric;
  end if;
  vip := coalesce(u->>'role', '') in ('VIP', 'ADMIN');

  if mode = 'POINT_COUNTER' then
    counter := coalesce(svc->'counter', '{}'::jsonb);
    step_points := greatest(1, public.nova_num(counter->'stepPoints', 100));
    min_points := greatest(step_points, public.nova_num(counter->'minPoints', 100));
    if p_points is null or p_points < min_points then
      raise exception 'ZC_MIN:%', min_points;
    end if;
    if mod(p_points::numeric, step_points) <> 0 then
      raise exception 'ZC_STEP:%', step_points;
    end if;
    -- v38: optional ceiling, and Mega quantity products that are switched off.
    max_points := public.nova_num(counter->'maxPoints', 0);
    if max_points > 0 and p_points > greatest(max_points, min_points) then
      raise exception 'ZC_MAX:%', max_points;
    end if;
    if coalesce(counter->>'megaActive', 'true') = 'false' then
      raise exception 'ZC_GONE';
    end if;
    -- v38: prices are per \`per\` points (100 unless a Mega quantity product needs more precision).
    per_points := greatest(1, round(public.nova_num(counter->'per', 100)));
    usd := case when vip then public.nova_num(counter->'vipPricePer100UsdCents', 90) else public.nova_num(counter->'pricePer100UsdCents', 100) end;
    if cur = 'SYP' then
      explicit_price := case when vip then public.nova_num(counter->'vipPricePer100SypCents', 0) else public.nova_num(counter->'pricePer100SypCents', 0) end;
      per100 := case when explicit_price > 0 then explicit_price else public.nova_syp(usd, rate) end;
    else
      per100 := usd;
    end if;
    price := ceil((per100 * p_points) / per_points);
    pname := to_char(p_points, 'FM999,999,999,999') || ' ' || coalesce(nullif(left(counter->>'unitName', 20), ''), 'pts');
  else
    if pack is null then
      raise exception 'ZC_GONE';
    end if;
    usd := case when vip then public.nova_num(pack->'vipPriceCents', 0) else public.nova_num(pack->'normalPriceCents', 0) end;
    if cur = 'SYP' then
      explicit_price := case when vip then public.nova_num(pack->'vipPriceSypCents', 0) else public.nova_num(pack->'normalPriceSypCents', 0) end;
      price := case when explicit_price > 0 then explicit_price else public.nova_syp(usd, rate) end;
    else
      price := usd;
    end if;
    pname := coalesce(pack->>'sizeName', '');
    if coalesce(pack->>'regionId', '') <> '' and jsonb_typeof(svc->'regions') = 'array' then
      select x into region from jsonb_array_elements(svc->'regions') x where x->>'id' = pack->>'regionId' limit 1;
      if region is not null then
        pname := coalesce(nullif(region->>'nameAr', ''), region->>'nameEn', '') || ' · ' || pname;
      end if;
    end if;
  end if;

  bal := public.nova_num(u->'balanceCents', 0);
  if jsonb_typeof(u->'balanceCents') = 'number' then
    bal := (u->>'balanceCents')::numeric;
  end if;
  if price is null or price < 0 then
    raise exception 'ZC_GONE';
  end if;
  if bal < price then
    raise exception 'ZC_FUNDS';
  end if;

  -- Receipt number: the browser's suggestion if it is free, otherwise a new one.
  receipt := p_receipt;
  if receipt is null or receipt !~ '^ZC-[0-9]{6}$'
     or exists (select 1 from jsonb_array_elements(coalesce(st->'orders', '[]'::jsonb)) x where x->>'receiptNumber' = receipt) then
    for attempt in 1..20 loop
      receipt := 'ZC-' || (100000 + floor(random() * 900000))::integer::text;
      exit when not exists (select 1 from jsonb_array_elements(coalesce(st->'orders', '[]'::jsonb)) x where x->>'receiptNumber' = receipt);
    end loop;
  end if;

  status := case
    when mode = 'VAULT' then 'PENDING_VAULT'
    when svc->>'deliverySpeed' = 'MANUAL' then 'PENDING_MANUAL'
    else 'processing'
  end;

  -- Vault: take the piece inside this same transaction. No piece → nothing is charged.
  if mode = 'VAULT' then
    begin
      select count(*)::integer into claimed
        from public.claim_vault_item_v2(svc->>'id', coalesce(pack->>'id', ''), p_order_id, uid, receipt);
    exception when undefined_function or undefined_column then
      begin
        select count(*)::integer into claimed from public.claim_vault_item(svc->>'id', p_order_id, uid, receipt);
      exception when undefined_function or undefined_table then
        claimed := -1;
      end;
    when undefined_table then
      claimed := -1;
    end;
    if claimed = 0 then
      raise exception 'ZC_VAULT_EMPTY';
    end if;
  end if;

  if mode <> 'VAULT' and jsonb_typeof(p_fields) = 'array' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', left(coalesce(f->>'id', ''), 40),
             'labelAr', left(coalesce(f->>'labelAr', ''), 80),
             'labelEn', left(coalesce(f->>'labelEn', ''), 80),
             'value', left(coalesce(f->>'value', ''), 300)) order by i), '[]'::jsonb)
      into fields
      from jsonb_array_elements(p_fields) with ordinality t(f, i)
     where i <= 8 and jsonb_typeof(f) = 'object' and coalesce(f->>'value', '') <> '';
  end if;

  stamp := public.nova_iso(clock_timestamp());
  ord := jsonb_build_object(
    'id', p_order_id,
    'userId', uid,
    'serviceId', svc->>'id',
    'packageId', coalesce(pack->>'id', 'points:' || coalesce(p_points, 0)::text),
    'serviceName', coalesce(svc->>'name', ''),
    'serviceSlug', coalesce(svc->>'slug', ''),
    'packageName', pname,
    'targetId', case when mode = 'VAULT' then '' else left(coalesce(p_target_id, ''), 80) end,
    'priceCents', price,
    'currency', cur,
    'roleAtPurchase', coalesce(u->>'role', 'NORMAL'),
    'ipAddress', nullif(left(coalesce(p_ip, ''), 64), ''),
    'status', status,
    'fulfillmentRef', 'ZC-' || upper(substr(p_order_id, 5, 6)),
    'receiptNumber', receipt,
    'createdAt', stamp
  );
  if jsonb_array_length(fields) > 0 then
    ord := ord || jsonb_build_object('fields', fields);
  end if;

  u := u || jsonb_build_object('balanceCents', bal - price, 'lastChargeAt', now_ms, 'lastSeenAt', stamp);
  if coalesce(p_ip, '') <> '' then
    u := u || jsonb_build_object('lastIp', left(p_ip, 64));
  end if;
  txn := jsonb_build_object(
    'id', 'txn_' || substr(md5(random()::text || clock_timestamp()::text || p_order_id), 1, 16),
    'userId', uid,
    'kind', 'purchase',
    'cents', -price,
    'note', coalesce(svc->>'name', '') || ' · ' || pname,
    'createdAt', stamp,
    'balanceAfterCents', bal - price,
    'referenceId', p_order_id
  );

  st := jsonb_set(st, array['users', uidx::text], u, false);
  st := jsonb_set(st, '{orders}', jsonb_build_array(ord) || coalesce(st->'orders', '[]'::jsonb), true);
  st := jsonb_set(st, '{transactions}', (
    select coalesce(jsonb_agg(x order by i), '[]'::jsonb)
      from jsonb_array_elements(jsonb_build_array(txn) || coalesce(st->'transactions', '[]'::jsonb)) with ordinality t(x, i)
     where i <= 1000
  ), true);
  next_ver := ver + 1;
  st := st || jsonb_build_object('version', next_ver, 'updatedAt', stamp);

  perform set_config('nova.trusted', 'on', true);
  update public.novacharge_state set payload = st, version = next_ver, updated_at = now() where id = 'primary';
  perform set_config('nova.trusted', 'off', true);

  return jsonb_build_object('ok', true, 'order', ord, 'balanceCents', bal - price, 'transaction', txn, 'version', next_ver);
end;
$fn$;

revoke all on function public.purchase_service_atomic(text, text, text, text, integer, text, jsonb, text, text) from public;
grant execute on function public.purchase_service_atomic(text, text, text, text, integer, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.nova_guard_status() to anon, authenticated;
grant execute on function public.nova_is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) Row level security
-- ---------------------------------------------------------------------
-- Store row: everyone can still read it (the app needs it), but the public key can no longer
-- insert / update / delete it directly. Saves go through novacharge_patch / novacharge_action /
-- purchase_service_atomic, and the guard above checks every one of them.
drop policy if exists "nova_insert" on public.novacharge_state;
drop policy if exists "nova_update" on public.novacharge_state;
drop policy if exists "nova_delete" on public.novacharge_state;
drop policy if exists "nova_owner_write" on public.novacharge_state;
create policy "nova_owner_write" on public.novacharge_state
  for all to authenticated using (public.nova_is_admin()) with check (public.nova_is_admin());

-- Catalog tables (prices shown in the shop): read for everyone, write for the verified owner only.
do $rls$
declare t text;
begin
  foreach t in array array['services', 'service_packages', 'store_settings'] loop
    execute format('drop policy if exists "nova_insert" on public.%I', t);
    execute format('drop policy if exists "nova_update" on public.%I', t);
    execute format('drop policy if exists "nova_delete" on public.%I', t);
    execute format('drop policy if exists "nova_owner_write" on public.%I', t);
    execute format('create policy "nova_owner_write" on public.%I for all to authenticated using (public.nova_is_admin()) with check (public.nova_is_admin())', t);
  end loop;
end $rls$;


-- =====================================================================
-- PART 10 · Private accounts (v36): server sign-in, private reads, Telegram, email codes
-- =====================================================================

-- ---------------------------------------------------------------------
-- 10.1 Who is this browser? (session token → account id)
-- ---------------------------------------------------------------------
create or replace function public.nova_viewer(st jsonb, p_token text)
returns text
language plpgsql
stable
as $$
declare
  th text;
  uid text;
begin
  if p_token is null or length(p_token) < 16 or length(p_token) > 200 or st is null then
    return null;
  end if;
  th := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select s->>'userId' into uid
    from jsonb_array_elements(coalesce(st->'sessions', '[]'::jsonb)) s
   where s->>'tokenHash' = th and (s->>'expiresAt')::timestamptz > now()
   limit 1;
  return uid;
end;
$$;

create or replace function public.nova_viewer_is_owner(st jsonb, uid text)
returns boolean
language sql
stable
as $$
  select uid is not null and exists (
    select 1 from jsonb_array_elements(coalesce(st->'users', '[]'::jsonb)) x
     where x->>'id' = uid and x->>'role' = 'ADMIN' and lower(coalesce(x->>'email', '')) = 'majd@elmadani.com'
       and coalesce(x->>'isBlocked', 'false') <> 'true'
  );
$$;

-- v36: the owner signed in with the store's normal admin sign-in (server-checked password) is trusted too.
create or replace function public.nova_guard_status(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  st jsonb;
begin
  select payload into st from public.novacharge_state where id = 'primary';
  return jsonb_build_object('guard', true, 'version', 38,
    'admin', public.nova_is_admin() or public.nova_viewer_is_owner(st, public.nova_viewer(st, p_token)));
end;
$$;

create or replace function public.nova_guard_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('guard', true, 'version', 38, 'admin', public.nova_is_admin());
$$;

-- ---------------------------------------------------------------------
-- 10.2 Private reads: each browser gets the catalog + ONLY its own account data
-- ---------------------------------------------------------------------
create or replace function public.novacharge_read(p_token text default null, p_guest_key text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  st jsonb;
  ver bigint;
  uid text;
  th text := '';
  gk text := coalesce(p_guest_key, '');
  res jsonb;
  stats jsonb;
begin
  select payload, version into st, ver from public.novacharge_state where id = 'primary';
  if st is null then
    return null;
  end if;
  uid := public.nova_viewer(st, p_token);
  if public.nova_trusted() or public.nova_viewer_is_owner(st, uid) then
    return jsonb_build_object('version', ver, 'payload', st, 'redacted', false, 'viewer', uid);
  end if;
  uid := coalesce(uid, '');
  if p_token is not null then
    th := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  end if;
  -- Average approval time of recent top-ups (the only public figure built from private rows).
  select jsonb_build_object('averageMinutes', avg(m), 'sampleSize', count(*)) into stats
    from (
      select extract(epoch from ((x->>'resolvedAt')::timestamptz - (x->>'createdAt')::timestamptz)) / 60 as m
        from jsonb_array_elements(coalesce(st->'balanceRequests', '[]'::jsonb)) with ordinality t(x, i)
       where x->>'status' = 'APPROVED' and coalesce(x->>'resolvedAt', '') <> '' and coalesce(x->>'referenceNote', '') not like 'Admin credit%'
       order by i
       limit 20
    ) z
   where m >= 0 and m < 1440;
  res := (st - array['users', 'sessions', 'orders', 'balanceRequests', 'transactions', 'supportTickets', 'honeypotEvents'])
    || jsonb_build_object(
      'users', (select coalesce(jsonb_agg(x - 'passwordHash' - 'passwordSalt' order by i), '[]'::jsonb)
                  from jsonb_array_elements(coalesce(st->'users', '[]'::jsonb)) with ordinality t(x, i) where uid <> '' and x->>'id' = uid),
      'sessions', (select coalesce(jsonb_agg(x order by i), '[]'::jsonb)
                  from jsonb_array_elements(coalesce(st->'sessions', '[]'::jsonb)) with ordinality t(x, i) where th <> '' and x->>'tokenHash' = th),
      'orders', (select coalesce(jsonb_agg(x order by i), '[]'::jsonb)
                  from jsonb_array_elements(coalesce(st->'orders', '[]'::jsonb)) with ordinality t(x, i) where uid <> '' and x->>'userId' = uid),
      'balanceRequests', (select coalesce(jsonb_agg(x order by i), '[]'::jsonb)
                  from jsonb_array_elements(coalesce(st->'balanceRequests', '[]'::jsonb)) with ordinality t(x, i) where uid <> '' and x->>'userId' = uid),
      'transactions', (select coalesce(jsonb_agg(x order by i), '[]'::jsonb)
                  from jsonb_array_elements(coalesce(st->'transactions', '[]'::jsonb)) with ordinality t(x, i) where uid <> '' and x->>'userId' = uid),
      'supportTickets', (select coalesce(jsonb_agg(x order by i), '[]'::jsonb)
                  from jsonb_array_elements(coalesce(st->'supportTickets', '[]'::jsonb)) with ordinality t(x, i)
                 where (uid <> '' and x->>'userId' = uid) or (gk <> '' and coalesce(x->>'guestKey', '') = gk)),
      'honeypotEvents', '[]'::jsonb,
      'topupStats', coalesce(stats, '{}'::jsonb)
    );
  return jsonb_build_object('version', ver, 'payload', res, 'redacted', true, 'viewer', nullif(uid, ''));
end;
$$;

-- ---------------------------------------------------------------------
-- 10.3 Saves carry the session token (the guard then knows whose records may change)
-- ---------------------------------------------------------------------
-- Adds a "merge" op (change a few fields of one record) used by the server sign-in.
create or replace function public.novacharge_patch(ops jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  current_payload jsonb;
  current_version bigint;
  op jsonb;
  k text;
  idk text;
  arr jsonb;
  item jsonb;
  present boolean;
  next_version bigint;
begin
  if jsonb_typeof(ops) <> 'array' then
    raise exception 'ops must be an array';
  end if;
  select payload, version into current_payload, current_version
    from public.novacharge_state where id = 'primary' for update;
  if current_payload is null then
    raise exception 'store row missing';
  end if;
  for op in select value from jsonb_array_elements(ops) loop
    k := op->>'key';
    if k is null or k in ('version', 'updatedAt') then
      continue;
    end if;
    if op->>'op' = 'set' then
      current_payload := jsonb_set(current_payload, array[k], coalesce(op->'value', 'null'::jsonb), true);
    elsif op->>'op' in ('upsert', 'delete', 'merge') then
      idk := coalesce(op->>'idKey', 'id');
      arr := coalesce(current_payload->k, '[]'::jsonb);
      if jsonb_typeof(arr) <> 'array' then
        arr := '[]'::jsonb;
      end if;
      if op->>'op' = 'delete' then
        select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into arr
          from jsonb_array_elements(arr) with ordinality t(e, ord)
          where e->>idk is distinct from op->>'id';
      elsif op->>'op' = 'merge' then
        select coalesce(jsonb_agg(case when e->>idk = op->>'id' then e || coalesce(op->'value', '{}'::jsonb) else e end order by ord), '[]'::jsonb) into arr
          from jsonb_array_elements(arr) with ordinality t(e, ord);
      else
        item := op->'value';
        select exists(select 1 from jsonb_array_elements(arr) e where e->>idk = item->>idk) into present;
        if present then
          select jsonb_agg(case when e->>idk = item->>idk then item else e end order by ord) into arr
            from jsonb_array_elements(arr) with ordinality t(e, ord);
        elsif op->>'at' = 'start' then
          arr := jsonb_build_array(item) || arr;
        else
          arr := arr || jsonb_build_array(item);
        end if;
      end if;
      current_payload := jsonb_set(current_payload, array[k], arr, true);
    end if;
  end loop;
  next_version := current_version + 1;
  current_payload := current_payload || jsonb_build_object(
    'version', next_version,
    'updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  update public.novacharge_state
     set payload = current_payload, version = next_version, updated_at = now()
   where id = 'primary';
  return next_version;
end;
$$;
grant execute on function public.novacharge_patch(jsonb) to anon, authenticated;

create or replace function public.novacharge_patch_v2(ops jsonb, p_token text default null, p_guest_key text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  st jsonb;
  uid text;
begin
  select payload into st from public.novacharge_state where id = 'primary' for update;
  uid := public.nova_viewer(st, p_token);
  if uid is not null and exists (
    select 1 from jsonb_array_elements(coalesce(st->'users', '[]'::jsonb)) x where x->>'id' = uid and coalesce(x->>'isBlocked', 'false') = 'true'
  ) then
    uid := null;
  end if;
  perform set_config('nova.viewer', coalesce(uid, ''), true);
  perform set_config('nova.guest', left(coalesce(p_guest_key, ''), 200), true);
  if public.nova_viewer_is_owner(st, uid) then
    perform set_config('nova.trusted', 'on', true);
  end if;
  return public.novacharge_patch(ops);
end;
$$;
grant execute on function public.novacharge_patch_v2(jsonb, text, text) to anon, authenticated;

-- Whole-store saves / loads are for the owner and the server only now.
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
    if not public.nova_trusted() then
      return public.novacharge_read(null, null);
    end if;
    select * into row_data from public.novacharge_state where id = 'primary';
    if not found then
      return null;
    end if;
    return jsonb_build_object('version', row_data.version, 'payload', row_data.payload);
  elsif action = 'save_state' then
    if not public.nova_trusted() then
      raise exception 'ZC_FULL_SAVE_BLOCKED';
    end if;
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

grant execute on function public.novacharge_read(text, text) to anon, authenticated;
grant execute on function public.nova_guard_status(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 10.4 Nobody can download the whole store any more
-- ---------------------------------------------------------------------
-- Browsers may still read the version counter (the tiny "anything new?" check); the data itself
-- only comes through novacharge_read above.
revoke select on public.novacharge_state from anon, authenticated;
grant select (id, version, updated_at) on public.novacharge_state to anon, authenticated;

-- The live row-change feed would carry the whole row: take the store out of it (the app uses a
-- broadcast signal + a tiny version poll instead).
do $rt$
begin
  alter publication supabase_realtime drop table public.novacharge_state;
exception when others then
  null;
end $rt$;

-- The old Storage fallback copy of the store is no longer public.
do $st$
begin
  update storage.buckets set public = false where id = 'novacharge';
  drop policy if exists "novacharge_storage_all" on storage.objects;
exception when others then
  null;
end $st$;

-- ---------------------------------------------------------------------
-- 10.5 Telegram links and email codes (server only: RLS on, no policies, no grants)
-- ---------------------------------------------------------------------
create table if not exists public.telegram_links (
  chat_id    text primary key,
  user_id    text,
  is_admin   boolean     not null default false,
  tg_username text       not null default '',
  tg_name    text        not null default '',
  linked_at  timestamptz not null default now()
);
create index if not exists telegram_links_user_idx on public.telegram_links (user_id);
create table if not exists public.telegram_codes (
  code       text primary key,
  user_id    text,
  is_admin   boolean     not null default false,
  expires_at timestamptz not null
);
create table if not exists public.email_codes (
  ticket     text primary key,
  email      text        not null,
  attempts   integer     not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists email_codes_email_idx on public.email_codes (email, created_at desc);
alter table public.telegram_links enable row level security;
alter table public.telegram_codes enable row level security;
alter table public.email_codes enable row level security;
revoke all on public.telegram_links, public.telegram_codes, public.email_codes from anon, authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- PART 11 · Mega automation (v37)
-- =====================================================================

-- One-time refund of an order, in one locked transaction (server key only).
-- Used when Mega cancels / refuses an order: the wallet gets the exact price back once.
create or replace function public.nova_refund_order(p_order_id text, p_note text default '', p_status text default 'DECLINED', p_track jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  st jsonb;
  ver bigint;
  o jsonb;
  oidx integer;
  u jsonb;
  uidx integer;
  price numeric;
  bal numeric;
  stamp text;
  txn jsonb;
  next_ver bigint;
begin
  select payload, version into st, ver from public.novacharge_state where id = 'primary' for update;
  if st is null then
    return jsonb_build_object('ok', false, 'error', 'store');
  end if;
  select x, (i - 1)::integer into o, oidx
    from jsonb_array_elements(coalesce(st->'orders', '[]'::jsonb)) with ordinality t(x, i)
   where x->>'id' = p_order_id limit 1;
  if o is null then
    return jsonb_build_object('ok', false, 'error', 'not found');
  end if;
  if coalesce(o->>'refunded', 'false') = 'true' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if coalesce(o->>'status', '') in ('delivered', 'COMPLETED') then
    return jsonb_build_object('ok', false, 'error', 'delivered');
  end if;
  stamp := public.nova_iso(clock_timestamp());
  price := public.nova_num(o->'priceCents', 0);
  if jsonb_typeof(o->'priceCents') = 'number' then
    price := (o->>'priceCents')::numeric;
  end if;
  o := o || jsonb_build_object('status', coalesce(nullif(p_status, ''), 'DECLINED'), 'refunded', true, 'refundedAt', stamp, 'resolvedAt', stamp);
  if p_track is not null and jsonb_typeof(p_track) = 'object' then
    o := o || jsonb_build_object('provider', p_track);
  end if;
  st := jsonb_set(st, array['orders', oidx::text], o, false);
  select x, (i - 1)::integer into u, uidx
    from jsonb_array_elements(coalesce(st->'users', '[]'::jsonb)) with ordinality t(x, i)
   where x->>'id' = o->>'userId' limit 1;
  if u is not null then
    bal := public.nova_num(u->'balanceCents', 0);
    if jsonb_typeof(u->'balanceCents') = 'number' then
      bal := (u->>'balanceCents')::numeric;
    end if;
    bal := bal + price;
    st := jsonb_set(st, array['users', uidx::text], u || jsonb_build_object('balanceCents', bal), false);
    txn := jsonb_build_object(
      'id', 'txn_' || substr(md5(random()::text || clock_timestamp()::text || p_order_id), 1, 16),
      'userId', u->>'id',
      'kind', 'refund',
      'cents', price,
      'note', 'Refund ' || coalesce(o->>'receiptNumber', '') || ' · ' || coalesce(o->>'serviceName', '') || case when coalesce(p_note, '') <> '' then ' · ' || left(p_note, 120) else '' end,
      'createdAt', stamp,
      'balanceAfterCents', bal,
      'referenceId', p_order_id
    );
    st := jsonb_set(st, '{transactions}', (
      select coalesce(jsonb_agg(x order by i), '[]'::jsonb)
        from jsonb_array_elements(jsonb_build_array(txn) || coalesce(st->'transactions', '[]'::jsonb)) with ordinality t(x, i)
       where i <= 1000
    ), true);
  end if;
  next_ver := ver + 1;
  st := st || jsonb_build_object('version', next_ver, 'updatedAt', stamp);
  perform set_config('nova.trusted', 'on', true);
  update public.novacharge_state set payload = st, version = next_ver, updated_at = now() where id = 'primary';
  perform set_config('nova.trusted', 'off', true);
  return jsonb_build_object('ok', true, 'balanceCents', bal, 'version', next_ver);
end;
$$;
revoke all on function public.nova_refund_order(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.nova_refund_order(text, text, text, jsonb) to service_role;

-- What Mega's webhook sent + price-sync reports (server only; the admin sees the latest 15).
create table if not exists public.mega_events (
  id         bigserial primary key,
  kind       text        not null,
  body       text        not null default '',
  created_at timestamptz not null default now()
);
alter table public.mega_events enable row level security;
revoke all on public.mega_events from anon, authenticated;

notify pgrst, 'reload schema';
`;
