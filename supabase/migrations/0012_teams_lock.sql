-- supabase/migrations/0012_teams_lock.sql
-- Verrou d'équipes manuel — pendant « équipes » de score_locked (migration 0011).
-- football-data.org renvoie des équipes nulles pour les matchs KO non encore
-- tirés (homeTeam/awayTeam = null) tant que l'API n'a pas propagé le tirage : on
-- écrit alors « À déterminer ». Une fois une affiche renseignée à la main et
-- verrouillée, le cron d'ingestion (upsert_matches) ne doit PLUS la réécraser.
--
-- teams_locked = true → upsert_matches préserve home_team/away_team/crests/stage
-- existants. Le score reste géré indépendamment par score_locked (migration 0011).

alter table public.matches
  add column if not exists teams_locked boolean not null default false;

-- upsert_matches v2 : ajout de la garde teams_locked. Signature inchangée
-- (jsonb) → l'appelant existant (cron sync-matches) reste inchangé.
create or replace function public.upsert_matches(p_matches jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with rows as (
    select * from jsonb_to_recordset(p_matches) as r(
      football_data_id integer,
      home_team        text,
      away_team        text,
      home_crest_url   text,
      away_crest_url   text,
      stage            text,
      kickoff_at       timestamptz,
      status           public.match_status
    )
  ),
  upserted as (
    insert into public.matches as m
      (football_data_id, home_team, away_team, home_crest_url, away_crest_url,
       stage, kickoff_at, status)
    select football_data_id, home_team, away_team, home_crest_url, away_crest_url,
           stage, kickoff_at, status
      from rows
    on conflict (football_data_id) do update set
      -- Équipes/crests/stage : figés si teams_locked, sinon mis à jour par l'API.
      home_team      = case when m.teams_locked then m.home_team else excluded.home_team end,
      away_team      = case when m.teams_locked then m.away_team else excluded.away_team end,
      home_crest_url = case when m.teams_locked then m.home_crest_url else excluded.home_crest_url end,
      away_crest_url = case when m.teams_locked then m.away_crest_url else excluded.away_crest_url end,
      stage          = case when m.teams_locked then m.stage else excluded.stage end,
      -- kickoff toujours mis à jour (l'heure d'un KO peut se préciser).
      kickoff_at     = excluded.kickoff_at,
      -- status 'finished' collant (inchangé) : un match scoré n'est pas ramené en arrière.
      status         = case
                         when m.status = 'finished' then m.status
                         else excluded.status
                       end
    returning 1
  )
  select count(*)::integer into v_count from upserted;

  return jsonb_build_object('upserted', v_count);
end;
$$;

revoke all on function public.upsert_matches(jsonb) from public;
grant execute on function public.upsert_matches(jsonb) to service_role;
