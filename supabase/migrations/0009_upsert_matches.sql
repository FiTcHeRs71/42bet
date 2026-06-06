-- supabase/migrations/0009_upsert_matches.sql
-- Upsert idempotent des fixtures (ingestion depuis football-data.org).
-- Met à jour UNIQUEMENT les champs fixture (équipes, crests, stage, kickoff,
-- statut) — ne touche JAMAIS home_score/away_score. Le statut 'finished' est
-- collant : un match déjà scoré n'est pas ramené en arrière par une réingestion.
-- Écriture server-only (service_role), comme score_match.

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
      home_team      = excluded.home_team,
      away_team      = excluded.away_team,
      home_crest_url = excluded.home_crest_url,
      away_crest_url = excluded.away_crest_url,
      stage          = excluded.stage,
      kickoff_at     = excluded.kickoff_at,
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
