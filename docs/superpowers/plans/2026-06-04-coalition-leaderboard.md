# Classement par coalition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une section « Par coalition » en haut de `/leaderboard`, classant les coalitions à la moyenne de points par parieur actif (total + nb joueurs affichés).

**Architecture:** Feature purement additive et DRY. La page `/leaderboard` calcule déjà `buildLeaderboard(players, bets)` → `LeaderboardEntry[]`. On ajoute une fonction pure `buildCoalitionLeaderboard(entries)` qui agrège ces entrées par coalition, et on rend une section au-dessus du classement individuel. Aucune nouvelle requête DB, aucune migration.

**Tech Stack:** TypeScript strict, Vitest, Next.js 16 (server component `force-dynamic` existant), React 19, Tailwind v4, `CoalitionBadge` existant.

**Spec:** `docs/superpowers/specs/2026-06-04-coalition-leaderboard-design.md`

---

## File Structure

| Fichier | Responsabilité | Type |
|---|---|---|
| `src/lib/leaderboard.ts` | Ajout du type `CoalitionStanding` + fonction pure `buildCoalitionLeaderboard` (agrégation par coalition, tri moyenne, rang 1,1,3) | modifié |
| `tests/leaderboard.test.ts` | Ajout d'un `describe("buildCoalitionLeaderboard")` | modifié |
| `src/app/leaderboard/page.tsx` | Rend la section « Par coalition » au-dessus de l'individuel | modifié |

`buildLeaderboard`, `LeaderboardEntry` et `CoalitionBadge` sont réutilisés tels quels. Aucune I/O, aucune migration.

---

## Task 1: Fonction pure `buildCoalitionLeaderboard` (`leaderboard.ts`)

**Files:**
- Modify: `src/lib/leaderboard.ts`
- Test: `tests/leaderboard.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/leaderboard.test.ts`, add `buildCoalitionLeaderboard` and `LeaderboardEntry` to the existing import from `../src/lib/leaderboard` so the import block becomes:

```ts
import {
  buildCoalitionLeaderboard,
  buildLeaderboard,
  type LeaderboardBet,
  type LeaderboardEntry,
  type LeaderboardPlayer,
} from "../src/lib/leaderboard";
```

Then append this new `describe` block at the end of the file (after the closing `});` of the existing `describe("buildLeaderboard", ...)`):

```ts
const FED = { name: "Federation", color: "#39c2c2", image_url: null };
const ORDER = { name: "Order", color: "#9b59b6", image_url: null };
const ALLI = { name: "Alliance", color: "#e67e22", image_url: null };

function entry(
  login: string,
  points: number,
  coalition: LeaderboardEntry["coalition"],
): LeaderboardEntry {
  return {
    rank: 0,
    login,
    avatarUrl: null,
    coalition,
    points,
    bets: 0,
    accuracy: null,
  };
}

describe("buildCoalitionLeaderboard", () => {
  test("aucune entrée -> []", () => {
    expect(buildCoalitionLeaderboard([])).toEqual([]);
  });

  test("entrées sans coalition -> exclues", () => {
    const entries = [entry("alice", 5, null), entry("bob", 3, null)];
    expect(buildCoalitionLeaderboard(entries)).toEqual([]);
  });

  test("agrège total, nb joueurs et moyenne par coalition", () => {
    const entries = [
      entry("alice", 3, FED),
      entry("bob", 1, FED),
      entry("carol", 5, ORDER),
    ];
    const r = buildCoalitionLeaderboard(entries);
    const fed = r.find((c) => c.coalition.name === "Federation")!;
    const order = r.find((c) => c.coalition.name === "Order")!;
    expect(fed.totalPoints).toBe(4);
    expect(fed.players).toBe(2);
    expect(fed.average).toBe(2);
    expect(order.totalPoints).toBe(5);
    expect(order.players).toBe(1);
    expect(order.average).toBe(5);
  });

  test("tri par moyenne décroissante : petite coalition efficace devant", () => {
    // ORDER : 1 joueur à 5 (moy 5) ; FED : 2 joueurs à 3+1 (moy 2).
    const entries = [
      entry("alice", 3, FED),
      entry("bob", 1, FED),
      entry("carol", 5, ORDER),
    ];
    const r = buildCoalitionLeaderboard(entries);
    expect(r.map((c) => c.coalition.name)).toEqual(["Order", "Federation"]);
    expect(r.map((c) => c.rank)).toEqual([1, 2]);
  });

  test("ex æquo sur la moyenne -> rang 1,1,3, départage total puis name", () => {
    // FED moy 2 (1 joueur, total 2), ORDER moy 2 (1 joueur, total 2),
    // ALLI moy 1 (1 joueur). FED et ORDER ex æquo -> départage par name
    // (Federation < Order). Rangs attendus : 1,1,3.
    const entries = [
      entry("alice", 2, ORDER),
      entry("bob", 2, FED),
      entry("carol", 1, ALLI),
    ];
    const r = buildCoalitionLeaderboard(entries);
    expect(r.map((c) => c.coalition.name)).toEqual([
      "Federation",
      "Order",
      "Alliance",
    ]);
    expect(r.map((c) => c.rank)).toEqual([1, 1, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/leaderboard.test.ts`
