# Design — classement par coalition (`/leaderboard`)

> Statut : **spec validée**, prête pour le plan d'implémentation.
> Date : 2026-06-04 · Branche cible : `feat/coalition-leaderboard`
> Feature bonus (hors MVP). MVP 5/5 + profil joueur déjà livrés.

## 1. But

Ajouter un **classement des coalitions** en haut de la page `/leaderboard`
existante, au-dessus du classement individuel. Chaque coalition est notée à la
**moyenne de points par parieur actif**, avec total et nombre de joueurs affichés
pour la transparence.

## 2. Décisions de design (trade-offs tranchés)

| Décision | Choix | Raison |
|---|---|---|
| Critère de tri | **Moyenne par joueur** (total / nb parieurs), total + nb joueurs aussi affichés | Équitable malgré des tailles de coalition différentes ; total/effectif montrés pour la transparence. |
| Dénominateur de la moyenne | **Parieurs actifs seulement** (≥ 1 prono) | Réutilise directement les entrées de `buildLeaderboard` (qui exclut déjà les 0-prono). Ne dilue pas avec les inactifs. |
| Emplacement | **Section sur `/leaderboard`** (au-dessus de l'individuel) | Tout au même endroit, une seule page, pas de route ni de composant client supplémentaire. |
| Source des points | **Sortie de `buildLeaderboard`** (`points` agrégés depuis `points_awarded`) | DRY, 100 % cohérent avec le classement individuel, respecte la règle #7 (aucun recalcul de points). |
| Joueurs sans coalition | **Exclus** du classement par coalition | Un classement d'équipes n'a pas de catégorie « sans coalition ». |

## 3. Architecture — unités

| Unité | Fichier | Rôle | I/O ? |
|---|---|---|---|
| `buildCoalitionLeaderboard` | `src/lib/leaderboard.ts` (ajout) | **Pure** : agrège `LeaderboardEntry[]` par coalition → `CoalitionStanding[]` triés et rangés. Aucune I/O, aucun recalcul de points. | non |
| section UI | `src/app/leaderboard/page.tsx` (édit) | Calcule `buildCoalitionLeaderboard(entries)` et rend le bloc « Par coalition » au-dessus du classement individuel. | — |
| tests | `tests/leaderboard.test.ts` (ajout d'un `describe`) | Couvre `buildCoalitionLeaderboard`. | — |

**Réutilisé tel quel** : `buildLeaderboard()` (déjà appelé par la page),
`CoalitionBadge`. **Aucune nouvelle requête DB, aucune migration.**

## 4. Logique d'agrégation (`buildCoalitionLeaderboard`)

Entrée : `LeaderboardEntry[]` — sortie de `buildLeaderboard`, donc déjà filtrée
aux parieurs actifs. Chaque entrée porte `points: number` et
`coalition: { name; color; image_url } | null`.

1. **Filtrer** les entrées sans coalition (`coalition === null`).
2. **Regrouper** par `coalition.name` (les noms de coalition sont uniques par
   campus ; `LeaderboardEntry.coalition` ne porte pas d'`id`).
3. Par coalition : `totalPoints` = Σ `points` ; `players` = nb d'entrées ;
   `average = totalPoints / players`.
4. **Trier** : `average` décroissant, départage `totalPoints` décroissant puis
   `name` croissant (déterministe).
5. **Rang standard 1,1,3** : même `average` ⇒ même rang, le suivant saute (même
   règle que `buildLeaderboard`, appliquée sur `average`).

## 5. Type de sortie

```ts
export type CoalitionStanding = {
  rank: number;
  coalition: { name: string; color: string; image_url: string | null };
  totalPoints: number;
  players: number; // nb de parieurs actifs de la coalition
  average: number; // totalPoints / players (float, arrondi à l'affichage)
};
```

## 6. UI (section sur `/leaderboard`)

Au-dessus du classement individuel existant :

- Titre de section « Par coalition ».
- Une ligne par `CoalitionStanding` : rang, `CoalitionBadge` (nom + couleur),
  **moyenne** formatée à 1 décimale (ex. `2.4 pt/j`), **total**, **nb joueurs**,
  le tout en `tabular-nums`, cohérent avec les classes de la page existante.
- **Si la liste est vide** (aucun parieur actif n'a de coalition) → la section
  n'est pas rendue ; le classement individuel reste affiché tel quel.

Le classement individuel existant n'est pas modifié.

## 7. Gestion d'erreurs

Aucune nouvelle I/O ⇒ aucun nouveau chemin d'erreur. La page conserve son
comportement actuel (`listPlayers` / `listAllBets` lèvent en cas d'erreur DB).
`buildCoalitionLeaderboard` est totale : entrée vide → `[]`.

## 8. Tests (`tests/leaderboard.test.ts`, nouveau `describe`)

`buildCoalitionLeaderboard` (fonction pure) :

1. Aucune entrée → `[]`.
2. Toutes les entrées sans coalition → `[]` (exclusion).
3. Agrégation sur 2 coalitions : `totalPoints`, `players`, `average` corrects.
4. Tri par moyenne décroissante : une petite coalition très efficace passe
   devant une grosse moins efficace (ex. 1 joueur à 3 pts > 2 joueurs à 2 pts
   chacun en moyenne).
5. Ex æquo sur la moyenne → rang `1,1,3` + départage déterministe (`totalPoints`
   puis `name`).

`npm test` + `npm run typecheck` + `npm run lint` verts avant merge.

## 9. Hors scope (YAGNI)

- Graphiques, courbes, page dédiée, toggle/onglet client.
- Moyenne sur tous les membres (parieurs actifs uniquement — décidé §2).
- Seuil minimum de parieurs pour figurer (toute coalition avec ≥ 1 parieur figure).
- Migration DB.

## 10. Workflow

Phase pré-déploiement (AGENTS.md §8) : branche `feat/coalition-leaderboard`, TDD
pour la fonction pure, `merge --no-ff` local dans `main` après vérifs vertes.
