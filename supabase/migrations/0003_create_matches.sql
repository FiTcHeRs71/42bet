-- supabase/migrations/0003_create_matches.sql
-- Matches sourced from football-data.org. football_data_id is the sync
-- idempotency key. kickoff_at is the single source of truth for the bet lock
-- (a bet is locked iff now() >= kickoff_at — no locked_at column).
-- Scores are regulation-time (90') only: home_score/away_score = score.fullTime.

create table public.matches (
  id               uuid primary key default gen_random_uuid(),
  football_data_id integer unique not null,        -- sync idempotency key
  home_team        text not null,
  away_team        text not null,
  home_crest_url   text,
  away_crest_url   text,
  stage            text,                            -- group / R16 / QF ... (display)
  kickoff_at       timestamptz not null,            -- bet-lock source of truth
  status           public.match_status not null default 'scheduled',
  home_score       integer,                         -- 90' score, NULL until finished
  away_score       integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

alter table public.matches enable row level security;

-- Public read (fixtures list). Writes are server-only (sync via service_role).
create policy "matches_select_public"
  on public.matches for select
  to anon, authenticated
  using (true);

-- football_data_id UNIQUE already creates its index.
create index matches_kickoff_at_idx on public.matches (kickoff_at);
create index matches_status_idx on public.matches (status);
