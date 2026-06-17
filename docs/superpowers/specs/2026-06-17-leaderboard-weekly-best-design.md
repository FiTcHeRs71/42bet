# Spec — Classement : onglet Joueurs par défaut + Meilleur de la semaine 🍺

> Date : 2026-06-17 · Branche : `feat/leaderboard-weekly-best`

## 1. Contexte & objectif

Deux évolutions de la page `/leaderboard` :

- **A. Onglet par défaut.** Aujourd'hui l'onglet affiché par défaut est **Coalitions** ; il
  faut cliquer pour voir les **Joueurs**. On inverse : Joueurs par défaut.
- **B. Meilleur de la semaine.** Identifier le meilleur joueur de la semaine (du
  **vendredi au vendredi**) afin de lui offrir des bières. Affichage : une carte
  « 🍺 Bière de la semaine » en haut de la page + un 3ᵉ onglet « Semaine » avec le
  classement hebdomadaire complet.

Le classement général repose sur `users.total_points` (dénormalisé par la fonction
Postgres `score_match`). Le classement hebdomadaire ne peut pas l'utiliser (c'est un
cumul all-time) : il **somme les `points_awarded`** des paris notés dont le match a eu
lieu dans la fenêtre de la semaine. Sommer des points déjà attribués est une
agrégation, **pas un recalcul** → règle #7 respectée. Barème inchangé (0/1/3, jamais
négatif, cf. `skills/bet-points-calc`).

## 2. Feature A — Onglet Joueurs par défaut

Dans `src/components/leaderboard-tabs.tsx` :
- État initial : `useState<Tab>("players")` (au lieu de `"coalitions"`).
- Ordre des onglets : `[Joueurs] [Coalitions] [Semaine]` (Joueurs en premier).

Aucun autre changement de comportement sur les onglets Joueurs / Coalitions existants.

## 3. Feature B — Meilleur de la semaine

### 3.1 Fenêtre temporelle (vendredi → vendredi)

Fonction **pure** `currentWeekWindow(now: Date): { start: Date; end: Date }` dans
`src/lib/week.ts` :
- `start` = le **dernier vendredi 00h00 en Europe/Zurich** (si `now` est un vendredi,
  `start` = ce vendredi 00h00). `end` = `start + 7 jours`.
- La semaine se réinitialise donc chaque vendredi 00h00 (heure de Zurich). Un match
  joué un vendredi compte pour la **nouvelle** semaine.
