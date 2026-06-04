// src/lib/profile.ts
// Logique de présentation PURE pour la page profil — aucune I/O, aucun recalcul
// de points (règle #7) : on ÉTIQUETTE points_awarded, on ne le recalcule pas.
// Testée dans tests/profile.test.ts.

import type { MatchStatus } from "@/lib/types";

/** Ligne brute renvoyée par listBetsWithMatchByUser (bet joint à son match). */
export type ProfileBetRow = {
  match_id: string;
  home_score: number; // score pronostiqué (côté pari)
  away_score: number;
  points_awarded: number | null;
  match: {
    home_team: string;
    away_team: string;
    home_crest_url: string | null;
    away_crest_url: string | null;
    home_score: number | null; // score réel (côté match), null si non terminé
    away_score: number | null;
    kickoff_at: string;
    status: MatchStatus;
  } | null;
};

export type ProfileOutcome = "exact" | "good" | "miss" | "pending";

export type ProfileHistoryEntry = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeCrestUrl: string | null;
  awayCrestUrl: string | null;
  kickoffAt: string;
  predictedHome: number;
  predictedAway: number;
  actualHome: number | null;
  actualAway: number | null;
  status: MatchStatus;
  pointsAwarded: number | null;
  outcome: ProfileOutcome;
};

/** Étiquette l'issue d'un prono depuis ses points (barème points.ts : 3/1/0). */
function outcomeFromPoints(points: number | null): ProfileOutcome {
  if (points === null) return "pending";
  if (points === 3) return "exact";
  if (points === 1) return "good";
  return "miss";
}

/**
 * Transforme les pronos-avec-match en view models triés (kickoff décroissant,
 * départage par matchId). Ignore les lignes sans match (jointure nulle).
 */
export function buildProfileHistory(
  rows: ProfileBetRow[],
): ProfileHistoryEntry[] {
  return rows
    .filter(
      (r): r is ProfileBetRow & { match: NonNullable<ProfileBetRow["match"]> } =>
        r.match !== null,
    )
    .map((r) => ({
      matchId: r.match_id,
      homeTeam: r.match.home_team,
      awayTeam: r.match.away_team,
      homeCrestUrl: r.match.home_crest_url,
      awayCrestUrl: r.match.away_crest_url,
      kickoffAt: r.match.kickoff_at,
      predictedHome: r.home_score,
      predictedAway: r.away_score,
      actualHome: r.match.home_score,
      actualAway: r.match.away_score,
      status: r.match.status,
      pointsAwarded: r.points_awarded,
      outcome: outcomeFromPoints(r.points_awarded),
    }))
    .sort(
      (a, b) =>
        new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime() ||
        a.matchId.localeCompare(b.matchId),
    );
}
