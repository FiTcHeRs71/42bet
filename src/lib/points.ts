// src/lib/points.ts
// Canonical bet-scoring logic (skill `bet-points-calc`). Pure function, no I/O.
// Reused everywhere — never reimplement the rules elsewhere.

type MatchResult = {
  homeScore: number;
  awayScore: number;
  // Phase à élimination : si le match est nul à 90' et décidé aux tirs au but,
  // l'équipe qui se qualifie. `undefined`/`null` pour un nul définitif (poule).
  qualifiedWinner?: "home" | "away" | null;
};
type Bet = { homeScore: number; awayScore: number };

/**
 * Calcule les points d'un pari pour un résultat de match.
 * Fonction pure — aucun side effect, aucun accès DB.
 *   - score exact                              -> 3
 *   - bon vainqueur (ou nul)                   -> 1
 *   - nul à 90' + pari sur le qualifié (TAB)   -> 1
 *   - mauvais résultat                         -> 0
 */
export function calcBetPoints(bet: Bet, result: MatchResult): 0 | 1 | 3 {
  // 1. Score exact ?
  if (bet.homeScore === result.homeScore && bet.awayScore === result.awayScore) {
    return 3;
  }
  // 2. Bon vainqueur (ou nul) ?
  const betWinner = winner(bet.homeScore, bet.awayScore);
  const resultWinner = winner(result.homeScore, result.awayScore);
  if (betWinner === resultWinner) return 1;
  // 3. Nul à 90' décidé aux tirs au but : on récompense aussi le bon pronostic
  //    du qualifié (le parieur « nul » garde son point via le cas 2 ci-dessus).
  if (resultWinner === "draw" && result.qualifiedWinner === betWinner) return 1;
  return 0;
}

function winner(home: number, away: number): "home" | "away" | "draw" {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}
