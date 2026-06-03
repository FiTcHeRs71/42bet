-- supabase/migrations/0000_helpers.sql
-- Shared helpers used by every table migration:
--   1. set_updated_at() — trigger fn that bumps updated_at on every UPDATE.
--   2. match_status     — simplified status enum (football-data vocabulary is
--                         mapped onto this at sync time).

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create type public.match_status as enum (
  'scheduled',
  'live',
  'finished',
  'postponed',
  'cancelled'
);
