-- supabase/migrations/0001_create_coalitions.sql
-- 42 coalition reference data. Synced from the intra.42.fr API (server-only).
-- Publicly readable (badges, colours). No client writes anywhere.

create table public.coalitions (
  id         uuid primary key default gen_random_uuid(),
  ft_id      integer unique not null,            -- intra 42 coalition id
  name       text not null,
  color      text not null,                      -- hex, used by coalition-badge skill
  image_url  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger coalitions_set_updated_at
  before update on public.coalitions
  for each row execute function public.set_updated_at();

alter table public.coalitions enable row level security;

-- Public read; all writes go through the server with the service_role key.
create policy "coalitions_select_public"
  on public.coalitions for select
  to anon, authenticated
  using (true);

-- ft_id UNIQUE already creates the index the spec requires.
