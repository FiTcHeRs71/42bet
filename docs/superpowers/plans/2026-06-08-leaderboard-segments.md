# Refonte du Classement (segments coalitions + camps) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir la page Classement avec 3 vues coalitions (cursus / piscine / les 6), un classement des 2 camps (Students vs Piscineux) et un classement individuel filtrable par camp — sans toucher la DB.

**Architecture:** Toute la logique reste **pure** dans `src/lib` (aucun recalcul de points, source de vérité = `users.total_points`). La page serveur calcule toutes les vues et délègue le rendu interactif (onglets/filtres en `useState`) à un nouveau composant client. La distinction cursus/piscine se déduit du `ft_id` de la coalition.

**Tech Stack:** Next.js 16 (App Router, server + client components), React 19, TypeScript strict, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-08-leaderboard-segments-design.md`

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/coalitions.ts` | + `coalitionGroupOf(ftId)` + type `CoalitionGroup` |
| `src/lib/leaderboard.ts` | + `assignRanks` (extrait), + `buildCampStandings` + type `CampStanding` |
| `src/app/leaderboard/page.tsx` | fetch + calcul de toutes les vues, délègue au client |
| `src/components/leaderboard-tabs.tsx` | **nouveau** — onglets/filtres + rendu (client) |
| `tests/leaderboard.test.ts` | tests étendus (groupe, ranks, camps) |

Conventions de vérification (AGENTS.md §6) entre tâches : `npm test`, `npm run typecheck`, `npm run lint`.

---

## Task 1: `coalitionGroupOf` (cursus vs piscine)

**Files:**
- Modify: `src/lib/coalitions.ts`
- Test: `tests/leaderboard.test.ts`

- [ ] **Step 1: Write the failing test**

Ajouter en haut de `tests/leaderboard.test.ts`, l'import depuis coalitions :

```ts
import { coalitionGroupOf } from "../src/lib/coalitions";
```

Puis ajouter ce bloc de tests (à la fin du fichier) :

```ts
describe("coalitionGroupOf", () => {
  test("coalitions cursus 21 -> cursus", () => {
    expect(coalitionGroupOf(191)).toBe("cursus");
    expect(coalitionGroupOf(192)).toBe("cursus");
    expect(coalitionGroupOf(193)).toBe("cursus");
  });

  test("coalitions piscine (cursus 9) -> piscine", () => {
    expect(coalitionGroupOf(166)).toBe("piscine");
    expect(coalitionGroupOf(167)).toBe("piscine");
    expect(coalitionGroupOf(168)).toBe("piscine");
  });

  test("cursus legacy (1) -> cursus", () => {
    expect(coalitionGroupOf(188)).toBe("cursus");
  });

  test("ft_id inconnu -> cursus (fallback)", () => {
    expect(coalitionGroupOf(99999)).toBe("cursus");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/leaderboard.test.ts -t coalitionGroupOf`
Expected: FAIL — `coalitionGroupOf is not a function` / import error.

- [ ] **Step 3: Write minimal implementation**

Dans `src/lib/coalitions.ts`, juste après la définition de `COALITION_CURSUS_PRIORITY`, ajouter :

```ts
export type CoalitionGroup = "cursus" | "piscine";

/**
 * Groupe d'une coalition d'après son cursus. La Piscine (cursus 9, priorité 2)
 * => "piscine" ; tout le reste (cursus 21 / legacy 1 / inconnu) => "cursus".
 * Sert à distinguer students et piscineux SANS colonne DB dédiée : un joueur
 * en cursus est toujours rattaché à sa coalition de cursus (cf. pickUserCoalition).
 */
export function coalitionGroupOf(ftId: number): CoalitionGroup {
  return COALITION_CURSUS_PRIORITY[ftId] === 2 ? "piscine" : "cursus";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/leaderboard.test.ts -t coalitionGroupOf`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coalitions.ts tests/leaderboard.test.ts
