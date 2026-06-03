-- supabase/migrations/0005_grant_public_read.sql
-- RLS policies are NOT sufficient on their own in Supabase: PostgREST checks
-- table-level SQL privileges BEFORE evaluating RLS, so without an explicit
-- GRANT the API returns 42501 "permission denied" even with a `using (true)`
-- policy. Tables created through the dashboard get these grants automatically;
-- tables created via raw migrations do not — hence this migration.
--
-- Public read on the three public tables. `bets` is intentionally omitted so
-- anon/authenticated stay fully denied (server-only via service_role, which
-- bypasses both grants and RLS).

grant select on public.coalitions to anon, authenticated;
grant select on public.users      to anon, authenticated;
grant select on public.matches    to anon, authenticated;