Expected: FAIL — `buildCoalitionLeaderboard` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/leaderboard.ts`, append at the end of the file (after `buildLeaderboard`):

```ts
export type CoalitionStanding = {
  rank: number;
  coalition: { name: string; color: string; image_url: string | null };
  totalPoints: number;
  players: number; // nb de parieurs actifs de la coalition
  average: number; // totalPoints / players (float, arrondi à l'affichage)
};

/**
 * Classement des coalitions à la moyenne de points par parieur actif. Agrège la
 * sortie de buildLeaderboard (déjà filtrée aux parieurs actifs) — aucun recalcul
 * de points (rule #7). Exclut les joueurs sans coalition. Testée dans
 * tests/leaderboard.test.ts.
 */
export function buildCoalitionLeaderboard(
  entries: LeaderboardEntry[],
): CoalitionStanding[] {
  // 1. Regrouper par coalition (clé = nom, unique par campus), exclure les nuls.
  const byName = new Map<
    string,
    {
      coalition: NonNullable<LeaderboardEntry["coalition"]>;
      totalPoints: number;
      players: number;
    }
  >();
  for (const e of entries) {
    if (e.coalition === null) continue;
    const acc = byName.get(e.coalition.name);
    if (acc) {
      acc.totalPoints += e.points;
      acc.players += 1;
    } else {
      byName.set(e.coalition.name, {
        coalition: e.coalition,
        totalPoints: e.points,
        players: 1,
      });
    }
  }

  // 2. Moyenne par coalition.
  const aggregated = [...byName.values()].map((a) => ({
    coalition: a.coalition,
    totalPoints: a.totalPoints,
    players: a.players,
    average: a.totalPoints / a.players,
  }));

  // 3. Tri : moyenne décroissante, départage total décroissant puis nom croissant.
  aggregated.sort(
    (a, b) =>
      b.average - a.average ||
      b.totalPoints - a.totalPoints ||
      a.coalition.name.localeCompare(b.coalition.name),
  );

  // 4. Rang standard (1,1,3) sur la moyenne : même rang à moyenne égale.
  let lastAvg: number | null = null;
  let lastRank = 0;
  return aggregated.map((entry, index) => {
    const rank =
      lastAvg !== null && entry.average === lastAvg ? lastRank : index + 1;
    lastAvg = entry.average;
    lastRank = rank;
    return { rank, ...entry };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/leaderboard.test.ts`
Expected: PASS (existants + 5 nouveaux).

- [ ] **Step 5: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/leaderboard.ts tests/leaderboard.test.ts
git commit -m "feat(coalition): pure buildCoalitionLeaderboard (moyenne + rang)"
```

---

## Task 2: Section UI « Par coalition » (`leaderboard/page.tsx`)

**Files:**
- Modify: `src/app/leaderboard/page.tsx`

Pas de test (server component, comme la page actuelle). Vérifié par build.

- [ ] **Step 1: Replace the page with the version including the coalition section**

Overwrite `src/app/leaderboard/page.tsx` entirely with:

```tsx
// src/app/leaderboard/page.tsx
import Link from "next/link";

import { CoalitionBadge } from "@/components/coalition-badge";
import { listAllBets } from "@/lib/bets";
import {
  buildCoalitionLeaderboard,
  buildLeaderboard,
} from "@/lib/leaderboard";
import { listPlayers } from "@/lib/users";

// Les points évoluent après chaque match : le rendu ne doit pas être figé.
export const dynamic = "force-dynamic";

const PCT_FMT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});

const AVG_FMT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export default async function LeaderboardPage() {
  const [players, bets] = await Promise.all([listPlayers(), listAllBets()]);
  const entries = buildLeaderboard(players, bets);
  const coalitions = buildCoalitionLeaderboard(entries);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Classement</h1>

      {entries.length === 0 ? (
        <p className="text-zinc-500">Aucun pronostic pour l&apos;instant.</p>
      ) : (
        <>
          {coalitions.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
                Par coalition
              </h2>
              <ul className="divide-y divide-black/5 rounded-lg border border-black/10 dark:divide-white/5 dark:border-white/10">
                {coalitions.map((c) => (
                  <li
                    key={c.coalition.name}
                    className="flex items-center gap-3 px-4 py-3 text-sm"
                  >
                    <span className="w-6 shrink-0 text-center font-semibold tabular-nums text-zinc-500">
                      {c.rank}
                    </span>
                    <CoalitionBadge coalition={c.coalition} size="md" />
                    <span className="flex-1" />
                    <span className="shrink-0 text-right font-semibold tabular-nums">
                      {AVG_FMT.format(c.average)} pt/j
                    </span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-zinc-500">
                      {c.totalPoints} pt
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-zinc-500">
                      {c.players} {c.players > 1 ? "joueurs" : "joueur"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
            Individuel
          </h2>
          <div className="flex items-center gap-3 px-4 pb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            <span className="w-6" />
            <span className="w-8" />
            <span className="flex-1">Joueur</span>
            <span className="w-14 text-right">Réussite</span>
            <span className="w-10 text-right">Pronos</span>
            <span className="w-12 text-right">Points</span>
          </div>

          <ul className="divide-y divide-black/5 rounded-lg border border-black/10 dark:divide-white/5 dark:border-white/10">
            {entries.map((e) => (
              <li
                key={e.login}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <span className="w-6 shrink-0 text-center font-semibold tabular-nums text-zinc-500">
                  {e.rank}
                </span>
                {e.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.avatarUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                )}
                <Link
                  href={`/profile/${e.login}`}
                  className="flex-1 truncate font-medium hover:underline"
                >
                  {e.login}
                </Link>
                <CoalitionBadge coalition={e.coalition} size="sm" />
                <span className="w-14 shrink-0 text-right tabular-nums">
                  {e.accuracy === null ? "—" : PCT_FMT.format(e.accuracy)}
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums text-zinc-500">
                  {e.bets}
                </span>
                <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
                  {e.points} pt
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint + build**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds; `/leaderboard` listed as Dynamic (ƒ).

- [ ] **Step 3: Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "feat(coalition): section Par coalition au-dessus du classement individuel"
```

---

## Task 3: Vérifs finales + merge dans `main`

**Files:** aucun (gates + intégration).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: tous verts (70 existants + 5 nouveaux = 75).

- [ ] **Step 2: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: aucune erreur ; `/leaderboard` en Dynamic (ƒ).

- [ ] **Step 3: Garde anti-fuite + cohérence**

Run: `grep -rn "use client" src/app/leaderboard || echo "OK: aucun use client"`
Expected: aucun `"use client"` (page serveur).

Run: `git diff main -- src/lib/leaderboard.ts | grep -i "calcBetPoints" || echo "OK: aucun recalcul de points"`
Expected: aucun recalcul de points (règle #7).

- [ ] **Step 4: Self-review du diff**

Run: `git diff main --stat`
Relire : 3 fichiers (leaderboard.ts, leaderboard.test.ts, page.tsx), pas de secret.

- [ ] **Step 5: Merge no-ff dans main**

```bash
git checkout main
git merge --no-ff feat/coalition-leaderboard -m "merge: classement par coalition (section /leaderboard)"
```

- [ ] **Step 6: Re-vérifier main vert + nettoyer la branche**

```bash
npm test && npm run typecheck && npm run lint
git branch -d feat/coalition-leaderboard
```

Expected: tout vert sur `main`, branche supprimée.

---

## Notes d'implémentation

- **Règle #7** : `buildCoalitionLeaderboard` ne recalcule aucun point ; il somme les `points` déjà agrégés par `buildLeaderboard`.
- **DRY** : aucune nouvelle requête DB. La page appelait déjà `buildLeaderboard` ; on réutilise sa sortie.
- **Clé de regroupement** : `coalition.name` (les noms sont uniques par campus ; `LeaderboardEntry.coalition` ne porte pas d'`id`).
- **Section conditionnelle** : si aucune coalition (aucun parieur actif n'a de coalition), la section n'est pas rendue.
- **Branche** : créer `feat/coalition-leaderboard` depuis `main` avant la Task 1.
```
