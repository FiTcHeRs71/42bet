# Spec — Pari le plus loufoque de la semaine 🃏

## 1. Contexte

Suite de la feature « Meilleur de la semaine » (cf.
`2026-06-17-leaderboard-weekly-best-design.md`). On ajoute une seconde
récompense hebdomadaire sur `/leaderboard` : le **pari le plus loufoque de la
semaine** — le score exact deviné par le moins de joueurs possible.

Un pari « loufoque » célèbre l'exploit improbable : être **le seul (ou l'un des
rares)** à avoir trouvé le **score exact** d'un match de la semaine. C'est la
**rareté** du score exact qui fait le loufoque, pas le nombre de points.

## 2. Règle métier

Sur la **semaine en cours** (vendredi 00:00 → vendredi 00:00 Europe/Zurich,
même fenêtre `currentWeekWindow` que la Bière de la semaine) :

- On ne considère que les paris ayant fait **3 points** (`points_awarded === 3`,
  c'est-à-dire score exact deviné) dont le match tombe dans la fenêtre
  `[start, end)` (clé : `matches.kickoff_at`).
- Un match n'a qu'**un seul** score exact possible (= son résultat réel). Donc
  tous les joueurs ayant fait 3 pts sur un même match ont **deviné le même
  score** et partagent la **même rareté**. L'unité de calcul est donc le
  **match**.
- Pour chaque match concerné : `scorersCount` = nombre de joueurs ayant trouvé
  le score exact de ce match.
- **Classement des matchs** :
  1. `scorersCount` **croissant** (1 est plus loufoque que 2).
  2. puis **total de buts du score décroissant** (4–3 = 7 buts > 1–0 = 1 but).
  3. (départage final au niveau joueur, ci-dessous).
- Le **pari loufoque** = un scoreur du match gagnant. Parmi les scoreurs de ce
  match (mêmes `scorersCount` et même score), départage **par login croissant**
  (déterministe).
- **Aucun recalcul de points** (rule #7) : on lit `points_awarded === 3`, on ne
  recalcule jamais les points.

## 3. Architecture

Même patron que la feature weekly : **logique pure** isolée, **I/O Supabase**
séparée, **UI** en composant. Fichier dédié (le concept « rareté » est distinct
du classement par points ; évite de gonfler `leaderboard.ts`).

### 3.1 Logique pure — `src/lib/loufoque.ts` (créer)

```ts
import type { LeaderboardCoalition, LeaderboardPlayer } from "@/lib/leaderboard";

export type LoufoqueBet = {
  user_id: string;
  match_id: string;
  kickoff_at: string;
  home_team: string;
  away_team: string;
  home_score: number; // score réel = score deviné (exact)
  away_score: number;
};

export type LoufoqueWinner = {
  login: string;
  avatarUrl: string | null;
  coalition: LeaderboardCoalition | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  scorersCount: number; // nb de joueurs ayant trouvé ce score exact sur ce match
};

export function buildLoufoqueBet(
  bets: LoufoqueBet[],
  players: LeaderboardPlayer[],
  weekWindow: { start: Date; end: Date },
): LoufoqueWinner | null;
```

Algorithme (pur, aucune I/O, aucun temps) :

1. Filtrer `bets` à la fenêtre : `start <= kickoff < end`.
2. Regrouper par `match_id`. Pour chaque match, retenir : la liste des
   `user_id` scoreurs **mappés à un joueur connu** (exclure les `user_id` sans
   joueur correspondant), le score (`home_score`/`away_score`), les équipes, et
   `scorersCount = nb de scoreurs mappés`. Ignorer les matchs sans scoreur mappé.
3. Construire un **candidat par match** : son scoreur mappé au **login le plus
   petit** (départage intra-match déterministe).
4. Trier la liste des candidats par : `scorersCount` asc, puis
   `(homeScore + awayScore)` desc, puis `login` asc. Ce tri unique gère aussi
   les égalités entre matchs différents (même rareté et même total de buts).
5. Prendre le premier candidat → `LoufoqueWinner` (avec le `scorersCount` de son
   match). Si la liste de candidats est vide (aucun pari à 3 pts dans la fenêtre,
   ou aucun scoreur ne mappe un joueur connu) → `null`.

> Note rareté vs joueurs connus : `scorersCount` compte les scoreurs **mappés à
> un joueur connu** (cohérent avec l'exclusion des `user_id` inconnus), pour que
> la rareté affichée corresponde aux joueurs affichables.

### 3.2 I/O — `src/lib/bets.ts` (modifier)

Ajouter :

```ts
export async function listExactScoreBetsWithMatch(): Promise<LoufoqueBet[]>;
```

- Lecture server-only via `supabaseAdmin` (table `bets` = RLS default-deny).
- `.select("user_id, match_id, match:matches(home_team, away_team, home_score, away_score, kickoff_at)")`
  avec `.eq("points_awarded", 3)`.
- Normaliser la relation `match` imbriquée en objet|null (supabase-js peut la
  typer objet OU tableau), **même patron** que `listScoredBetsWithKickoff` et
  `listBetsWithMatchByUser`.
- `home_score`/`away_score` du **match** (résultat réel = score exact deviné).
- Pas de test unitaire (I/O, suit le patron des autres `list*`).

### 3.3 UI — `src/components/loufoque-bet-card.tsx` (créer)

Server component sans état. Props `{ loufoque: LoufoqueWinner | null }`.
Même style « glass » que `WeeklyWinnerCard`.

- Label : **🃏 Pari loufoque de la semaine**.
- Si `loufoque` non null : avatar (ou placeholder) + login (lien
  `/profile/[login]`) + `CoalitionBadge`, le match
  `{homeTeam} {homeScore}–{awayScore} {awayTeam}`, et la rareté en toutes
  lettres :
  - `scorersCount === 1` → « Seul à avoir trouvé le score exact ».
  - `scorersCount > 1` → « L'un des {scorersCount} à avoir trouvé le score
    exact ».
- Si `loufoque` null → « Pas encore de pari loufoque cette semaine 🃏 ».

### 3.4 Câblage — `src/app/leaderboard/page.tsx` (modifier)

- Importer `listExactScoreBetsWithMatch`, `buildLoufoqueBet`, `LoufoqueBetCard`.
- Ajouter `listExactScoreBetsWithMatch()` au `Promise.all` existant
  (`listPlayers`, `listAllBets`, `listScoredBetsWithKickoff`).
- `const loufoque = buildLoufoqueBet(exactBets, players, week);` (réutilise la
  variable `week = currentWeekWindow(now)` déjà calculée).
- Rendre `<LoufoqueBetCard loufoque={loufoque} />` **juste sous**
  `<WeeklyWinnerCard winner={winner} />`, dans le même fragment.

## 4. Cas limites

| Cas | Comportement |
|---|---|
| Aucun pari à 3 pts dans la fenêtre | `loufoque = null` → carte « Pas encore de pari loufoque cette semaine 🃏 » |
| Pari à 3 pts hors fenêtre | Ignoré |
| Match à 1 scoreur vs match à 2 scoreurs | Le match à 1 scoreur gagne (rareté d'abord) |
| Égalité de rareté entre 2 matchs | Le score au plus de buts gagne ; puis login |
| Plusieurs scoreurs sur le match gagnant | Un seul affiché (départage login) ; `scorersCount > 1` → wording « l'un des N » |
| `user_id` sans joueur correspondant | Ignoré (du compte et du gagnant) |
| Joueur sans coalition | `coalition: null` (badge gère le null) |

## 5. Fichiers

| Fichier | Action |
|---|---|
| `src/lib/loufoque.ts` | Créer — `LoufoqueBet`, `LoufoqueWinner`, `buildLoufoqueBet` (pur) |
| `tests/loufoque.test.ts` | Créer — tests de `buildLoufoqueBet` |
| `src/lib/bets.ts` | Modifier — `listExactScoreBetsWithMatch` (I/O) |
| `src/components/loufoque-bet-card.tsx` | Créer — carte 🃏 (présentation) |
| `src/app/leaderboard/page.tsx` | Modifier — fetch + build + rendu carte |

## 6. Tests

`tests/loufoque.test.ts` couvre `buildLoufoqueBet` : fenêtre vide → null,
hors-fenêtre ignoré, rareté (1 < 2), égalité rareté départagée par total de buts
puis login, `user_id` inconnu ignoré, joueur sans coalition. Non-régression :
suite complète verte (`npm test`), typecheck, lint, build.

## 7. Hors périmètre (YAGNI)

- Pas de persistance d'historique des paris loufoques (calcul à la volée).
- Pas de notification au gagnant.
- Pas d'onglet dédié : une simple carte sous la Bière de la semaine.
- Pas de gestion de la « semaine passée » : on calcule sur la **semaine en
  cours** (décision produit).
