---
name: bet-points-calc
description: Calcul des points d'un pari 42Bet — règles métier strictes (+1 bon vainqueur, +3 score exact), fonction pure et testée
---

# Skill : calcul des points d'un pari

## Quand utiliser

À chaque fois qu'un score final de match est connu et qu'il faut attribuer des points aux paris liés à ce match. Appelé depuis le cron `sync-results` après mise à jour d'un match.

## Règle métier (canonique)

| Cas | Points |
|---|---|
| Mauvais vainqueur prédit | **0** |
| Bon vainqueur (ou nul correctement prédit) | **+1** |
| Score exact prédit | **+3** *(pas +1 +3 — c'est +3 total)* |

Les points sont **cumulés au total du user**, pas calculés à la volée pour le classement (perf).

## Structure attendue

Code dans `src/lib/points.ts` :

```ts
type MatchResult = { homeScore: number; awayScore: number };
type Bet = { homeScore: number; awayScore: number };

/**
 * Calcule les points d'un pari pour un résultat de match.
 * Fonction pure — aucun side effect, aucun accès DB.
 */
export function calcBetPoints(bet: Bet, result: MatchResult): 0 | 1 | 3 {
  // 1. Score exact ?
  if (bet.homeScore === result.homeScore && bet.awayScore === result.awayScore) {
    return 3;
  }
  // 2. Bon vainqueur (ou nul) ?
  const betWinner = winner(bet.homeScore, bet.awayScore);
  const resultWinner = winner(result.homeScore, result.awayScore);
  return betWinner === resultWinner ? 1 : 0;
}

function winner(home: number, away: number): "home" | "away" | "draw" {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}
```

## Tests obligatoires

Fichier `tests/points.test.ts`. Cas à couvrir :

- [ ] Score exact victoire domicile (2-1 / 2-1) → 3
- [ ] Score exact match nul (1-1 / 1-1) → 3
- [ ] Score exact victoire extérieur (0-2 / 0-2) → 3
- [ ] Bon vainqueur domicile mais score différent (2-1 / 3-0) → 1
- [ ] Bon nul mais score différent (1-1 / 2-2) → 1
- [ ] Mauvais vainqueur (2-1 / 0-1) → 0
- [ ] Nul prédit alors qu'il y a un vainqueur (1-1 / 2-1) → 0
- [ ] Vainqueur prédit alors que match nul (2-1 / 1-1) → 0

## Anti-patterns à refuser

- ❌ Logique de calcul dispersée dans plusieurs fichiers
- ❌ Calcul côté client (un user pourrait fake ses points)
- ❌ Fonction qui touche à la DB en plus du calcul (mélange concerns)
- ❌ Retourner `number` au lieu du type littéral `0 | 1 | 3` (perd la garantie)
- ❌ Modifier les règles sans mettre à jour les tests **et** cette skill

## Si les règles changent

1. Modifier le tableau "Règle métier" de cette skill **en premier**
2. Adapter les tests
3. Adapter le code
4. Commit : `feat(points): update scoring rules` avec explication dans le body
