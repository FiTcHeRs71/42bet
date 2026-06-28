// src/lib/match-sync.ts
// Transformation pure du payload football-data.org (/competitions/WC/matches)
// vers les lignes d'upsert de la table `matches`. Aucune I/O, aucun
// `server-only` : testable avec des objets simples. Le statut API est mappé sur
// l'enum `match_status` (vocabulaire simplifié) au moment de l'ingestion.

import type { MatchStatus } from "@/lib/types";

/** Équipe telle que renvoyée par l'API (champs utiles ; nullable en phase KO). */
export type FdTeam = { name: string | null; crest: string | null };

/** Sous-ensemble d'un match API utile à l'ingestion (fixtures + statut/score). */
export type FdFixture = {
  id: number;
  utcDate: string;
  status: string;
  stage?: string | null;
  group?: string | null;
  homeTeam?: FdTeam | null;
  awayTeam?: FdTeam | null;
  score?: { fullTime?: { home: number | null; away: number | null } };
};

export type WorldCupMatchesResponse = { matches: FdFixture[] };

/** Ligne destinée à l'upsert dans `public.matches` (colonnes snake_case). */
export type MatchUpsertRow = {
  football_data_id: number;
  home_team: string;
  away_team: string;
  home_crest_url: string | null;
  away_crest_url: string | null;
  stage: string | null;
  kickoff_at: string;
  status: MatchStatus;
};

/** Mappe le vocabulaire football-data.org sur l'enum interne `match_status`. */
export function mapStatus(apiStatus: string): MatchStatus {
  switch (apiStatus) {
    case "SCHEDULED":
    case "TIMED":
      return "scheduled";
    case "IN_PLAY":
    case "PAUSED":
    case "SUSPENDED":
      return "live";
    case "FINISHED":
    case "AWARDED": // résultat validé sur tapis : match terminé, score valide
      return "finished";
    case "POSTPONED":
      return "postponed";
    case "CANCELLED":
    default:
      return "cancelled";
  }
}

/** Libellé d'affichage de la phase. Groupe prioritaire, sinon phase finale. */
export function formatStage(
  stage: string | null,
  group: string | null,
): string | null {
  if (group) {
    return `Groupe ${group.replace(/^GROUP_/, "")}`;
  }
  switch (stage) {
    case "LAST_32":
      return "16es de finale";
    case "LAST_16":
      return "8es de finale";
    case "QUARTER_FINALS":
      return "Quarts de finale";
    case "SEMI_FINALS":
      return "Demi-finales";
    case "THIRD_PLACE":
      return "Petite finale";
    case "FINAL":
      return "Finale";
    default:
      return null;
  }
}

/** Transforme la réponse API en lignes d'upsert (équipes/crests/stage/statut). */
export function parseMatchesForUpsert(
  res: WorldCupMatchesResponse,
): MatchUpsertRow[] {
  return res.matches.map((m) => ({
    football_data_id: m.id,
    home_team: m.homeTeam?.name ?? "À déterminer",
    away_team: m.awayTeam?.name ?? "À déterminer",
    home_crest_url: m.homeTeam?.crest ?? null,
    away_crest_url: m.awayTeam?.crest ?? null,
    stage: formatStage(m.stage ?? null, m.group ?? null),
    kickoff_at: m.utcDate,
    status: mapStatus(m.status),
  }));
}
