-- supabase/migrations/0007_grant_service_role_write.sql
-- service_role bypasses RLS but NOT table-level GRANTs. The schema's whole design
-- routes every write through the server with the service_role key (see the
-- "writes are server-only (service_role)" notes in 0002–0004), yet no migration
-- ever granted service_role write privileges — so server writes (and the
-- score_match RPC, which runs security-invoker as service_role) hit
-- "permission denied". This migration grants the DML the architecture assumes.
-- Least privilege: only service_role (the trusted server identity) gets writes;
-- anon/authenticated keep their SELECT-only grants from 0005.

grant select, insert, update, delete
  on public.coalitions, public.users, public.matches, public.bets
  to service_role;
