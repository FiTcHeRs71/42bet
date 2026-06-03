// src/app/api/cron/sync-results/route.ts
import { fetchWorldCupMatches } from "@/lib/football-data";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  parseFinishedMatches,
  runSync,
  type BetRow,
  type SyncDeps,
} from "@/lib/sync";

export const dynamic = "force-dynamic"; // never cache

// Result window: a match can be finishing from kickoff up to 4h later
// (extra time + penalties in knockout rounds). See skill rule #4.
const RESULT_WINDOW_MS = 4 * 60 * 60 * 1000;

export async function GET(req: Request) {
  // 1. Auth — checked first.
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Wire real I/O into the orchestrator.
  const deps: SyncDeps = {
    hasMatchInResultWindow: async () => {
      const now = Date.now();
      const { data, error } = await supabaseAdmin
        .from("matches")
        .select("id")
        .neq("status", "finished")
        .lte("kickoff_at", new Date(now).toISOString())
        .gte("kickoff_at", new Date(now - RESULT_WINDOW_MS).toISOString())
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    fetchFinished: async () => parseFinishedMatches(await fetchWorldCupMatches()),

    loadMatchWithUnscoredBets: async (footballDataId) => {
      const { data: match, error: matchErr } = await supabaseAdmin
        .from("matches")
        .select("id, status, home_score, away_score")
        .eq("football_data_id", footballDataId)
        .maybeSingle();
      if (matchErr) throw matchErr;
      if (!match) return null;

      const { data: bets, error: betsErr } = await supabaseAdmin
        .from("bets")
        .select("id, user_id, home_score, away_score")
        .eq("match_id", match.id)
        .is("points_awarded", null);
      if (betsErr) throw betsErr;

      return {
        matchId: match.id,
        status: match.status,
        homeScore: match.home_score,
        awayScore: match.away_score,
        bets: (bets ?? []) as BetRow[],
      };
    },

    persistScore: async (footballDataId, homeScore, awayScore, scored) => {
      const { error } = await supabaseAdmin.rpc("score_match", {
        p_fd_id: footballDataId,
        p_home: homeScore,
        p_away: awayScore,
        p_scored: scored.map((s) => ({ bet_id: s.betId, points: s.points })),
      });
      if (error) throw error;
    },
  };

  // 3. Run and report.
  const summary = await runSync(deps);
  return Response.json({ ok: true, ...summary });
}
