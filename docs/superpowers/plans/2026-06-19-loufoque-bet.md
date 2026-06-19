# Pari le plus loufoque de la semaine 🃏 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une carte 🃏 « Pari loufoque de la semaine » sous la « 🍺 Bière de la semaine » : le score exact (3 pts) deviné par le moins de joueurs de la semaine en cours.

**Architecture:** Logique pure isolée (`src/lib/loufoque.ts`), I/O Supabase séparée (`bets.ts`), UI en composant server (`loufoque-bet-card.tsx`), câblée dans la page classement. Réutilise `currentWeekWindow` (semaine en cours, vendredi→vendredi Zurich). Aucun recalcul de points : on lit `points_awarded === 3`.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript strict, Vitest, Supabase (service_role server-only).

**Spec :** `docs/superpowers/specs/2026-06-19-loufoque-bet-design.md`

## Global Constraints

- Aucun recalcul de points (rule #7) : filtrer `points_awarded === 3`, jamais recalculer.
- I/O Supabase server-only via `supabaseAdmin` (table `bets` = RLS default-deny). Jamais dans un composant `"use client"`.
- Logique métier pure séparée de l'I/O (SRP). `buildLoufoqueBet` = pure, sans I/O ni temps.
- TypeScript strict. Réutiliser les types existants (`LeaderboardCoalition`, `LeaderboardPlayer`) — pas de duplication.
- Classement loufoque : rareté (`scorersCount`) **asc**, puis total de buts **desc**, puis `login` **asc**. `scorersCount` = scoreurs mappés à un joueur connu.
- Conventional commits (`type(scope): description` impérative ≤ 72 char).
- Fenêtre = `currentWeekWindow` (semaine en cours), bornes `[start, end)`.

---

## File Structure

- **Create** `src/lib/loufoque.ts` — types `LoufoqueBet`, `LoufoqueWinner` + `buildLoufoqueBet` (pur).
- **Create** `tests/loufoque.test.ts` — tests de `buildLoufoqueBet`.
- **Modify** `src/lib/bets.ts` — `listExactScoreBetsWithMatch()` (I/O).
- **Create** `src/components/loufoque-bet-card.tsx` — carte 🃏 (server component).
- **Modify** `src/app/leaderboard/page.tsx` — fetch + build + rendu carte.

---

## Task 1 : Logique pure `buildLoufoqueBet`

**Files:**
- Create: `src/lib/loufoque.ts`
- Test: `tests/loufoque.test.ts`

**Interfaces:**
- Consumes: `LeaderboardCoalition`, `LeaderboardPlayer` depuis `@/lib/leaderboard`.
- Produces: `type LoufoqueBet`, `type LoufoqueWinner`, `function buildLoufoqueBet(bets: LoufoqueBet[], players: LeaderboardPlayer[], weekWindow: { start: Date; end: Date }): LoufoqueWinner | null`.

- [ ] **Step 1 : Écrire les tests qui échouent**

`tests/loufoque.test.ts` :
```ts
import { describe, test, expect } from "vitest";

import { buildLoufoqueBet, type LoufoqueBet } from "../src/lib/loufoque";
import type { LeaderboardPlayer } from "../src/lib/leaderboard";

const COA = { ft_id: 192, name: "The Federation", color: "#39c2c2", image_url: null };

function player(
  id: string,
  login: string,
  coalition: LeaderboardPlayer["coalition"] = null,
): LeaderboardPlayer {
  return { id, login, avatar_url: null, total_points: 0, coalition };
}

const WIN = {
  start: new Date("2026-06-18T22:00:00Z"), // vendredi 19/06 00:00 Zurich
  end: new Date("2026-06-25T22:00:00Z"), // vendredi 26/06 00:00 Zurich
};
const IN = "2026-06-20T18:00:00Z"; // dans la fenêtre
const OUT = "2026-06-10T18:00:00Z"; // hors fenêtre

function bet(
  user_id: string,
  match_id: string,
  homeScore: number,
  awayScore: number,
  kickoff_at = IN,
): LoufoqueBet {
  return {
    user_id,
    match_id,
    kickoff_at,
    home_team: `${match_id}-home`,
    away_team: `${match_id}-away`,
    home_score: homeScore,
    away_score: awayScore,
  };
}

describe("buildLoufoqueBet", () => {
  test("aucun pari → null", () => {
    expect(buildLoufoqueBet([], [player("u1", "alice")], WIN)).toBeNull();
  });

  test("pari hors fenêtre ignoré → null", () => {
    const bets = [bet("u1", "m1", 4, 3, OUT)];
    expect(buildLoufoqueBet(bets, [player("u1", "alice")], WIN)).toBeNull();
  });

  test("rareté : 1 scoreur bat 2 scoreurs", () => {
    const players = [player("u1", "alice"), player("u2", "bob"), player("u3", "carol")];
    const bets = [
      bet("u1", "m1", 2, 1), // m1 : alice seule (rareté 1)
      bet("u2", "m2", 0, 0), // m2 : bob + carol (rareté 2)
      bet("u3", "m2", 0, 0),
    ];
    const res = buildLoufoqueBet(bets, players, WIN);
    expect(res?.login).toBe("alice");
    expect(res?.scorersCount).toBe(1);
    expect([res?.homeScore, res?.awayScore]).toEqual([2, 1]);
  });

  test("égalité de rareté → plus de buts gagne", () => {
    const players = [player("u1", "alice"), player("u2", "bob")];
    const bets = [
      bet("u1", "m1", 1, 0), // rareté 1, 1 but
      bet("u2", "m2", 4, 3), // rareté 1, 7 buts
    ];
    const res = buildLoufoqueBet(bets, players, WIN);
    expect(res?.login).toBe("bob");
    expect(res?.homeScore).toBe(4);
    expect(res?.awayScore).toBe(3);
  });

  test("égalité rareté et buts → login départage", () => {
    const players = [player("u1", "zoe"), player("u2", "bob")];
    const bets = [
      bet("u1", "m1", 1, 1), // zoe, rareté 1, 2 buts
      bet("u2", "m2", 1, 1), // bob, rareté 1, 2 buts
    ];
    const res = buildLoufoqueBet(bets, players, WIN);
    expect(res?.login).toBe("bob"); // bob < zoe
  });

  test("user_id sans joueur correspondant → ignoré", () => {
    const players = [player("u1", "alice")];
    const bets = [
      bet("ghost", "m1", 5, 5), // inconnu : gros score mais exclu
      bet("u1", "m2", 1, 0),
    ];
    const res = buildLoufoqueBet(bets, players, WIN);
    expect(res?.login).toBe("alice");
    expect(res?.scorersCount).toBe(1);
  });

  test("plusieurs scoreurs sur le match gagnant : login + scorersCount", () => {
    const players = [player("u1", "zoe"), player("u2", "bob")];
    const bets = [
      bet("u1", "m1", 3, 2),
      bet("u2", "m1", 3, 2),
    ];
    const res = buildLoufoqueBet(bets, players, WIN);
    expect(res?.login).toBe("bob");
    expect(res?.scorersCount).toBe(2);
  });

  test("coalition du joueur transmise", () => {
    const players = [player("u1", "alice", COA)];
    const bets = [bet("u1", "m1", 2, 2)];
    const res = buildLoufoqueBet(bets, players, WIN);
    expect(res?.coalition).toEqual(COA);
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npm test -- loufoque`
Expected: FAIL — `Cannot find module '../src/lib/loufoque'`.

- [ ] **Step 3 : Implémenter**

`src/lib/loufoque.ts` :
```ts
// src/lib/loufoque.ts
// Pari le plus loufoque de la semaine — logique PURE (aucune I/O, aucun temps).
// Le "loufoque" = le score exact (points_awarded = 3, filtré à la source) deviné
// par le MOINS de joueurs sur la semaine. Aucun recalcul de points (rule #7).
// Classement : rareté asc, total de buts desc, login asc. Testée dans
// tests/loufoque.test.ts.

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
  scorersCount: number; // nb de joueurs connus ayant trouvé ce score exact
};

/**
 * Désigne le pari le plus loufoque de la fenêtre [start, end) : le score exact
 * (paris déjà à 3 pts) deviné par le moins de joueurs. Regroupe par match (un
 * match n'a qu'un score exact = son résultat), exclut les user_id sans joueur
 * connu, et trie rareté asc / total buts desc / login asc. Null si aucun
 * candidat.
 */
export function buildLoufoqueBet(
  bets: LoufoqueBet[],
  players: LeaderboardPlayer[],
  weekWindow: { start: Date; end: Date },
): LoufoqueWinner | null {
  const startMs = weekWindow.start.getTime();
  const endMs = weekWindow.end.getTime();
  const playerById = new Map(players.map((p) => [p.id, p]));

  // 1. Regrouper les scoreurs (mappés à un joueur connu) par match, dans la fenêtre.
  type Group = {
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    scorers: LeaderboardPlayer[];
  };
  const byMatch = new Map<string, Group>();
  for (const b of bets) {
    const t = new Date(b.kickoff_at).getTime();
    if (t < startMs || t >= endMs) continue;
    const p = playerById.get(b.user_id);
    if (!p) continue;
    const g = byMatch.get(b.match_id);
    if (g) {
      g.scorers.push(p);
    } else {
      byMatch.set(b.match_id, {
        homeTeam: b.home_team,
        awayTeam: b.away_team,
        homeScore: b.home_score,
        awayScore: b.away_score,
        scorers: [p],
      });
    }
  }

  // 2. Un candidat par match : son scoreur au login le plus petit.
  const candidates = [...byMatch.values()].map((g) => {
    const winner = g.scorers.reduce((a, b) =>
      a.login.localeCompare(b.login) <= 0 ? a : b,
    );
    return {
      login: winner.login,
      avatarUrl: winner.avatar_url,
      coalition: winner.coalition,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      scorersCount: g.scorers.length,
    };
  });

  if (candidates.length === 0) return null;

  // 3. Tri : rareté asc, total de buts desc, login asc (déterministe, gère aussi
  // les égalités entre matchs différents).
  candidates.sort(
    (a, b) =>
      a.scorersCount - b.scorersCount ||
      b.homeScore + b.awayScore - (a.homeScore + a.awayScore) ||
      a.login.localeCompare(b.login),
  );

  return candidates[0];
}
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `npm test -- loufoque`
Expected: PASS (8 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/loufoque.ts tests/loufoque.test.ts
git commit -m "feat(loufoque): buildLoufoqueBet (score exact le plus rare, pur)"
```

---

## Task 2 : Requête des paris score-exact + match

**Files:**
- Modify: `src/lib/bets.ts`

**Interfaces:**
- Consumes: `LoufoqueBet` depuis `@/lib/loufoque` ; `supabaseAdmin` (déjà importé).
- Produces: `async function listExactScoreBetsWithMatch(): Promise<LoufoqueBet[]>`.

> Pas de test unitaire (I/O Supabase, suit le patron des autres `list*`). Vérification par typecheck.

- [ ] **Step 1 : Ajouter l'import du type**

Dans `src/lib/bets.ts`, ajouter après la ligne `import type { LeaderboardBet, WeeklyBet } from "@/lib/leaderboard";` :
```ts
import type { LoufoqueBet } from "@/lib/loufoque";
```

- [ ] **Step 2 : Ajouter la fonction en fin de fichier**

```ts
/**
 * Paris ayant trouvé le SCORE EXACT (points_awarded = 3) joints à leur match
 * (équipes, score réel, kickoff), pour le "pari le plus loufoque de la semaine".
 * Lecture server-only via service_role (bets = RLS default-deny). Normalise le
 * match imbriqué en objet|null (supabase-js peut le typer objet OU tableau).
 */
export async function listExactScoreBetsWithMatch(): Promise<LoufoqueBet[]> {
  const { data, error } = await supabaseAdmin
    .from("bets")
    .select(
      "user_id, match_id, match:matches(home_team, away_team, home_score, away_score, kickoff_at)",
    )
    .eq("points_awarded", 3);

  if (error) throw new Error(`listExactScoreBetsWithMatch: ${error.message}`);

  type MatchRow = {
    home_team: string;
    away_team: string;
    home_score: number | null;
    away_score: number | null;
    kickoff_at: string;
  };

  return (data ?? []).flatMap((row) => {
    const m = row.match as MatchRow | MatchRow[] | null;
    const match = Array.isArray(m) ? (m[0] ?? null) : m;
    // match non null (FK) ; score réel non null car points_awarded=3 implique un
    // match fini et scoré (garde pour satisfaire le typage nullable du schéma).
    if (match === null || match.home_score === null || match.away_score === null) {
      return [];
    }
    return [
      {
        user_id: row.user_id,
        match_id: row.match_id,
        kickoff_at: match.kickoff_at,
        home_team: match.home_team,
        away_team: match.away_team,
        home_score: match.home_score,
        away_score: match.away_score,
      },
    ];
  });
}
```

- [ ] **Step 3 : Typecheck**

Run: `npm run typecheck`
Expected: pas d'erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/bets.ts
git commit -m "feat(loufoque): listExactScoreBetsWithMatch (paris score exact + match)"
```

---

## Task 3 : Carte « Pari loufoque »

**Files:**
- Create: `src/components/loufoque-bet-card.tsx`

**Interfaces:**
- Consumes: `LoufoqueWinner` depuis `@/lib/loufoque` ; `CoalitionBadge` depuis `@/components/coalition-badge` ; `Link` depuis `next/link`.
- Produces: `function LoufoqueBetCard({ loufoque }: { loufoque: LoufoqueWinner | null })`.

- [ ] **Step 1 : Créer le composant**

`src/components/loufoque-bet-card.tsx` :
```tsx
// Carte du pari le plus loufoque de la semaine : le score exact deviné par le
// moins de joueurs. Server component, sans état. Reçoit le gagnant (ou null).
import Link from "next/link";

import { CoalitionBadge } from "@/components/coalition-badge";
import type { LoufoqueWinner } from "@/lib/loufoque";

export function LoufoqueBetCard({
  loufoque,
}: {
  loufoque: LoufoqueWinner | null;
}) {
  return (
    <section className="glass rise mb-4 flex items-center gap-4 p-4">
      <span className="text-3xl" aria-hidden>
        🃏
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Pari loufoque de la semaine
        </p>
        {loufoque ? (
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <Link
                href={`/profile/${loufoque.login}`}
                aria-label={`Profil de ${loufoque.login}`}
                className="shrink-0 rounded-full ring-white/0 transition-shadow hover:ring-2 hover:ring-accent/60"
              >
                {loufoque.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={loufoque.avatarUrl}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="block h-10 w-10 rounded-full bg-white/10" />
                )}
              </Link>
              <Link
                href={`/profile/${loufoque.login}`}
                className="min-w-0 flex-1 truncate font-bold transition-colors hover:text-accent"
              >
                {loufoque.login}
              </Link>
              <CoalitionBadge coalition={loufoque.coalition} size="sm" />
            </div>
            <p className="text-sm text-zinc-300">
              <span className="font-semibold">
                {loufoque.homeTeam} {loufoque.homeScore}–{loufoque.awayScore}{" "}
                {loufoque.awayTeam}
              </span>{" "}
              —{" "}
              {loufoque.scorersCount === 1
                ? "seul à avoir trouvé le score exact"
                : `l'un des ${loufoque.scorersCount} à avoir trouvé le score exact`}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-300">
            Pas encore de pari loufoque cette semaine 🃏
          </p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2 : Typecheck + lint**

Run: `npm run typecheck && npx eslint src/components/loufoque-bet-card.tsx`
Expected: pas d'erreur (eslint exit 0).

> Note : si le wrapper `npm run lint` / `npx eslint` renvoie une erreur de parsing JSON dans cet environnement (hook RTK), valider avec `./node_modules/.bin/eslint src/components/loufoque-bet-card.tsx` (doit sortir en code 0).

- [ ] **Step 3 : Commit**

```bash
git add src/components/loufoque-bet-card.tsx
git commit -m "feat(loufoque): composant LoufoqueBetCard (🃏 pari loufoque)"
```

---

## Task 4 : Câblage de la page classement

**Files:**
- Modify: `src/app/leaderboard/page.tsx`

**Interfaces:**
- Consumes: `listExactScoreBetsWithMatch` (Task 2), `buildLoufoqueBet` (Task 1), `LoufoqueBetCard` (Task 3).

État actuel du fichier (rappel) : la page importe déjà `listAllBets, listScoredBetsWithKickoff` depuis `@/lib/bets`, calcule `now`/`week`/`weekly`/`winner`, et rend `<WeeklyWinnerCard winner={winner} />` puis `<LeaderboardTabs … />` dans un fragment `<>…</>` (branche `entries.length === 0 ? … : (…)`).

- [ ] **Step 1 : Ajouter les imports**

Dans `src/app/leaderboard/page.tsx` :

1. Remplacer la ligne d'import de `@/lib/bets` :
```ts
import { listAllBets, listScoredBetsWithKickoff } from "@/lib/bets";
```
par :
```ts
import {
  listAllBets,
  listScoredBetsWithKickoff,
  listExactScoreBetsWithMatch,
} from "@/lib/bets";
```

2. Ajouter après l'import de `@/components/weekly-winner-card` :
```ts
import { buildLoufoqueBet } from "@/lib/loufoque";
import { LoufoqueBetCard } from "@/components/loufoque-bet-card";
```

- [ ] **Step 2 : Fetch + build**

Remplacer le bloc :
```ts
  const [players, bets, weeklyBets] = await Promise.all([
    listPlayers(),
    listAllBets(),
    listScoredBetsWithKickoff(),
  ]);
  const entries = buildLeaderboard(players, bets);
  const weekly = buildWeeklyLeaderboard(weeklyBets, players, week);
  const winner = weekly[0] ?? null;
```
par :
```ts
  const [players, bets, weeklyBets, exactBets] = await Promise.all([
    listPlayers(),
    listAllBets(),
    listScoredBetsWithKickoff(),
    listExactScoreBetsWithMatch(),
  ]);
  const entries = buildLeaderboard(players, bets);
  const weekly = buildWeeklyLeaderboard(weeklyBets, players, week);
  const winner = weekly[0] ?? null;
  const loufoque = buildLoufoqueBet(exactBets, players, week);
```

- [ ] **Step 3 : Rendre la carte sous la Bière**

Remplacer :
```tsx
          <WeeklyWinnerCard winner={winner} />
          <LeaderboardTabs
```
par :
```tsx
          <WeeklyWinnerCard winner={winner} />
          <LoufoqueBetCard loufoque={loufoque} />
          <LeaderboardTabs
```

- [ ] **Step 4 : Typecheck + lint + tests + build**

Run: `npm run typecheck && npx eslint src/app/leaderboard/page.tsx && npm test && npm run build`
Expected: tout vert ; build OK ; `/leaderboard` présent dans la sortie des routes.

> Note : si `npx eslint` échoue sur le parsing JSON (hook RTK), valider via `./node_modules/.bin/eslint src/app/leaderboard/page.tsx` (code 0).

- [ ] **Step 5 : Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "feat(loufoque): câble la carte pari loufoque sous la bière"
```

---

## Task 5 : Vérification finale

**Files:** aucun (gates qualité).

- [ ] **Step 1 : Suite complète**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: tout vert (les 8 tests `buildLoufoqueBet` inclus). Si `npm run lint` échoue sur le parsing JSON (hook RTK), valider via `./node_modules/.bin/eslint .` (code 0).

- [ ] **Step 2 : Vérification manuelle**

`npm run dev`, connecté, ouvrir `/leaderboard` :
- La carte « 🃏 Pari loufoque de la semaine » apparaît **juste sous** « 🍺 Bière de la semaine ».
- Si un score exact a été deviné cette semaine : avatar + login (lien profil) + badge coalition, le match `Équipe A h–a Équipe B`, et la mention « seul à avoir trouvé le score exact » (ou « l'un des N… »).
- Sinon : « Pas encore de pari loufoque cette semaine 🃏 ».

---

## Couverture spec (auto-review)

- §2 règle métier (rareté asc / buts desc / login ; fenêtre en cours ; 3 pts) → Task 1.
- §3.1 `buildLoufoqueBet` + types `LoufoqueBet`/`LoufoqueWinner` → Task 1.
- §3.2 `listExactScoreBetsWithMatch` (I/O, normalisation match) → Task 2.
- §3.3 carte `LoufoqueBetCard` (joueur, match+score, rareté en toutes lettres, badge) → Task 3.
- §3.4 câblage page (fetch + build + rendu sous la Bière) → Task 4.
- §4 cas limites (vide → null/carte « pas de pari » ; hors fenêtre ; 1 vs 2 scoreurs ; égalité buts puis login ; user inconnu ; sans coalition) → Task 1 (tests), Task 3, Task 4.
- §6 tests + non-régression → Task 1, Task 5.
```