- Les bornes sont calculées en tenant compte du fuseau **Europe/Zurich** (et donc des
  changements d'heure été/hiver), pas en UTC brut.

### 3.2 Données

`src/lib/bets.ts` → nouvelle fonction `listScoredBetsWithKickoff()` :
- Requête : `from("bets").select("user_id, points_awarded, matches(kickoff_at)")`
  filtrée sur `points_awarded` non null (`.not("points_awarded", "is", null)`).
- Retourne une liste aplatie : `WeeklyBet[] = { user_id: string; points_awarded: number; kickoff_at: string }`.
- I/O uniquement ; aucune logique de fenêtre ici (SRP).

### 3.3 Agrégat (pur)

`src/lib/leaderboard.ts` → `buildWeeklyLeaderboard(weeklyBets, players, window)` :
- Types :
  ```ts
  export type WeeklyBet = { user_id: string; points_awarded: number; kickoff_at: string };
  export type WeeklyEntry = {
    rank: number;
    login: string;
    avatarUrl: string | null;
    coalition: LeaderboardCoalition | null;
    weeklyPoints: number;
  };
  ```
- Algo :
  1. Filtrer `weeklyBets` dont `new Date(kickoff_at)` ∈ `[window.start, window.end)`.
  2. Sommer `points_awarded` par `user_id`.
  3. Joindre aux `players` (login, avatar, coalition) ; ignorer un user_id absent de
     `players`.
  4. **Exclure** les joueurs dont la somme hebdo vaut 0 (pas un prétendant à la bière).
  5. Trier par `weeklyPoints` décroissant, puis `login` croissant (départage
     déterministe).
  6. Rang standard (1,1,3) — réutilise la même logique que `assignRanks` (à points
     hebdo égaux, même rang, le suivant saute).
- Signature : `buildWeeklyLeaderboard(weeklyBets: WeeklyBet[], players: LeaderboardPlayer[], window: { start: Date; end: Date }): WeeklyEntry[]`.

### 3.4 UI

- **`src/components/weekly-winner-card.tsx`** (nouveau, server component) :
  - Prop : `winner: WeeklyEntry | null`.
  - Si `winner` non null : carte « 🍺 Bière de la semaine » avec avatar + login +
    `{weeklyPoints} pts cette semaine`. En cas d'égalité au sommet, l'appelant passe le
    premier `WeeklyEntry` (rang 1, déterministe) ; le détail des ex æquo est visible
    dans l'onglet Semaine.
  - Si `winner` null : message « Pas encore de gagnant cette semaine 🍺 ».
  - Style cohérent (classes `glass`, accent), réutilise `CoalitionBadge` si pertinent.

- **`src/components/leaderboard-tabs.tsx`** : 3ᵉ onglet `Semaine`.
  - Nouvelle prop `weekly: WeeklyEntry[]`.
  - Type `Tab` étendu à `"coalitions" | "players" | "weekly"`.
  - Rendu de la liste hebdo : rang, avatar (lien profil), login (lien profil), badge
    coalition (responsive comme l'onglet Joueurs), `weeklyPoints` pt. Pas de
    sous-filtres cursus/piscine (YAGNI).
  - Si `weekly` vide : « Aucun joueur classé cette semaine. ».

- **`src/app/leaderboard/page.tsx`** :
  - `const now = new Date();` puis `const window = currentWeekWindow(now);`.
  - Fetch additionnel : `listScoredBetsWithKickoff()` (ajouté au `Promise.all`).
  - `const weekly = buildWeeklyLeaderboard(weeklyBets, players, window);`
  - `const winner = weekly[0] ?? null;`
  - Rendu : `<WeeklyWinnerCard winner={winner} />` au-dessus de `<LeaderboardTabs … weekly={weekly} />`.
  - `export const dynamic = "force-dynamic"` déjà présent → la fenêtre est recalculée à
    chaque visite.

## 4. Gestion d'erreur / cas limites

| Cas | Résultat |
|---|---|
| Aucun pari noté dans la fenêtre | `weekly = []`, `winner = null` → carte « pas de gagnant », onglet Semaine vide |
| Égalité au sommet (plusieurs rang 1) | Carte = premier déterministe (login asc) ; onglet montre tous les rang 1 |
| Pari noté mais hors fenêtre | Ignoré du calcul hebdo |
| Joueur sans coalition | Présent dans l'hebdo, badge coalition absent (comme onglet Joueurs) |
| `requireSession()` | Inchangé : la page reste protégée (gate d'accès déjà en place) |

## 5. Découpage (unités, interfaces nettes)

| Fichier | Responsabilité |
|---|---|
| `src/lib/week.ts` | `currentWeekWindow(now)` — fenêtre vendredi→vendredi (pur, testé) |
| `src/lib/leaderboard.ts` | `buildWeeklyLeaderboard` + types `WeeklyBet`/`WeeklyEntry` (pur, testé) |
| `src/lib/bets.ts` | `listScoredBetsWithKickoff()` — I/O Supabase |
| `src/components/weekly-winner-card.tsx` | Carte gagnant (présentation) |
| `src/components/leaderboard-tabs.tsx` | Onglet Semaine + défaut Joueurs |
| `src/app/leaderboard/page.tsx` | Orchestration : fenêtre → fetch → agrégat → rendu |

## 6. Tests

- **`tests/week.test.ts`** (`currentWeekWindow`) : un mercredi, un dimanche, un vendredi
  (borne `start` incluse à 00h Zurich), et une semaine de changement d'heure
  (DST) → vérifier `start` = vendredi 00h00 Europe/Zurich et `end = start + 7j`.
- **`tests/leaderboard.test.ts`** (ajouts pour `buildWeeklyLeaderboard`) : paris
  dans/hors fenêtre, somme par joueur, exclusion des joueurs à 0 pt, égalité au rang
  (1,1,3), joueur sans coalition, user_id sans player correspondant ignoré.
- **Non-régression** : `npm run typecheck` + `npm run lint` + `npm test` verts.

## 7. Hors périmètre (YAGNI)

- Pas de persistance de l'historique des gagnants hebdo (calcul à la volée).
- Pas de sous-filtres cursus/piscine ni de classement coalition hebdomadaire.
- Pas de notification / e-mail au gagnant.
- Pas de gestion de fuseau configurable (Europe/Zurich en dur, cohérent avec le reste de l'app).
