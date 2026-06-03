// src/lib/match-view.ts
// Logique de présentation PURE pour la liste des matchs — aucune I/O.
// Testée dans tests/match-view.test.ts.

import type { Match } from "@/lib/types";

export type MatchDisplayState =
  | "upcoming"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled";

export type MatchDay = { dayKey: string; matches: Match[] };

// Fuseau de référence (École 42 Lausanne) : le regroupement par jour et
// l'affichage doivent être déterministes quel que soit le fuseau du serveur.
const TZ = "Europe/Zurich";

/** Clé jour (YYYY-MM-DD) dans le fuseau de référence pour un instant ISO. */
function zurichDayKey(iso: string): string {
  // en-CA donne le format ISO "YYYY-MM-DD".
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** État d'affichage dérivé du statut + kickoff (cf. spec §4.3). */
export function displayState(match: Match, now: Date): MatchDisplayState {
  switch (match.status) {
    case "finished":
      return "finished";
    case "postponed":
      return "postponed";
    case "cancelled":
      return "cancelled";
    case "live":
      return "live";
    case "scheduled":
      return now.getTime() >= new Date(match.kickoff_at).getTime()
        ? "live"
        : "upcoming";
    default: {
      const _exhaustive: never = match.status;
      return _exhaustive;
    }
  }
}

/** Regroupe les matchs par jour (fuseau de réf). Groupes et matchs triés chrono. */
export function groupByDay(matches: Match[]): MatchDay[] {
  const byKey = new Map<string, Match[]>();
  for (const m of matches) {
    const key = zurichDayKey(m.kickoff_at);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(m);
    else byKey.set(key, [m]);
  }

  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, dayMatches]) => ({
      dayKey,
      matches: dayMatches.sort(
        (a, b) =>
          new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime(),
      ),
    }));
}
