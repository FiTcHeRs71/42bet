-- supabase/migrations/0011_score_lock.sql
-- Verrou de score manuel. football-data.org renvoie parfois un score erroné
-- (ex. Espagne-Arabie 5-0 au lieu de 4-0, Égypte-Iran 1-2 au lieu de 1-1).
-- Une fois le score corrigé à la main, le cron sync-results ne doit PLUS le
-- réécrire avec la valeur fausse de l'API au prochain passage.
--
-- score_locked = true → score_match préserve home_score/away_score/status
-- existants et ne les écrase plus, tout en continuant d'attribuer les points
-- aux paris non scorés (idempotence inchangée).

alter table public.matches
  add column if not exists score_locked boolean not null default false;

-- score_match v2 : ajout du paramètre p_lock (default false → les appelants
-- existants — cron, simulate-score — restent inchangés). Quand le match est déjà
-- verrouillé, le score/status ne sont pas réécrits. p_lock=true pose le verrou
-- (utilisé par la correction manuelle d'un score erroné).
--
-- On DROP d'abord la signature 4-args (0006) : sinon un appel à 4 arguments
-- serait ambigu entre l'ancienne fonction et la nouvelle (p_lock ayant un défaut).
drop function if exists public.score_match(integer, integer, integer, jsonb);

create or replace function public.score_match(
  p_fd_id  integer,
  p_home   integer,
  p_away   integer,
  p_scored jsonb,
  p_lock   boolean default false
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_match_id      uuid;
  v_locked        boolean;
  v_scored_count  integer := 0;
begin
  -- Lit l'état de verrou AVANT update.
  select score_locked into v_locked
    from public.matches
   where football_data_id = p_fd_id;

  if v_locked is null then
    return jsonb_build_object('scored', 0, 'note', 'match not found');
  end if;

  -- 1. Met à jour le résultat SAUF si le match est verrouillé (on garde alors le
  --    score corrigé manuellement). p_lock pose le verrou pour les corrections.
  update public.matches
     set home_score   = case when v_locked then home_score else p_home end,
         away_score   = case when v_locked then away_score else p_away end,
         status       = case when v_locked then status else 'finished' end,
         score_locked = score_locked or p_lock
   where football_data_id = p_fd_id
  returning id into v_match_id;

  -- 2. Applique les points aux paris non encore scorés de CE match (idempotence),
  --    puis incrémente le total dénormalisé de chaque propriétaire.
  with applied as (
    update public.bets b
       set points_awarded = s.points
      from jsonb_to_recordset(p_scored) as s(bet_id uuid, points integer)
     where b.id = s.bet_id
       and b.match_id = v_match_id
       and b.points_awarded is null
    returning b.user_id, s.points
  ),
  bumped as (
    update public.users u
       set total_points = u.total_points + agg.pts
      from (select user_id, sum(points) as pts from applied group by user_id) agg
     where u.id = agg.user_id
    returning 1
  )
  select count(*)::integer into v_scored_count from applied;

  return jsonb_build_object('scored', v_scored_count, 'locked', v_locked or p_lock);
end;
$$;

-- Le cron appelle cette fonction avec la clé service_role uniquement.
revoke all on function public.score_match(integer, integer, integer, jsonb, boolean) from public;
grant execute on function public.score_match(integer, integer, integer, jsonb, boolean) to service_role;
