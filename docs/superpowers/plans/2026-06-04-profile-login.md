# Profil joueur `/profile/[login]` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire une page publique `/profile/:login` affichant en-tête (avatar, coalition), stats (rang, points, taux, nb pronos) et l'historique des pronos du joueur.

**Architecture:** Réutilise les briques existantes (`listPlayers`, `listAllBets`, `buildLeaderboard`, `CoalitionBadge`) — aucune duplication de la logique de classement (règle #7). Une seule nouvelle requête DB (`listBetsWithMatchByUser`) joint les pronos aux matchs, et une fonction pure (`buildProfileHistory`) en dérive la timeline.

**Tech Stack:** Next.js 16 (App Router, server component `force-dynamic`, `params` async, `notFound()`), React 19, Supabase (`service_role` server-only), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-04-profile-login-design.md`

---

## File Structure

| Fichier | Responsabilité | Type |
|---|---|---|
| `src/lib/profile.ts` | **Pure** : types (`ProfileBetRow`, `ProfileHistoryEntry`, `ProfileOutcome`) + `buildProfileHistory` (tri + étiquetage outcome) | créé |
| `tests/profile.test.ts` | Tests unitaires de `buildProfileHistory` | créé |
| `src/lib/bets.ts` | Ajout I/O `listBetsWithMatchByUser` (pronos joints aux matchs) | modifié |
| `src/app/profile/[login]/page.tsx` | Server component : orchestration + rendu | créé |
| `src/app/leaderboard/page.tsx` | `login` → `<Link>` vers `/profile/:login` | modifié |

**Convention de types** (comme `bets.ts` qui importe `LeaderboardBet` depuis `leaderboard.ts`) : le type d'entrée de l'I/O (`ProfileBetRow`) vit dans le module pur consommateur (`profile.ts`), et `bets.ts` l'importe.

---

## Task 1: Fonction pure `buildProfileHistory` + types (`profile.ts`)

**Files:**
- Create: `src/lib/profile.ts`
- Test: `tests/profile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/profile.test.ts`:

```ts
import { describe, test, expect } from "vitest";

import { buildProfileHistory, type ProfileBetRow } from "../src/lib/profile";
import type { MatchStatus } from "../src/lib/types";

function makeRow(
  matchId: string,
  kickoff: string,
  points: number | null,
  predicted: [number, number],
  actual: [number, number] | null,
  status: MatchStatus,
): ProfileBetRow {
  return {
    match_id: matchId,
    home_score: predicted[0],
    away_score: predicted[1],
    points_awarded: points,
    match: {
      home_team: "H",
      away_team: "A",
      home_crest_url: null,
      away_crest_url: null,
      home_score: actual ? actual[0] : null,
      away_score: actual ? actual[1] : null,
      kickoff_at: kickoff,
      status,
    },
  };
}

describe("buildProfileHistory", () => {
  test("liste vide -> []", () => {
    expect(buildProfileHistory([])).toEqual([]);
  });

  test("ligne sans match (jointure nulle) -> ignorée", () => {
    const orphan: ProfileBetRow = {
      match_id: "m0",
      home_score: 1,
      away_score: 1,
      points_awarded: null,
      match: null,
    };
    expect(buildProfileHistory([orphan])).toEqual([]);
  });

  test("tri par kickoff décroissant", () => {
    const rows = [
      makeRow("m1", "2026-06-10T18:00:00Z", null, [1, 0], null, "scheduled"),
      makeRow("m2", "2026-06-12T18:00:00Z", null, [2, 2], null, "scheduled"),
      makeRow("m3", "2026-06-11T18:00:00Z", null, [0, 1], null, "scheduled"),
    ];
    expect(buildProfileHistory(rows).map((e) => e.matchId)).toEqual([
      "m2",
      "m3",
      "m1",
    ]);
  });

  test("départage déterministe par matchId à kickoff identique", () => {
    const k = "2026-06-10T18:00:00Z";
    const rows = [
      makeRow("mb", k, null, [1, 0], null, "scheduled"),
      makeRow("ma", k, null, [0, 0], null, "scheduled"),
    ];
    expect(buildProfileHistory(rows).map((e) => e.matchId)).toEqual([
      "ma",
      "mb",
    ]);
  });

  test("outcome étiqueté depuis points_awarded (3/1/0/null)", () => {
    const rows = [
      makeRow("m1", "2026-06-10T18:00:00Z", 3, [2, 1], [2, 1], "finished"),
      makeRow("m2", "2026-06-09T18:00:00Z", 1, [1, 0], [3, 1], "finished"),
      makeRow("m3", "2026-06-08T18:00:00Z", 0, [0, 0], [2, 1], "finished"),
      makeRow("m4", "2026-06-07T18:00:00Z", null, [1, 1], null, "scheduled"),
    ];
    const out = buildProfileHistory(rows);
    const byId = Object.fromEntries(out.map((e) => [e.matchId, e.outcome]));
    expect(byId).toEqual({
      m1: "exact",
      m2: "good",
      m3: "miss",
      m4: "pending",
    });
  });

  test("scores réels: null si non terminé, valeurs si terminé", () => {
    const rows = [
      makeRow("m1", "2026-06-10T18:00:00Z", 3, [2, 1], [2, 1], "finished"),
      makeRow("m2", "2026-06-09T18:00:00Z", null, [1, 1], null, "scheduled"),
    ];
    const out = buildProfileHistory(rows);
    const m1 = out.find((e) => e.matchId === "m1")!;
    const m2 = out.find((e) => e.matchId === "m2")!;
    expect([m1.actualHome, m1.actualAway]).toEqual([2, 1]);
    expect([m1.predictedHome, m1.predictedAway]).toEqual([2, 1]);
    expect([m2.actualHome, m2.actualAway]).toEqual([null, null]);
    expect([m2.predictedHome, m2.predictedAway]).toEqual([1, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/profile.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/profile'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/profile.ts`:

```ts
// src/lib/profile.ts
// Logique de présentation PURE pour la page profil — aucune I/O, aucun recalcul
// de points (règle #7) : on ÉTIQUETTE points_awarded, on ne le recalcule pas.
// Testée dans tests/profile.test.ts.

import type { MatchStatus } from "@/lib/types";

/** Ligne brute renvoyée par listBetsWithMatchByUser (bet joint à son match). */
export type ProfileBetRow = {
  match_id: string;
  home_score: number; // score pronostiqué (côté pari)
  away_score: number;
  points_awarded: number | null;
  match: {
    home_team: string;
    away_team: string;
    home_crest_url: string | null;
    away_crest_url: string | null;
    home_score: number | null; // score réel (côté match), null si non terminé
    away_score: number | null;
    kickoff_at: string;
    status: MatchStatus;
  } | null;
};

export type ProfileOutcome = "exact" | "good" | "miss" | "pending";

export type ProfileHistoryEntry = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeCrestUrl: string | null;
  awayCrestUrl: string | null;
  kickoffAt: string;
  predictedHome: number;
  predictedAway: number;
  actualHome: number | null;
  actualAway: number | null;
  status: MatchStatus;
  pointsAwarded: number | null;
  outcome: ProfileOutcome;
};

/** Étiquette l'issue d'un prono depuis ses points (barème points.ts : 3/1/0). */
function outcomeFromPoints(points: number | null): ProfileOutcome {
  if (points === null) return "pending";
  if (points === 3) return "exact";
  if (points === 1) return "good";
  return "miss";
}

/**
 * Transforme les pronos-avec-match en view models triés (kickoff décroissant,
 * départage par matchId). Ignore les lignes sans match (jointure nulle).
 */
export function buildProfileHistory(
  rows: ProfileBetRow[],
): ProfileHistoryEntry[] {
  return rows
    .filter(
      (r): r is ProfileBetRow & { match: NonNullable<ProfileBetRow["match"]> } =>
        r.match !== null,
    )
    .map((r) => ({
      matchId: r.match_id,
      homeTeam: r.match.home_team,
      awayTeam: r.match.away_team,
      homeCrestUrl: r.match.home_crest_url,
      awayCrestUrl: r.match.away_crest_url,
      kickoffAt: r.match.kickoff_at,
      predictedHome: r.home_score,
      predictedAway: r.away_score,
      actualHome: r.match.home_score,
      actualAway: r.match.away_score,
      status: r.match.status,
      pointsAwarded: r.points_awarded,
      outcome: outcomeFromPoints(r.points_awarded),
    }))
    .sort(
      (a, b) =>
        new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime() ||
        a.matchId.localeCompare(b.matchId),
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/profile.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile.ts tests/profile.test.ts
git commit -m "feat(profile): pure buildProfileHistory (tri + étiquetage outcome)"
```

---

## Task 2: I/O `listBetsWithMatchByUser` (`bets.ts`)

**Files:**
- Modify: `src/lib/bets.ts`

Pas de test unitaire (I/O Supabase, comme `listAllBets`/`listMyBets`). Vérifié par `typecheck` + build.

- [ ] **Step 1: Add the import**

In `src/lib/bets.ts`, add to the existing imports block (after the `LeaderboardBet` import):

```ts
import type { ProfileBetRow } from "@/lib/profile";
```

- [ ] **Step 2: Append the new I/O function**

Add at the end of `src/lib/bets.ts`:

```ts
/**
 * Tous les pronos d'un joueur joints à leur match (équipes, crests, score réel,
 * statut, kickoff), pour la timeline du profil. Lecture server-only via
 * service_role (bets = RLS default-deny). Normalise le match imbriqué en
 * objet|null : supabase-js peut le typer en objet OU en tableau selon la
 * détection de relation (même pattern que listPlayers).
 */
export async function listBetsWithMatchByUser(
  userId: string,
): Promise<ProfileBetRow[]> {
  const { data, error } = await supabaseAdmin
    .from("bets")
    .select(
      "match_id, home_score, away_score, points_awarded, match:matches(home_team, away_team, home_crest_url, away_crest_url, home_score, away_score, kickoff_at, status)",
    )
    .eq("user_id", userId);

  if (error) throw new Error(`listBetsWithMatchByUser: ${error.message}`);

  return (data ?? []).map((row) => {
    const m = row.match as
      | ProfileBetRow["match"]
      | NonNullable<ProfileBetRow["match"]>[]
      | null;
    return {
      match_id: row.match_id,
      home_score: row.home_score,
      away_score: row.away_score,
      points_awarded: row.points_awarded,
      match: Array.isArray(m) ? (m[0] ?? null) : m,
    };
  });
}
```

- [ ] **Step 3: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/bets.ts
git commit -m "feat(profile): listBetsWithMatchByUser I/O (bets joint au match)"
```

---

## Task 3: Page `/profile/[login]` (server component)

**Files:**
- Create: `src/app/profile/[login]/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/profile/[login]/page.tsx`:

```tsx
// src/app/profile/[login]/page.tsx
import { notFound } from "next/navigation";

import { CoalitionBadge } from "@/components/coalition-badge";
import { listAllBets, listBetsWithMatchByUser } from "@/lib/bets";
import { buildLeaderboard } from "@/lib/leaderboard";
import { buildProfileHistory, type ProfileOutcome } from "@/lib/profile";
import { listPlayers } from "@/lib/users";

// Les points + rang évoluent après chaque match : rendu jamais figé.
export const dynamic = "force-dynamic";

const PCT_FMT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});

const OUTCOME: Record<ProfileOutcome, { label: string; cls: string }> = {
  exact: { label: "Score exact", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  good: { label: "Bon résultat", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  miss: { label: "Raté", cls: "bg-zinc-500/15 text-zinc-500" },
  pending: { label: "En attente", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-500" },
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;

  const [players, allBets] = await Promise.all([listPlayers(), listAllBets()]);
  const player = players.find((p) => p.login === login);
  if (!player) notFound();

  const entry =
    buildLeaderboard(players, allBets).find((e) => e.login === login) ?? null;
  const history = buildProfileHistory(await listBetsWithMatchByUser(player.id));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      {/* En-tête */}
      <header className="mb-6 flex items-center gap-4">
        {player.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.avatar_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="h-16 w-16 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {player.login}
          </h1>
          <div className="mt-1">
            <CoalitionBadge coalition={player.coalition} size="md" />
          </div>
        </div>
      </header>

      {/* Stats */}
      <dl className="mb-8 grid grid-cols-4 gap-3 text-center">
        <Stat label="Rang" value={entry ? `#${entry.rank}` : "—"} />
        <Stat label="Points" value={entry ? `${entry.points}` : "0"} />
        <Stat
          label="Réussite"
          value={
            entry && entry.accuracy !== null
              ? PCT_FMT.format(entry.accuracy)
              : "—"
          }
        />
        <Stat label="Pronos" value={entry ? `${entry.bets}` : "0"} />
      </dl>

      {/* Timeline */}
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
        Historique
      </h2>
      {history.length === 0 ? (
        <p className="text-zinc-500">Aucun pronostic pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => {
            const o = OUTCOME[h.outcome];
            const finished = h.actualHome !== null && h.actualAway !== null;
            return (
              <li
                key={h.matchId}
                className="flex items-center gap-3 rounded-lg border border-black/10 px-4 py-3 text-sm dark:border-white/10"
              >
                <span className="flex-1 truncate">
                  {h.homeTeam} <span className="text-zinc-400">vs</span>{" "}
                  {h.awayTeam}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-500">
                  prono {h.predictedHome}–{h.predictedAway}
                </span>
                <span className="w-14 shrink-0 text-right tabular-nums font-medium">
                  {finished ? `${h.actualHome}–${h.actualAway}` : "—"}
                </span>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${o.cls}`}
                >
                  {o.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 px-2 py-3 dark:border-white/10">
      <dt className="text-[11px] uppercase tracking-wide text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint + build**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds; `/profile/[login]` listed as a Dynamic (ƒ) route.

- [ ] **Step 3: Commit**

```bash
git add src/app/profile/[login]/page.tsx
git commit -m "feat(profile): /profile/[login] page (en-tête + stats + timeline)"
```

---

## Task 4: Lien depuis le classement (`leaderboard/page.tsx`)

**Files:**
- Modify: `src/app/leaderboard/page.tsx`

- [ ] **Step 1: Add the Link import**

At the top of `src/app/leaderboard/page.tsx`, add as the first import:

```tsx
import Link from "next/link";
```

- [ ] **Step 2: Wrap the login in a Link**

Replace this line:

```tsx
                <span className="flex-1 truncate font-medium">{e.login}</span>
```

with:

```tsx
                <Link
                  href={`/profile/${e.login}`}
                  className="flex-1 truncate font-medium hover:underline"
                >
                  {e.login}
                </Link>
```

- [ ] **Step 3: Verify typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: no errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "feat(profile): lien login -> /profile/:login depuis le classement"
```

---

## Task 5: Vérifs finales + merge dans `main`

**Files:** aucun (gates + intégration).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: tous verts (64 existants + 6 nouveaux = 70).

- [ ] **Step 2: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: aucun erreur ; routes `/profile/[login]` et `/leaderboard` en Dynamic (ƒ).

- [ ] **Step 3: Garde anti-fuite server-only**

Vérifier qu'aucun composant client n'importe d'I/O server-only :

Run: `grep -rn "use client" src/app/profile src/components/coalition-badge.tsx || echo "OK: aucun use client"`
Expected: `coalition-badge.tsx` ne contient pas `"use client"` (composant serveur) ; la page profil non plus. Sinon → bug à corriger.

- [ ] **Step 4: Self-review du diff**

Run: `git diff main --stat`
Relire : pas de secret, pas de recalcul de points, types cohérents.

- [ ] **Step 5: Merge no-ff dans main**

```bash
git checkout main
git merge --no-ff feat/profile -m "merge: profil joueur (/profile/:login, en-tête + stats + timeline)"
```

- [ ] **Step 6: Re-vérifier main vert + nettoyer la branche**

```bash
npm test && npm run typecheck && npm run lint
git branch -d feat/profile
```

Expected: tout vert sur `main`, branche supprimée.

---

## Notes d'implémentation

- **Règle #7** : aucun recalcul de points. `buildProfileHistory` lit `points_awarded` et l'étiquette seulement. Le rang/points/taux viennent de `buildLeaderboard` (déjà testé).
- **Next 16** : `params` est une `Promise` → `const { login } = await params;`. `notFound()` (de `next/navigation`) a le type de retour `never`, donc TS narrow `player` à non-`undefined` après le guard.
- **Confidentialité** : transparence totale assumée (cf. spec §2) — les scores prédits des matchs à venir sont affichés.
- **Branche** : créer `feat/profile` depuis `main` avant la Task 1.
```