git commit -m "feat(leaderboard): coalitionGroupOf — cursus vs piscine depuis ft_id"
```

---

## Task 2: extraire `assignRanks` (refactor pur, non-régression)

**Files:**
- Modify: `src/lib/leaderboard.ts`
- Test: `tests/leaderboard.test.ts`

- [ ] **Step 1: Write the failing test**

Ajouter à l'import existant de `../src/lib/leaderboard` le symbole `assignRanks` :

```ts
import {
  assignRanks,
  buildCampStandings,
  buildCoalitionLeaderboard,
  buildLeaderboard,
  type CampStanding,
  type LeaderboardBet,
  type LeaderboardEntry,
  type LeaderboardPlayer,
} from "../src/lib/leaderboard";
```

> `buildCampStandings` et `CampStanding` seront utilisés en Task 3 — l'import groupé évite un second edit. La compilation échouera tant que Task 3 n'est pas faite : c'est attendu, on exécute les tâches dans l'ordre.

Ajouter ce bloc de tests :

```ts
describe("assignRanks", () => {
  function entry(login: string, points: number): LeaderboardEntry {
    return { rank: 0, login, avatarUrl: null, coalition: null, points, bets: 1, accuracy: null };
  }

  test("[] -> []", () => {
    expect(assignRanks([])).toEqual([]);
  });

  test("rang standard 1,1,3 et recalcule un rang préexistant", () => {
    const r = assignRanks([entry("a", 5), entry("b", 5), entry("c", 2)]);
    expect(r.map((e) => e.rank)).toEqual([1, 1, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/leaderboard.test.ts -t assignRanks`
Expected: FAIL — `assignRanks` non exporté.

- [ ] **Step 3: Write minimal implementation**

Dans `src/lib/leaderboard.ts`, ajouter la fonction (avant `buildLeaderboard`) :

```ts
/**
 * Applique le rang standard (1,1,3) à une liste DÉJÀ triée par points
 * décroissants. Recalcule `rank` à partir de l'ordre, en ignorant tout rang
 * préexistant — réutilisable pour re-classer un sous-ensemble filtré.
 */
export function assignRanks(
  entries: Omit<LeaderboardEntry, "rank">[],
): LeaderboardEntry[] {
  let lastPoints: number | null = null;
  let lastRank = 0;
  return entries.map((entry, index) => {
    const rank =
      lastPoints !== null && entry.points === lastPoints ? lastRank : index + 1;
    lastPoints = entry.points;
    lastRank = rank;
    return { rank, ...entry };
  });
}
```

Puis remplacer l'étape 4 inline de `buildLeaderboard` par un appel. L'actuel :

```ts
  // 4. Rang standard (1,1,3) : même rang à points égaux, le suivant saute.
  let lastPoints: number | null = null;
  let lastRank = 0;
  return aggregated.map((entry, index) => {
    const rank =
      lastPoints !== null && entry.points === lastPoints ? lastRank : index + 1;
    lastPoints = entry.points;
    lastRank = rank;
    return { rank, ...entry };
  });
```

devient :

```ts
  // 4. Rang standard (1,1,3) : même rang à points égaux, le suivant saute.
  return assignRanks(aggregated);
```

- [ ] **Step 4: Run test to verify it passes (et non-régression)**

Run: `npx vitest run tests/leaderboard.test.ts -t assignRanks`
Expected: PASS.
Run: `npx vitest run tests/leaderboard.test.ts -t buildLeaderboard`
Expected: PASS (comportement inchangé).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts tests/leaderboard.test.ts
git commit -m "refactor(leaderboard): extraire assignRanks (rang standard réutilisable)"
```

---

## Task 3: `buildCampStandings` (Students vs Piscineux)

**Files:**
- Modify: `src/lib/leaderboard.ts`
- Test: `tests/leaderboard.test.ts`

- [ ] **Step 1: Write the failing test**

Ajouter ce bloc de tests (`CampStanding` et `buildCampStandings` sont déjà importés en Task 2) :

```ts
describe("buildCampStandings", () => {
  const cursusCoa = { ft_id: 192, name: "House of Threads", color: "#599ac2", image_url: null };
  const piscineCoa = { ft_id: 167, name: "The Frogs", color: "#6c8946", image_url: null };

  function e(points: number, coalition: LeaderboardEntry["coalition"]): LeaderboardEntry {
    return { rank: 0, login: "x", avatarUrl: null, coalition, points, bets: 1, accuracy: null };
  }

  test("classe à la moyenne : petit camp peut devancer un grand", () => {
    const r = buildCampStandings([
      e(10, cursusCoa), e(10, cursusCoa), e(2, cursusCoa), // students moy = 22/3 ≈ 7.33
      e(9, piscineCoa), e(9, piscineCoa),                  // piscineux moy = 9
    ]);
    expect(r.map((c) => c.label)).toEqual(["Piscineux", "Students"]);
    expect(r.map((c) => c.rank)).toEqual([1, 2]);
    expect(r[0]).toMatchObject({ camp: "piscine", players: 2, totalPoints: 18, average: 9 });
  });

  test("exclut les joueurs sans coalition", () => {
    const r = buildCampStandings([e(5, cursusCoa), e(99, null)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ camp: "cursus", players: 1, totalPoints: 5 });
  });

  test("un seul camp présent -> length 1", () => {
    const r = buildCampStandings([e(3, piscineCoa)]);
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe("Piscineux");
  });

  test("aucune entry -> []", () => {
    expect(buildCampStandings([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/leaderboard.test.ts -t buildCampStandings`
Expected: FAIL — `buildCampStandings` non exporté.

- [ ] **Step 3: Write minimal implementation**

Dans `src/lib/leaderboard.ts`, étendre l'import existant de coalitions :

```ts
import { COALITION_CURSUS_PRIORITY, coalitionGroupOf, type CoalitionGroup } from "@/lib/coalitions";
```

Puis ajouter, à la fin du fichier :

```ts
export type CampStanding = {
  rank: number;
  camp: CoalitionGroup;
  label: string; // "Students" | "Piscineux"
  totalPoints: number;
  players: number; // parieurs actifs du camp
  average: number; // totalPoints / players
};

const CAMP_LABEL: Record<CoalitionGroup, string> = {
  cursus: "Students",
  piscine: "Piscineux",
};

/**
 * Classement des 2 camps (Students vs Piscineux) à la moyenne de points par
 * parieur actif. Agrège la sortie de buildLeaderboard ; exclut les joueurs sans
 * coalition. Aucun recalcul de points (rule #7).
 */
export function buildCampStandings(entries: LeaderboardEntry[]): CampStanding[] {
  const byCamp = new Map<CoalitionGroup, { totalPoints: number; players: number }>();
  for (const e of entries) {
    if (e.coalition === null) continue;
    const camp = coalitionGroupOf(e.coalition.ft_id);
    const acc = byCamp.get(camp);
    if (acc) {
      acc.totalPoints += e.points;
      acc.players += 1;
    } else {
      byCamp.set(camp, { totalPoints: e.points, players: 1 });
    }
  }

  const aggregated = [...byCamp.entries()].map(([camp, a]) => ({
    camp,
    label: CAMP_LABEL[camp],
    totalPoints: a.totalPoints,
    players: a.players,
    average: a.totalPoints / a.players,
  }));

  aggregated.sort(
    (a, b) => b.average - a.average || b.totalPoints - a.totalPoints,
  );

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

Run: `npx vitest run tests/leaderboard.test.ts -t buildCampStandings`
Expected: PASS (4 tests).
Run: `npm test`
Expected: toute la suite verte.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts tests/leaderboard.test.ts
git commit -m "feat(leaderboard): buildCampStandings — Students vs Piscineux à la moyenne"
```

---

## Task 4: composant client `leaderboard-tabs.tsx`

**Files:**
- Create: `src/components/leaderboard-tabs.tsx`

> Pas de test unitaire : composant de présentation pur (état local d'onglet/filtre). La logique testable vit dans `src/lib`. Vérification = typecheck + lint + build.

- [ ] **Step 1: Créer le composant client**

Créer `src/components/leaderboard-tabs.tsx` :

```tsx
"use client";
// Rendu interactif du classement : 2 onglets (Coalitions / Joueurs) avec filtres.
// AUCUN fetch ici (règle projet) — toutes les vues sont calculées côté serveur
// et reçues en props. État local = onglet + filtres uniquement.

import Link from "next/link";
import { useState } from "react";

import { CoalitionBadge } from "@/components/coalition-badge";
import type {
  CampStanding,
  CoalitionStanding,
  LeaderboardEntry,
} from "@/lib/leaderboard";

const PCT_FMT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});
const AVG_FMT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export type CoalitionViews = {
  all: CoalitionStanding[];
  cursus: CoalitionStanding[];
  piscine: CoalitionStanding[];
};
export type PlayerViews = {
  all: LeaderboardEntry[];
  students: LeaderboardEntry[];
  piscineux: LeaderboardEntry[];
};

type Tab = "coalitions" | "players";
type CoalitionFilter = "all" | "cursus" | "piscine";
type PlayerFilter = "all" | "students" | "piscineux";

const COALITION_FILTERS: { key: CoalitionFilter; label: string }[] = [
  { key: "all", label: "6 coalitions" },
  { key: "cursus", label: "Cursus" },
  { key: "piscine", label: "Piscine" },
];
const PLAYER_FILTERS: { key: PlayerFilter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "students", label: "Students" },
  { key: "piscineux", label: "Piscineux" },
];

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-3 inline-flex gap-1 rounded-lg bg-white/5 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.key
              ? "bg-white/15 text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LeaderboardTabs({
  coalitions,
  camps,
  players,
}: {
  coalitions: CoalitionViews;
  camps: CampStanding[];
  players: PlayerViews;
}) {
  const [tab, setTab] = useState<Tab>("coalitions");
  const [coalitionFilter, setCoalitionFilter] = useState<CoalitionFilter>("all");
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>("all");

  const coalitionRows = coalitions[coalitionFilter];
  const playerRows = players[playerFilter];

  return (
    <>
      <Segmented<Tab>
        options={[
          { key: "coalitions", label: "Coalitions" },
          { key: "players", label: "Joueurs" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "coalitions" ? (
        <section>
          <Segmented<CoalitionFilter>
            options={COALITION_FILTERS}
            value={coalitionFilter}
            onChange={setCoalitionFilter}
          />
          {coalitionRows.length === 0 ? (
            <p className="text-zinc-400">Aucune coalition classée.</p>
          ) : (
            <ul className="glass divide-y divide-white/5 overflow-hidden">
              {coalitionRows.map((c) => (
                <li
                  key={c.coalition.name}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="w-6 shrink-0 text-center font-bold tabular-nums text-zinc-400">
                    {c.rank}
                  </span>
                  <CoalitionBadge coalition={c.coalition} size="md" />
                  <span className="flex-1" />
                  <span className="shrink-0 text-right font-semibold tabular-nums">
                    {AVG_FMT.format(c.average)} pt/j
                  </span>
                  <span className="hidden w-14 shrink-0 text-right tabular-nums text-zinc-400 sm:inline">
                    {c.totalPoints} pt
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-zinc-400">
                    {c.players} {c.players > 1 ? "joueurs" : "joueur"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section>
          {camps.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-3">
              {camps.map((camp) => (
                <div
                  key={camp.camp}
                  className="glass flex flex-col gap-0.5 px-4 py-3"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {camp.rank === 1 && <span aria-hidden>👑</span>}
                    {camp.label}
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    {AVG_FMT.format(camp.average)} pt/j
                  </span>
                  <span className="text-xs tabular-nums text-zinc-400">
                    {camp.totalPoints} pt · {camp.players}{" "}
                    {camp.players > 1 ? "joueurs" : "joueur"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Segmented<PlayerFilter>
            options={PLAYER_FILTERS}
            value={playerFilter}
            onChange={setPlayerFilter}
          />

          {playerRows.length === 0 ? (
            <p className="text-zinc-400">Aucun joueur classé.</p>
          ) : (
            <ul className="glass divide-y divide-white/5 overflow-hidden">
              {playerRows.map((e) => (
                <li
                  key={e.login}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <span
                    className={`w-6 shrink-0 text-center font-bold tabular-nums ${
                      e.rank <= 3 ? "text-accent" : "text-zinc-400"
                    }`}
                  >
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
                    <span className="h-8 w-8 shrink-0 rounded-full bg-white/10" />
                  )}
                  <Link
                    href={`/profile/${e.login}`}
                    className="flex-1 truncate font-medium transition-colors hover:text-accent"
                  >
                    {e.login}
                  </Link>
                  <CoalitionBadge coalition={e.coalition} size="sm" />
                  <span className="w-14 shrink-0 text-right tabular-nums">
                    {e.accuracy === null ? "—" : PCT_FMT.format(e.accuracy)}
                  </span>
                  <span className="hidden w-10 shrink-0 text-right tabular-nums text-zinc-400 sm:inline">
                    {e.bets}
                  </span>
                  <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
                    {e.points} pt
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 2: Vérifier typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS (la page n'utilise pas encore le composant — c'est l'objet de Task 5).

- [ ] **Step 3: Commit**

```bash
git add src/components/leaderboard-tabs.tsx
git commit -m "feat(leaderboard): composant client onglets Coalitions/Joueurs + filtres"
```

---

## Task 5: brancher la page serveur

**Files:**
- Modify: `src/app/leaderboard/page.tsx`

- [ ] **Step 1: Réécrire la page pour calculer les vues et déléguer au client**

Remplacer **tout** le contenu de `src/app/leaderboard/page.tsx` par :

```tsx
// src/app/leaderboard/page.tsx
import { coalitionGroupOf } from "@/lib/coalitions";
import {
  LeaderboardTabs,
  type CoalitionViews,
  type PlayerViews,
} from "@/components/leaderboard-tabs";
import { listAllBets } from "@/lib/bets";
import {
  assignRanks,
  buildCampStandings,
  buildCoalitionLeaderboard,
  buildLeaderboard,
  type LeaderboardEntry,
} from "@/lib/leaderboard";
import { listPlayers } from "@/lib/users";

// Les points évoluent après chaque match : le rendu ne doit pas être figé.
export const dynamic = "force-dynamic";

function inGroup(e: LeaderboardEntry, group: "cursus" | "piscine"): boolean {
  return e.coalition !== null && coalitionGroupOf(e.coalition.ft_id) === group;
}

export default async function LeaderboardPage() {
  const [players, bets] = await Promise.all([listPlayers(), listAllBets()]);
  const entries = buildLeaderboard(players, bets);

  const cursusEntries = entries.filter((e) => inGroup(e, "cursus"));
  const piscineEntries = entries.filter((e) => inGroup(e, "piscine"));

  const coalitions: CoalitionViews = {
    all: buildCoalitionLeaderboard(entries),
    cursus: buildCoalitionLeaderboard(cursusEntries),
    piscine: buildCoalitionLeaderboard(piscineEntries),
  };
  const playerViews: PlayerViews = {
    all: entries,
    students: assignRanks(cursusEntries),
    piscineux: assignRanks(piscineEntries),
  };
  const camps = buildCampStandings(entries);

  return (
    <main className="rise mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Classement</h1>

      {entries.length === 0 ? (
        <p className="text-zinc-400">Aucun pronostic pour l&apos;instant.</p>
      ) : (
        <LeaderboardTabs
          coalitions={coalitions}
          camps={camps}
          players={playerViews}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Vérifier typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Vérifier le build**

Run: `npm run build`
Expected: build OK, route `/leaderboard` présente.

- [ ] **Step 4: Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "feat(leaderboard): page serveur calcule 3 vues coalitions + camps + joueurs"
```

---

## Task 6: gates finaux

**Files:** aucun (vérification).

- [ ] **Step 1: Suite complète**

Run: `npm test`
Expected: tout vert (anciens + nouveaux tests).

- [ ] **Step 2: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS partout.

- [ ] **Step 3: Vérification visuelle manuelle (optionnel mais recommandé)**

Run: `npm run dev`, ouvrir `http://localhost:3000/leaderboard` :
- onglet Coalitions : filtres 6 / Cursus / Piscine changent la liste ;
- onglet Joueurs : bandeau camps visible, filtres Tous / Students / Piscineux re-classent 1,2,3 ;
- responsive mobile : colonnes total/pronos masquées sous `sm`.

- [ ] **Step 4: Ouvrir la PR**

Suivre `skills/pr-template/SKILL.md` + `.github/pull_request_template.md` (une PR = un sujet). Cible `main`, review par le binôme, merge squash.

---

## Self-Review (effectué)

- **Couverture spec** : §4.1 coalitionGroupOf → Task 1 ; §4.4 assignRanks → Task 2 ; §4.3 buildCampStandings → Task 3 ; §4.2/§4.5 filtres coalitions+joueurs → Task 5 ; §5 UX onglets/filtres/bandeau camps → Task 4+5 ; §6 tests → Tasks 1-3. ✓
- **Placeholders** : aucun — code complet à chaque étape. ✓
- **Cohérence des types** : `coalitionGroupOf`, `CoalitionGroup`, `CampStanding`, `assignRanks(Omit<LeaderboardEntry,"rank">[])`, `CoalitionViews`/`PlayerViews` utilisés de façon identique entre lib, composant et page. ✓
- **Règles projet** : pas de fetch client (page serveur → props), pas de recalcul de points, pas de migration DB. ✓
