-- supabase/migrations/0004_create_bets.sql
-- One bet = one user × one match. points_awarded is NULL until the cron scores
-- the match (then 0/1/3 via calcBetPoints). NO anon policy → default-deny:
-- bets are read/written ONLY server-side (service_role bypasses RLS) so a player
-- can never read or copy other players' bets before kickoff.

create table public.bets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id)   on delete cascade,
  match_id       uuid not null references public.matches(id) on delete cascade,
  home_score     integer not null,                 -- the prediction
  away_score     integer not null,
  points_awarded integer,                           -- NULL = not scored yet
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, match_id)
);

create trigger bets_set_updated_at
  before update on public.bets
  for each row execute function public.set_updated_at();

alter table public.bets enable row level security;

-- Intentionally NO policy: anon/authenticated are denied by default.
-- All bet I/O goes through the server with the service_role key.

-- unique(user_id, match_id) already indexes user_id-leading lookups.
-- match_id needs its own index (not the leading column of the composite).
create index bets_match_id_idx on public.bets (match_id);
