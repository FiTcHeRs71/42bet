// src/lib/sync.ts
// Pure orchestration for the result-sync cron. No I/O, no `server-only` import:
// every external effect is injected via `SyncDeps`, so this whole module is
// unit-testable with plain fakes. Points are computed here (rule #7) and
// persisted atomically by the Postgres `score_match` function.

/** Minimal subset of the football-data.org `/competitions/WC/matches` payload. */
export type FootballDataMatch = {
  id: number;
  status: string;
  score?: { fullTime?: { home: number | null; away: number | null } };
};
export type FootballDataResponse = { matches: FootballDataMatch[] };

/** A finished match reduced to what we persist (90' score). */
export type FinishedMatch = {
  footballDataId: number;
  homeScore: number;
  awayScore: number;
};

export function parseFinishedMatches(res: FootballDataResponse): FinishedMatch[] {
  const out: FinishedMatch[] = [];
  for (const m of res.matches) {
    if (m.status !== "FINISHED") continue;
    const home = m.score?.fullTime?.home;
    const away = m.score?.fullTime?.away;
    if (typeof home !== "number" || typeof away !== "number") continue;
    out.push({ footballDataId: m.id, homeScore: home, awayScore: away });
  }
  return out;
}
