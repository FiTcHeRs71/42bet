# Classement général (`/leaderboard`) — Design

> Brique 5/5 du MVP (cf. `brainstorming.md` §Features MVP). Dernière feature avant
> le premier match : classer les pronostiqueurs par points.

## 1. Objectif

Afficher un classement public des joueurs ayant pronostiqué, trié par points,
avec login + avatar + badge coalition + nb de pronos + taux de réussite. Mis à
jour à chaque match (le scoring cron alimente déjà les points).

## 2. Décisions de design (validées)

- **Périmètre** : seuls les joueurs ayant **≥ 1 prono** apparaissent.
- **Ex æquo** : classement sportif **standard** (1, 1, 3) — points égaux ⇒ même
  rang, le rang suivant saute. Ordre d'affichage départagé par `login` croissant.
- **Colonnes** : rang · avatar + login · badge coalition · points · nb pronos ·
  taux de réussite.
- **Taux de réussite** : prono « réussi » = qui a rapporté des points
  (`points_awarded > 0`). Dénominateur = pronos **notés** (matchs terminés,
  `points_awarded != null`). Les pronos en attente ne comptent ni au numérateur
  ni au dénominateur. Aucun prono noté ⇒ taux `null` (affiché « — »).
- **Pas de highlight** de la ligne du joueur connecté (peut s'ajouter plus tard).

## 3. Architecture — Approche A (fonction pure testée + I/O mince)

Calque le pattern du repo (`points.ts` / `bet-rules.ts` / `match-view.ts` purs et
testés ; I/O séparée dans `matches.ts` / `bets.ts` / `users.ts`). À l'échelle
école (quelques centaines de users, dizaines de matchs), lire tous les `bets` est
trivial — pas de vue SQL ni d'agrégation DB.

```
page.tsx (server)
  ├─ listPlayers()    ─┐  I/O server-only (supabaseAdmin)
  ├─ listAllBets()    ─┘  (lancés en parallèle)
  └─ buildLeaderboard(players, bets)   ← PUR, testé
        └─ rend <LeaderboardRow> + <CoalitionBadge>
```

### 3.1 Logique pure — `src/lib/leaderboard.ts`

```ts
export type LeaderboardPlayer = {
  id: string;
  login: string;
  avatar_url: string | null;
  coalition: { name: string; color: string; image_url: string | null } | null;
};

export type LeaderboardBet = {
  user_id: string;
  points_awarded: number | null;
};

export type LeaderboardEntry = {
  rank: number;
  login: string;
  avatarUrl: string | null;
  coalition: { name: string; color: string; image_url: string | null } | null;
  points: number;            // somme des points_awarded (null compté 0)
  bets: number;              // nb total de pronos
  accuracy: number | null;   // 0..1 ; null si aucun prono noté
};

export function buildLeaderboard(
  players: LeaderboardPlayer[],
  bets: LeaderboardBet[],
): LeaderboardEntry[];
```

**Algorithme :**
1. Grouper les `bets` par `user_id`.
2. Pour chaque joueur ayant ≥ 1 prono :
   - `points` = Σ `points_awarded` (chaque `null` compté 0)
   - `bets` = nombre de pronos
   - `scored` = pronos avec `points_awarded != null`
   - `wins` = pronos avec `points_awarded > 0`
   - `accuracy` = `scored > 0 ? wins / scored : null`
3. Trier par `points` décroissant, puis `login` croissant.
4. Attribuer le rang : 1er = rang 1 ; ensuite, à points égaux au précédent ⇒
   même rang, sinon rang = index + 1 (standard 1,1,3).

Fonction **totale**, aucune I/O, aucune dépendance temps. La somme des
`points_awarded` ne **réimplémente pas** le calcul des points (rule #7) : elle
agrège des valeurs déjà attribuées par le cron.

### 3.2 I/O mince (server-only)

Lecture via `supabaseAdmin` (service_role) car la table `bets` a une RLS
default-deny. **Seuls des agrégats** (points / nb / taux) sont renvoyés au client,
jamais les pronos individuels d'un joueur → aucune fuite de donnée privée.

- `src/lib/users.ts` → ajout `listPlayers(): Promise<LeaderboardPlayer[]>`
  ```ts
  supabaseAdmin
    .from("users")
    .select("id, login, avatar_url, coalition:coalitions(name, color, image_url)")
  ```
- `src/lib/bets.ts` → ajout `listAllBets(): Promise<LeaderboardBet[]>`
  ```ts
  supabaseAdmin.from("bets").select("user_id, points_awarded")
  ```

Convention repo : l'I/O n'est pas testée unitairement (cf. `matches.ts`,
`sync.ts`) ; validée par typecheck + lint + build.

### 3.3 Composant `src/components/coalition-badge.tsx`

Matérialise la skill `coalition-badge` (jusqu'ici uniquement spec). Fichier en
**kebab-case** pour suivre la convention du repo (`match-row.tsx`,
`bet-form.tsx`…) ; export `CoalitionBadge` (léger écart vs le chemin littéral
`CoalitionBadge.tsx` de la skill).

```tsx
type Props = {
  coalition: { name: string; color: string; image_url: string | null } | null;
  size?: "sm" | "md" | "lg"; // défaut "md"
};
export function CoalitionBadge({ coalition, size }: Props): JSX.Element;
```

Règles (skill) : couleur depuis `coalition.color` (DB), jamais hardcodée ;
fallback gris neutre « — » si `coalition` null ; `aria-label` = nom de la
coalition ; composant purement informatif (pas de lien).

### 3.4 Page `src/app/leaderboard/page.tsx` (server component)

- `export const dynamic = "force-dynamic"` — les points évoluent après chaque
  match ; le rendu ne doit pas être figé.
- Fetch `listPlayers()` + `listAllBets()` en parallèle (`Promise.all`), puis
  `buildLeaderboard`.
- Rendu : liste classée calquée sur l'esthétique de `/matches` (conteneur
  `max-w-2xl`, lignes `divide-y`). Par ligne : rang · avatar + login ·
  `<CoalitionBadge>` · points · nb pronos · taux (`accuracy` formaté en %, « — »
  si `null`).
- État vide (aucun prono) ⇒ message « Aucun pronostic pour l'instant. »

### 3.5 Navigation — `src/components/site-header.tsx`

Ajouter un lien `Classement` → `/leaderboard` dans la nav, pour rendre la page
atteignable (cible le `<nav>` existant, sans refonte du header).

## 4. Gestion d'erreur

- I/O : `throw new Error("listPlayers: …" / "listAllBets: …")` en cas d'erreur DB
  (cohérent avec `matches.ts` / `bets.ts`). Pas d'avalement silencieux.
- Fonction pure : totale, ne lève jamais.
- Avatar `null` ⇒ placeholder ; coalition `null` ⇒ badge neutre.

## 5. Tests

- `tests/leaderboard.test.ts` (fonction pure, ~9 cas) :
  1. liste vide ⇒ `[]`
  2. joueur sans aucun prono ⇒ exclu
  3. tri par points décroissant
  4. ex æquo ⇒ même rang, le suivant saute (1,1,3)
  5. ordre de départage par login à points égaux
  6. `accuracy` = wins / scored, pronos en attente exclus du dénominateur
  7. `accuracy` = `null` si aucun prono noté
  8. `points` somme correctement avec des `points_awarded` null (comptés 0)
  9. `coalition` null propagée telle quelle
- I/O : pas de test unitaire (convention repo).
- Build : vérifie `/leaderboard` listée `ƒ (Dynamic)`.

## 6. Hors périmètre (YAGNI)

- Classement **par coalition** (bonus brainstorming.md) — plus tard.
- Highlight de la ligne du joueur connecté — plus tard.
- Pagination / recherche — non nécessaire à l'échelle école.
- Page profil `/profile/:login` — brique distincte.

## 7. Pas de migration

`users`, `bets`, `coalitions` existent déjà (migrations 0001/0002/0004), avec
l'index `users_total_points_idx` (non utilisé ici car on agrège depuis `bets`,
mais aucun changement de schéma requis).

## 8. Conventions repo à respecter

- Fonction pure testée, I/O séparée (SRP, AGENTS.md §10).
- `supabaseAdmin` server-only ; jamais importé dans un `"use client"` (rule #3).
- Calcul des points jamais réimplémenté (rule #7) — on agrège `points_awarded`.
- JSX français : apostrophes via `&apos;`.
- Commits : `type(scope): description` impérative ≤ 72 char, scope `leaderboard`.
