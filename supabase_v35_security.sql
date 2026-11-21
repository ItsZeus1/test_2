-- =====================================================================
-- ZovaCharge v35 · PART 9 · Money protection (paste once in Supabase → SQL Editor → Run)
-- =====================================================================
-- Safe to re-run. Needs parts 1 and 7 (and part 8 for vault sizes). Run it AFTER them, and
-- run it again if you ever re-run part 1 (part 1 re-opens the old public write rules).
--
-- Where the money lives: everything is stored in ONE jsonb row, public.novacharge_state
-- (id = 'primary'). In that row a wallet balance is users[].balanceCents, the role is
-- users[].role and the lock is users[].isLocked / users[].isBlocked — there are no separate
-- balance_usd / role / is_locked columns, so the protection below works on that row:
--
--   1. purchase_service_atomic(...)  one locked transaction (SELECT … FOR UPDATE) that reads
--      the price from the database copy of the catalog, checks the balance, takes a vault piece
--      (FOR UPDATE SKIP LOCKED), charges, records the order and the ledger line. The same order
--      id can never charge twice, and two clicks at once are serialised by the row lock.
--   2. nova_money_guard trigger      every save that does not come from the verified owner
--      (Google sign-in as majd@elmadani.com), the server key or the SQL editor is checked:
--      balances, roles, locks, prices, payment addresses, approvals and the ledger are put back
--      to their saved values, and new orders can only be created by purchase_service_atomic.
--   3. Row level security             the public key can no longer write or delete the store
--      row directly, and only the verified owner can write the catalog tables.
--
-- Emergency undo (puts saving back exactly as it was before v35):
--   drop trigger if exists nova_money_guard on public.novacharge_state;
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Who is asking?
-- ---------------------------------------------------------------------
-- The request's JWT is signed by Supabase, so its claims can be trusted. The owner must use
-- the owner email AND a Google (OAuth) session; a password sign-up can never pass.
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
  amr jsonb;
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
  if coalesce(claims->'app_metadata'->>'provider', '') = 'google' then
    return true;
  end if;
  amr := claims->'amr';
  if jsonb_typeof(amr) = 'array' then
    return exists (select 1 from jsonb_array_elements(amr) a where jsonb_typeof(a) = 'object' and a->>'method' = 'oauth');
  end if;
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

