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
