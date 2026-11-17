-- HomePlanner database schema for Supabase (Postgres).
-- Run once in the Supabase dashboard: SQL Editor > New query > paste > Run.

create table if not exists public.records (
  collection  text        not null,
  id          text        not null,
  family_id   text,
  lookup_key  text,
  data        jsonb       not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (collection, id)
);

create unique index if not exists records_lookup_key
  on public.records (collection, lookup_key) where lookup_key is not null;
create index if not exists records_family
  on public.records (collection, family_id, created_at);

-- Only the HomePlanner server (service-role key) may read or write. With RLS on
-- and no policies, the public anon key used by phones for realtime pings cannot
-- see any rows.
alter table public.records enable row level security;
