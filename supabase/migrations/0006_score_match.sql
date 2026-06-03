-- supabase/migrations/0006_score_match.sql
-- Atomic result-scoring for one match. Points are computed in TS (calcBetPoints,
-- AGENTS.md rule #7) and passed in via p_scored = [{ "bet_id": uuid, "points": int }].
-- This function only PERSISTS them — it never recomputes the scoring rule.
-- Idempotent: only bets with points_awarded IS NULL are updated, and only those
-- owners' totals are incremented, so re-running the cron never double-counts.

create or replace function public.score_match(
  p_fd_id  integer,
  p_home   integer,
  p_away   integer,
  p_scored jsonb
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_match_id      uuid;
  v_scored_count  integer := 0;
begin
  -- 1. Update the match result (90' score) and mark it finished.
  update public.matches
     set home_score = p_home,
         away_score = p_away,
         status     = 'finished'
   where football_data_id = p_fd_id
  returning id into v_match_id;

  if v_match_id is null then
    return jsonb_build_object('scored', 0, 'note', 'match not found');
  end if;

  -- 2. Apply points to not-yet-scored bets of THIS match (idempotency guard),
  --    then bump each owner's denormalised total by the sum just applied.
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

  return jsonb_build_object('scored', v_scored_count);
end;
$$;

-- The cron calls this with the service_role key only.
revoke all on function public.score_match(integer, integer, integer, jsonb) from public;
grant execute on function public.score_match(integer, integer, integer, jsonb) to service_role;
