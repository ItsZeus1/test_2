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
