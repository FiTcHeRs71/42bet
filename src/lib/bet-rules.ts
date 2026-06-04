// src/lib/bet-rules.ts
// Logique métier PURE des paris — aucune I/O, aucun accès DB (SRP, calque points.ts).
// Source de vérité du lock (kickoff) et de la validation de score, re-appliquée
// systématiquement côté serveur (le client ne fait que de l'UX). Testée dans
// tests/bet-rules.test.ts.

import type { MatchStatus } from "@/lib/types";

const MAX_SCORE = 99;

/**
 * Un pari est plaçable/modifiable ssi le match est programmé ET le coup d'envoi
 * est strictement futur. Tout autre statut (live/finished/postponed/cancelled)
 * ou kickoff atteint/passé => verrouillé.
 */
export function canPlaceBet(
  match: { status: MatchStatus; kickoff_at: string },
  now: Date,
): boolean {
  if (match.status !== "scheduled") return false;
  return now.getTime() < new Date(match.kickoff_at).getTime();
}

/** Un score est valide ssi home et away sont des entiers, 0 <= n <= MAX_SCORE. */
export function validateScore(homeScore: number, awayScore: number): boolean {
  return isValidGoals(homeScore) && isValidGoals(awayScore);
}

function isValidGoals(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;
}
