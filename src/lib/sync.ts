// src/lib/sync.ts
// Pure orchestration for the result-sync cron. No I/O, no `server-only` import:
// every external effect is injected via `SyncDeps`, so this whole module is
// unit-testable with plain fakes. Points are computed here (rule #7) and
// persisted atomically by the Postgres `score_match` function.

import { calcBetPoints } from "@/lib/points";

/** Minimal subset of the football-data.org `/competitions/WC/matches` payload. */
export type FootballDataMatch = {
  id: number;
  status: string;
  score?: {
    // ⚠️ Sur un match tranché aux tirs au but, football-data met les pénos DANS
    // `fullTime` : fullTime = regularTime + extraTime + penalties. Le score du
    // match (pour le pronostic) est donc `fullTime − penalties`.
    duration?: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT" | string;
    fullTime?: { home: number | null; away: number | null };
    penalties?: { home: number | null; away: number | null };
    // En phase à élimination, un nul à 90' est tranché aux tirs au but :
    // `winner` désigne alors le qualifié (HOME_TEAM / AWAY_TEAM), sinon DRAW.
    winner?: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  };
};
export type FootballDataResponse = { matches: FootballDataMatch[] };

/** A finished match reduced to what we persist (90' score). */
export type FinishedMatch = {
  footballDataId: number;
  homeScore: number;
  awayScore: number;
  // Renseigné uniquement sur un nul à 90' décidé aux tirs au but (phase finale).
  qualifiedWinner?: "home" | "away";
};

export function parseFinishedMatches(res: FootballDataResponse): FinishedMatch[] {
  const out: FinishedMatch[] = [];
  for (const m of res.matches) {
    // AWARDED = résultat validé sur tapis (forfait, etc.) : score définitif,
    // à scorer comme un match terminé (cohérent avec mapStatus côté ingestion).
    if (m.status !== "FINISHED" && m.status !== "AWARDED") continue;
    const fullHome = m.score?.fullTime?.home;
    const fullAway = m.score?.fullTime?.away;
    if (typeof fullHome !== "number" || typeof fullAway !== "number") continue;
    // Retire les tirs au but : `fullTime` les inclut, mais on score sur le
    // résultat à la fin du jeu (un nul, le cas échéant).
    const home = fullHome - (m.score?.penalties?.home ?? 0);
    const away = fullAway - (m.score?.penalties?.away ?? 0);
    // Le qualifié n'a de sens que sur un nul à la fin du jeu (tirs au but). Une
    // victoire nette est déjà couverte par le score lui-même.
    const qualifiedWinner =
      home === away ? winnerSide(m.score?.winner) : undefined;
    out.push({ footballDataId: m.id, homeScore: home, awayScore: away, qualifiedWinner });
  }
  return out;
}

/** Mappe le `winner` football-data vers notre côté qualifié (ou `undefined`). */
function winnerSide(
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null | undefined,
): "home" | "away" | undefined {
  if (winner === "HOME_TEAM") return "home";
  if (winner === "AWAY_TEAM") return "away";
  return undefined;
}

/** A bet row as selected from the DB (generated types are snake_case). */
export type BetRow = {
  id: string;
  user_id: string;
  home_score: number;
  away_score: number;
};

/** Payload element persisted by the `score_match` Postgres function. */
export type ScoredBet = { betId: string; points: 0 | 1 | 3 };

export function scoreBets(
  bets: BetRow[],
  result: { homeScore: number; awayScore: number; qualifiedWinner?: "home" | "away" },
): ScoredBet[] {
  return bets.map((b) => ({
    betId: b.id,
    points: calcBetPoints(
      { homeScore: b.home_score, awayScore: b.away_score },
      result,
    ),
  }));
}

/** Thrown by the football-data fetch layer when the API rate limit is hit. */
export class ThrottledError extends Error {}

/** Match state + its not-yet-scored bets, as loaded from the DB. */
export type LoadedMatch = {
  matchId: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  bets: BetRow[];
};

/** Injected I/O. The route supplies real Supabase / football-data adapters. */
export type SyncDeps = {
  hasMatchInResultWindow: () => Promise<boolean>;
  fetchFinished: () => Promise<FinishedMatch[]>;
  loadMatchWithUnscoredBets: (footballDataId: number) => Promise<LoadedMatch | null>;
  persistScore: (
    footballDataId: number,
    homeScore: number,
    awayScore: number,
    scored: ScoredBet[],
  ) => Promise<void>;
};

export type SyncSummary = {
  skipped: boolean;
  throttled: boolean;
  processed: number;
  scored: number;
  errors: number;
};

export async function runSync(deps: SyncDeps): Promise<SyncSummary> {
  const summary: SyncSummary = {
    skipped: false,
    throttled: false,
    processed: 0,
    scored: 0,
    errors: 0,
  };

  // Gate: never touch the network unless a match can be finishing.
  if (!(await deps.hasMatchInResultWindow())) {
    summary.skipped = true;
    return summary;
  }

  let finished: FinishedMatch[];
  try {
    finished = await deps.fetchFinished();
  } catch (err) {
    if (err instanceof ThrottledError) {
      summary.throttled = true;
      return summary;
    }
    throw err;
  }

  for (const fm of finished) {
    try {
      const match = await deps.loadMatchWithUnscoredBets(fm.footballDataId);
      if (!match) continue; // not part of our calendar

      const scored = scoreBets(match.bets, {
        homeScore: fm.homeScore,
        awayScore: fm.awayScore,
        qualifiedWinner: fm.qualifiedWinner,
      });

      const alreadyDone =
        match.status === "finished" &&
        match.homeScore === fm.homeScore &&
        match.awayScore === fm.awayScore &&
        scored.length === 0;
      if (alreadyDone) continue; // idempotent no-op

      await deps.persistScore(fm.footballDataId, fm.homeScore, fm.awayScore, scored);
      summary.processed += 1;
      summary.scored += scored.length;
    } catch (err) {
      summary.errors += 1;
      console.error(`sync: failed to score match ${fm.footballDataId}`, err);
    }
  }

  return summary;
}
