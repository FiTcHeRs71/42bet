# Spec — Résumé des rangs sur le profil

> Statut : validé (brainstorming, 2026-06-08). Branche : `feat/profile-ranks`
> (stackée sur `feat/leaderboard-segments` / PR #8 — dépend de `assignRanks`,
> `coalitionGroupOf`).

## 1. Contexte & objectif

La page Classement vient d'être segmentée (général / camps Students-Piscineux /
coalitions). On veut que chaque joueur retrouve **sa position** d'un coup d'œil
sur sa page profil, dans les 3 dimensions :

- rang **général** (parmi tous les parieurs) ;
- rang dans son **camp** (Students ou Piscineux) ;
- rang dans sa **coalition**.

Chaque rang est affiché **avec son dénominateur** (ex. `5ᵉ/50`).

Hors périmètre (décidé en brainstorming, YAGNI) : aucun scaling du classement
général (pas de pagination, pas de surlignage « moi », pas de pilule). Cette
branche ne fait **que** le résumé profil.

## 2. Cohérence rang / dénominateur

Le rang et le dénominateur viennent **du même ensemble** : les **parieurs
actifs** (joueurs avec ≥ 1 prono). `buildLeaderboard` ne renvoie déjà que ces
joueurs. Le dénominateur d'un sous-ensemble = nombre de parieurs classés dans ce
sous-ensemble — **pas** le total des membres (sinon `5ᵉ/50` alors que seuls 8
ont parié serait incohérent).

## 3. Logique métier (pure, `src/lib/leaderboard.ts`)

Aucun recalcul de points (règle #7), aucune requête supplémentaire : tout dérive
des `entries` déjà produites par `buildLeaderboard` (le profil les calcule
déjà).

```ts
export type ProfileRanks = {
  general:   { rank: number; total: number } | null;
  camp:      { rank: number; total: number; label: string } | null;
  coalition: { rank: number; total: number; name: string }  | null;
};

export function buildProfileRanks(
  entries: LeaderboardEntry[],
  login: string,
): ProfileRanks;
```

Comportement :

- **`general`** : l'entry du joueur (`entries.find(login)`). `rank` = son rang,
  `total` = `entries.length`. Si le joueur n'est pas dans `entries` (0 prono) →
  `general = null` ET `camp = null` ET `coalition = null` (rien à afficher).
- **`camp`** : seulement si le joueur a une coalition. On filtre `entries` au
  même camp (`coalitionGroupOf(coalition.ft_id)`), on re-classe via
  `assignRanks`, `rank` = rang du joueur dans ce sous-ensemble, `total` = taille
  du sous-ensemble, `label` = « Students » | « Piscineux » (réutilise
  `CAMP_LABEL`). Si pas de coalition → `null`.
- **`coalition`** : seulement si le joueur a une coalition. On filtre `entries`
  à la même coalition (par `coalition.name`, clé unique par campus — cohérent
  avec `buildCoalitionLeaderboard`), on re-classe via `assignRanks`, `rank` =
  rang, `total` = taille, `name` = nom de la coalition. Si pas de coalition →
  `null`.

Note : `general.rank` (issu de `buildLeaderboard`) et le rang recalculé sur le
sous-ensemble complet seraient identiques ; on garde `entry.rank` directement
pour le général.

## 4. UI (`src/app/profile/[login]/page.tsx`)

Une ligne compacte rendue **sous le `CoalitionBadge`** dans l'en-tête, via un
petit helper de présentation inline (même style que `Stat` / `HistoryRow`
existants). Exemple complet :

> **14ᵉ/500 général · 3ᵉ/300 piscineux · 5ᵉ/50 The Frogs**

Règles d'affichage :

- Segments séparés par « · » ; ordinaux français (`1ᵉʳ`, sinon `Nᵉ`).
- **Pas de coalition** → afficher seulement « `Nᵉ/T général` ».
- **Aucun prono** (`general === null`) → **ligne entièrement masquée**.
- Style discret (texte `text-zinc-400`/petit), sous le badge ; n'altère pas la
  grille 4-stats existante (le rang général y reste — léger doublon assumé).

La page calcule `const ranks = buildProfileRanks(entries, login);` à partir des
`entries` déjà construites (ligne 44-45 actuelle :
`buildLeaderboard(players, allBets)`), donc **réutiliser** ce tableau plutôt que
de rappeler `buildLeaderboard`.

## 5. Tests (`tests/leaderboard.test.ts`)

`buildProfileRanks` :

- joueur d'une coalition piscine : `general`, `camp` (label « Piscineux »),
  `coalition` (nom) — rangs **et** totaux corrects, totaux = tailles des
  sous-ensembles de parieurs actifs.
- joueur sans coalition : `general` renseigné, `camp === null`,
  `coalition === null`.
- joueur absent de `entries` (0 prono) : `general === null`, `camp === null`,
  `coalition === null`.
- rang recalculé dans le sous-ensemble (le joueur n'a pas le même rang général
  et camp/coalition).

## 6. Fichiers touchés

| Fichier | Nature |
|---|---|
| `src/lib/leaderboard.ts` | + `buildProfileRanks`, type `ProfileRanks` |
| `src/app/profile/[login]/page.tsx` | + ligne compacte des 3 rangs (helper inline) |
| `tests/leaderboard.test.ts` | tests `buildProfileRanks` |
