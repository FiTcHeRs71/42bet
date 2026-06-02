-- supabase/migrations/0002_create_users.sql
-- Player profile + denormalised points total. Keyed by the 42 intra id.
-- NO FK to auth.users — auth is NextAuth, not Supabase Auth.
-- Publicly readable (leaderboard). No email / sensitive fields.

create table public.users (
  id           uuid primary key default gen_random_uuid(),
  ft_id        integer unique not null,          -- 42 natural key
  login        text unique not null,
  avatar_url   text,                             -- 42 photo
  coalition_id uuid references public.coalitions(id) on delete set null,
  total_points integer not null default 0,       -- denormalised for leaderboard perf
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

alter table public.users enable row level security;

-- Public read (leaderboard). Writes are server-only (service_role).
create policy "users_select_public"
  on public.users for select
  to anon, authenticated
  using (true);

-- ft_id / login UNIQUE already create their indexes.
create index users_total_points_idx on public.users (total_points desc);
create index users_coalition_id_idx on public.users (coalition_id);