-- Lets the app show "secure owner session: on / off" and know that v35 is installed.
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
  if jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then
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
  select upper(regexp_replace(translate(coalesce(v, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[\s#_-]+', '', 'g'));
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
-- 3) The guard: untrusted saves cannot move money
-- ---------------------------------------------------------------------
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
  frozen text[] := array[
    'services', 'packages', 'sypRate', 'shamcashAddress', 'syriatelCashAddress', 'mtnCashAddress',
    'serviceGroups', 'heroBanners', 'offersTickerText', 'offersTickerTextAr', 'offersTickerUpdatedAt',
    'deletedSlugs', 'avgTopupMinutes', 'transactions'
  ];
  omap jsonb;
  nmap jsonb;
  prev jsonb;
  e jsonb;
  fixed jsonb;
  out_list jsonb;
  admin_known boolean;
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
  -- A browser may never jump the version far ahead (that would freeze everyone else's saves).
  if new.version > old.version + 1000 then
    new.version := old.version + 1;
    n := n || jsonb_build_object('version', new.version);
  end if;

  -- a) Catalog, prices, payment addresses, rate and the ledger: owner only.
  foreach k in array frozen loop
    if (n->k) is distinct from (o->k) then
      n := public.nova_keep(n, o, k);
    end if;
  end loop;

  -- b) Accounts: balance / role / block never change here, an unlock is undone, new accounts
  --    start at 0 as NORMAL, and accounts can't be deleted.
  if jsonb_typeof(n->'users') <> 'array' then
    n := public.nova_keep(n, o, 'users');
  elsif jsonb_typeof(o->'users') = 'array' then
    select coalesce(jsonb_object_agg(x->>'id', x), '{}'::jsonb) into omap from jsonb_array_elements(o->'users') x where x ? 'id';
    select coalesce(jsonb_object_agg(x->>'id', true), '{}'::jsonb) into nmap from jsonb_array_elements(n->'users') x where x ? 'id';
    select exists (select 1 from jsonb_array_elements(o->'users') x where lower(coalesce(x->>'email', '')) = 'majd@elmadani.com') into admin_known;
    out_list := '[]'::jsonb;
    for e in select value from jsonb_array_elements(n->'users') loop
      prev := omap->(e->>'id');
      if prev is null then
        fixed := e || jsonb_build_object('balanceCents', 0, 'isBlocked', false);
        if not (lower(coalesce(e->>'email', '')) = 'majd@elmadani.com' and not admin_known) then
          fixed := fixed || jsonb_build_object('role', 'NORMAL');
        end if;
      else
        fixed := public.nova_keep(e, prev, 'balanceCents');
        fixed := public.nova_keep(fixed, prev, 'role');
        fixed := public.nova_keep(fixed, prev, 'isBlocked');
        if coalesce(prev->>'isLocked', 'false') = 'true' then
          fixed := fixed || '{"isLocked": true}'::jsonb;
        end if;
        if coalesce(prev->>'honeypotFlagged', 'false') = 'true' then
          fixed := fixed || '{"honeypotFlagged": true}'::jsonb;
        end if;
        if lower(coalesce(fixed->>'email', '')) = 'majd@elmadani.com' and lower(coalesce(prev->>'email', '')) <> 'majd@elmadani.com' then
          fixed := public.nova_keep(fixed, prev, 'email');
        end if;
      end if;
      out_list := out_list || jsonb_build_array(fixed);
    end loop;
    for e in select value from jsonb_array_elements(o->'users') loop
      if (e ? 'id') and not (nmap ? (e->>'id')) then
        out_list := out_list || jsonb_build_array(e);
      end if;
    end loop;
    n := jsonb_set(n, '{users}', out_list, true);
  end if;

  -- c) Orders: only purchase_service_atomic creates them. Price / owner / refund never change;
  --    the only status change allowed is "processing" or "PENDING_VAULT" → "delivered".
  if jsonb_typeof(n->'orders') <> 'array' then
    n := public.nova_keep(n, o, 'orders');
  elsif jsonb_typeof(o->'orders') = 'array' then
    select coalesce(jsonb_object_agg(x->>'id', x), '{}'::jsonb) into omap from jsonb_array_elements(o->'orders') x where x ? 'id';
    select coalesce(jsonb_object_agg(x->>'id', true), '{}'::jsonb) into nmap from jsonb_array_elements(n->'orders') x where x ? 'id';
    out_list := '[]'::jsonb;
    for e in select value from jsonb_array_elements(n->'orders') loop
      prev := omap->(e->>'id');
      continue when prev is null;
      fixed := e;
      foreach k in array array['priceCents', 'userId', 'currency', 'serviceId', 'packageId', 'roleAtPurchase', 'refunded', 'refundedAt', 'receiptNumber'] loop
        fixed := public.nova_keep(fixed, prev, k);
      end loop;
      if (fixed->>'status') is distinct from (prev->>'status')
         and not (coalesce(prev->>'status', '') in ('processing', 'PENDING_VAULT') and fixed->>'status' = 'delivered') then
        fixed := public.nova_keep(fixed, prev, 'status');
        fixed := public.nova_keep(fixed, prev, 'resolvedAt');
      end if;
      out_list := out_list || jsonb_build_array(fixed);
    end loop;
    for e in select value from jsonb_array_elements(o->'orders') loop
      if (e ? 'id') and not (nmap ? (e->>'id')) then
        out_list := out_list || jsonb_build_array(e);
      end if;
    end loop;
    n := jsonb_set(n, '{orders}', out_list, true);
  end if;

  -- d) Top-up requests: customers may add new ones (always "PROCESSING"); approvals,
  --    amounts and references of existing ones are owner-only; pending ones can't vanish.
  if jsonb_typeof(n->'balanceRequests') <> 'array' then
    n := public.nova_keep(n, o, 'balanceRequests');
  elsif jsonb_typeof(o->'balanceRequests') = 'array' then
    select coalesce(jsonb_object_agg(x->>'id', x), '{}'::jsonb) into omap from jsonb_array_elements(o->'balanceRequests') x where x ? 'id';
    select coalesce(jsonb_object_agg(x->>'id', true), '{}'::jsonb) into nmap from jsonb_array_elements(n->'balanceRequests') x where x ? 'id';
    out_list := '[]'::jsonb;
    for e in select value from jsonb_array_elements(n->'balanceRequests') loop
      prev := omap->(e->>'id');
      if prev is null then
        fixed := e || jsonb_build_object('status', 'PROCESSING', 'resolvedAt', null);
      else
        fixed := e;
        foreach k in array array['status', 'cents', 'userId', 'resolvedAt', 'transferNumber', 'transactionRef', 'isDuplicateRef', 'method', 'currency', 'receiptNumber'] loop
          fixed := public.nova_keep(fixed, prev, k);
        end loop;
      end if;
      out_list := out_list || jsonb_build_array(fixed);
    end loop;
    for e in select value from jsonb_array_elements(o->'balanceRequests') loop
      if (e ? 'id') and not (nmap ? (e->>'id')) and e->>'status' = 'PROCESSING' then
        out_list := out_list || jsonb_build_array(e);
      end if;
    end loop;
    n := jsonb_set(n, '{balanceRequests}', out_list, true);
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
    if pack is null then
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
    usd := case when vip then public.nova_num(counter->'vipPricePer100UsdCents', 90) else public.nova_num(counter->'pricePer100UsdCents', 100) end;
    if cur = 'SYP' then
      explicit_price := case when vip then public.nova_num(counter->'vipPricePer100SypCents', 0) else public.nova_num(counter->'pricePer100SypCents', 0) end;
      per100 := case when explicit_price > 0 then explicit_price else public.nova_syp(usd, rate) end;
    else
      per100 := usd;
    end if;
    price := ceil((per100 * p_points) / 100.0);
    pname := to_char(p_points, 'FM999,999,999,999') || ' pts';
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

notify pgrst, 'reload schema';
