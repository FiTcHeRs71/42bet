# Liste des matchs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher une page publique `/matches` en lecture seule, listant les matchs WC regroupés par jour, alimentée par une seed migration.

**Architecture:** Seed SQL → table `public.matches` (public read RLS déjà en place). Une fonction I/O pure (`listMatches`) lit via le client anon ; une logique de présentation pure et testée (`displayState`, `groupByDay`) transforme les données ; un server component les rend. Séparation stricte I/O ↔ logique pure (SRP).

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript strict, Supabase JS (anon), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-03-matches-list-design.md`

---

## File Structure

| Fichier | Rôle | Action |
|---|---|---|
| `supabase/migrations/0008_seed_matches.sql` | Seed dev de ~7 fixtures (mix finished/scheduled) | Create |
| `src/lib/match-view.ts` | Logique pure : `displayState`, `groupByDay` + types | Create |
| `tests/match-view.test.ts` | Tests Vitest des fonctions pures | Create |
| `src/lib/matches.ts` | I/O : `listMatches()` via client anon | Create |
| `src/components/match-row.tsx` | Rendu d'une ligne de match | Create |
| `src/app/matches/page.tsx` | Page server component `/matches` | Create |
| `src/components/site-header.tsx` | Ajout lien « Matchs » | Modify |

**Conventions de référence (lire si besoin) :**
- Type `Match` : `src/lib/types.ts` (alias de `Tables<"matches">`, snake_case, `kickoff_at` = string ISO).
- Style de test : `tests/points.test.ts` (import depuis `../src/lib/...`).
- Client anon : `src/lib/supabase/browser.ts` (`supabaseBrowser`).
- Migrations : `supabase/migrations/0003_create_matches.sql` (colonnes), `0000_helpers.sql` (enum `match_status`).

---

## Task 1: Seed migration

**Files:**
- Create: `supabase/migrations/0008_seed_matches.sql`

- [ ] **Step 1: Écrire la migration**

`football_data_id` = placeholders `9000xx` (données de seed, pas d'appariement API). Date de référence du projet : 2026-06-03 — donc `9000_01/02` sont passés+finished, les autres futurs+scheduled. Insert idempotent.

```sql
-- supabase/migrations/0008_seed_matches.sql
-- SEED DEV uniquement. Fixtures d'exemple pour développer la page /matches
-- avant l'ingestion réelle depuis football-data.org (brique séparée).
-- football_data_id = placeholders 9000xx (PAS de vrais ids API). À remplacer/
-- nettoyer quand l'ingestion réelle insérera les vrais matchs.

insert into public.matches
  (football_data_id, home_team, away_team, stage, kickoff_at, status, home_score, away_score)
values
  (900001, 'France',    'Croatie',   'Phase de groupes', '2026-06-01T18:00:00Z', 'finished',  2, 1),
  (900002, 'Brésil',    'Argentine', 'Phase de groupes', '2026-06-01T21:00:00Z', 'finished',  1, 1),
  (900003, 'Allemagne', 'Espagne',   'Phase de groupes', '2026-06-11T16:00:00Z', 'scheduled', null, null),
  (900004, 'Portugal',  'Pays-Bas',  'Phase de groupes', '2026-06-11T19:00:00Z', 'scheduled', null, null),
  (900005, 'Angleterre','Belgique',  'Phase de groupes', '2026-06-12T16:00:00Z', 'scheduled', null, null),
  (900006, 'Italie',    'Suisse',    'Phase de groupes', '2026-06-12T19:00:00Z', 'scheduled', null, null),
  (900007, 'Maroc',     'Sénégal',   'Phase de groupes', '2026-06-13T16:00:00Z', 'scheduled', null, null)
on conflict (football_data_id) do nothing;
```

- [ ] **Step 2: Appliquer la migration**

Run: `npx supabase db push` (ou `npx supabase migration up` si dispo localement)
Expected: la migration `0008` s'applique sans erreur ; 7 lignes insérées.

> Si la CLI Supabase n'est pas connectée/disponible dans l'environnement d'exécution, noter le blocage et continuer : les tâches 2–5 ne dépendent pas de données réelles. Le seed sera appliqué avant la vérif finale (Task 6).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0008_seed_matches.sql
git commit -m "feat(matches): seed dev fixtures (migration 0008)"
```

---

## Task 2: Logique de présentation pure (`match-view.ts`)

**Files:**
- Create: `src/lib/match-view.ts`
- Test: `tests/match-view.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

```typescript
// tests/match-view.test.ts
import { describe, test, expect } from "vitest";

import { displayState, groupByDay } from "../src/lib/match-view";
import type { Match } from "../src/lib/types";

// Fabrique un Match minimal ; on ne renseigne que les champs lus par la logique.
function match(over: Partial<Match>): Match {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    football_data_id: 1,
    home_team: "A",
    away_team: "B",
    home_crest_url: null,
    away_crest_url: null,
    stage: null,
    kickoff_at: "2026-06-11T16:00:00Z",
    status: "scheduled",
    home_score: null,
    away_score: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...over,
  };
}

describe("displayState", () => {
  const now = new Date("2026-06-11T12:00:00Z");

  test("finished -> finished", () => {
    expect(displayState(match({ status: "finished" }), now)).toBe("finished");
  });
  test("postponed -> postponed", () => {
    expect(displayState(match({ status: "postponed" }), now)).toBe("postponed");
  });
  test("cancelled -> cancelled", () => {
    expect(displayState(match({ status: "cancelled" }), now)).toBe("cancelled");
  });
  test("live status -> live", () => {
    expect(displayState(match({ status: "live" }), now)).toBe("live");
  });
  test("scheduled, kickoff futur -> upcoming", () => {
    expect(
      displayState(match({ status: "scheduled", kickoff_at: "2026-06-11T16:00:00Z" }), now),
    ).toBe("upcoming");
  });
  test("scheduled, kickoff passé -> live", () => {
    expect(
      displayState(match({ status: "scheduled", kickoff_at: "2026-06-11T10:00:00Z" }), now),
    ).toBe("live");
  });
  test("scheduled, now === kickoff -> live (borne)", () => {
    const k = "2026-06-11T12:00:00Z";
    expect(displayState(match({ status: "scheduled", kickoff_at: k }), new Date(k))).toBe("live");
  });
});

describe("groupByDay", () => {
  test("liste vide -> []", () => {
    expect(groupByDay([])).toEqual([]);
  });

  test("même jour (Europe/Zurich) -> un seul groupe trié par kickoff", () => {
    const a = match({ football_data_id: 1, kickoff_at: "2026-06-11T19:00:00Z" });
    const b = match({ football_data_id: 2, kickoff_at: "2026-06-11T16:00:00Z" });
    const groups = groupByDay([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].matches.map((m) => m.football_data_id)).toEqual([2, 1]);
  });

  test("plusieurs jours, entrée désordonnée -> groupes triés chrono", () => {
    const d12 = match({ football_data_id: 1, kickoff_at: "2026-06-12T16:00:00Z" });
    const d11 = match({ football_data_id: 2, kickoff_at: "2026-06-11T16:00:00Z" });
    const d13 = match({ football_data_id: 3, kickoff_at: "2026-06-13T16:00:00Z" });
    const groups = groupByDay([d12, d11, d13]);
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-06-11", "2026-06-12", "2026-06-13"]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/match-view.test.ts`
Expected: FAIL (module `match-view` / exports introuvables).

- [ ] **Step 3: Écrire l'implémentation minimale**

```typescript
// src/lib/match-view.ts
// Logique de présentation PURE pour la liste des matchs — aucune I/O.
// Testée dans tests/match-view.test.ts.

import type { Match } from "@/lib/types";

export type MatchDisplayState =
  | "upcoming"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled";

export type MatchDay = { dayKey: string; matches: Match[] };

// Fuseau de référence (École 42 Lausanne) : le regroupement par jour et
// l'affichage doivent être déterministes quel que soit le fuseau du serveur.
const TZ = "Europe/Zurich";

/** Clé jour (YYYY-MM-DD) dans le fuseau de référence pour un instant ISO. */
function zurichDayKey(iso: string): string {
  // en-CA donne le format ISO "YYYY-MM-DD".
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** État d'affichage dérivé du statut + kickoff (cf. spec §4.3). */
export function displayState(match: Match, now: Date): MatchDisplayState {
  switch (match.status) {
    case "finished":
      return "finished";
    case "postponed":
      return "postponed";
    case "cancelled":
      return "cancelled";
    case "live":
      return "live";
    case "scheduled":
      return now.getTime() >= new Date(match.kickoff_at).getTime()
        ? "live"
        : "upcoming";
  }
}

/** Regroupe les matchs par jour (fuseau de réf). Groupes et matchs triés chrono. */
export function groupByDay(matches: Match[]): MatchDay[] {
  const byKey = new Map<string, Match[]>();
  for (const m of matches) {
    const key = zurichDayKey(m.kickoff_at);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(m);
    else byKey.set(key, [m]);
  }

  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, dayMatches]) => ({
      dayKey,
      matches: dayMatches.sort(
        (a, b) =>
          new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime(),
      ),
    }));
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/match-view.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/match-view.ts tests/match-view.test.ts
git commit -m "feat(matches): pure display logic (displayState + groupByDay)"
```

---

## Task 3: Accès données (`matches.ts`)

**Files:**
- Create: `src/lib/matches.ts`

- [ ] **Step 1: Écrire l'implémentation**

Pas de test unitaire (I/O ; la logique testable est dans `match-view.ts`). Le client anon respecte la RLS public read existante.

```typescript
// src/lib/matches.ts
// Accès données pour la liste des matchs — I/O uniquement (SRP : aucune logique
// de présentation ici). Lecture publique via le client anon (RLS public read).

import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Match } from "@/lib/types";

/** Tous les matchs, triés par coup d'envoi croissant. Lève en cas d'erreur DB. */
export async function listMatches(): Promise<Match[]> {
  const { data, error } = await supabaseBrowser
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });

  if (error) throw new Error(`listMatches: ${error.message}`);
  return data ?? [];
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/lib/matches.ts
git commit -m "feat(matches): listMatches() data access (anon read)"
```

---

## Task 4: Composant `MatchRow`

**Files:**
- Create: `src/components/match-row.tsx`

- [ ] **Step 1: Écrire le composant**

Server component (pas de `"use client"`). Reçoit le `Match` et son `state` déjà calculé (déterminisme : le `now` vient de la page). Labels FR pour les états non-finished.

```tsx
// src/components/match-row.tsx
import type { Match } from "@/lib/types";
import type { MatchDisplayState } from "@/lib/match-view";

const STATE_LABEL: Record<Exclude<MatchDisplayState, "finished">, string> = {
  upcoming: "à venir",
  live: "en cours",
  postponed: "reporté",
  cancelled: "annulé",
};

const TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
});

export function MatchRow({
  match,
  state,
}: {
  match: Match;
  state: MatchDisplayState;
}) {
  const isFinished = state === "finished";
  const hasScore =
    match.home_score !== null && match.away_score !== null;

  return (
    <li className="flex items-center gap-4 px-4 py-3 text-sm">
      <span className="w-12 shrink-0 tabular-nums text-zinc-500">
        {TIME_FMT.format(new Date(match.kickoff_at))}
      </span>

      <span className="flex-1 text-right font-medium">{match.home_team}</span>

      <span className="w-14 shrink-0 text-center tabular-nums font-semibold">
        {isFinished && hasScore
          ? `${match.home_score} - ${match.away_score}`
          : "–"}
      </span>

      <span className="flex-1 font-medium">{match.away_team}</span>

      <span className="w-16 shrink-0 text-right text-xs text-zinc-500">
        {isFinished ? "terminé" : STATE_LABEL[state]}
      </span>
    </li>
  );
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add src/components/match-row.tsx
git commit -m "feat(matches): MatchRow component"
```

---

## Task 5: Page `/matches`

**Files:**
- Create: `src/app/matches/page.tsx`

- [ ] **Step 1: Écrire la page**

Server component async. `listMatches()` → `groupByDay()` → une section par jour, label FR formaté depuis le 1er match du groupe. `now` calculé une fois pour tout le rendu. Empty state si aucun match.

```tsx
// src/app/matches/page.tsx
import { MatchRow } from "@/components/match-row";
import { listMatches } from "@/lib/matches";
import { displayState, groupByDay } from "@/lib/match-view";

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Zurich",
  weekday: "long",
  day: "numeric",
  month: "long",
});

export default async function MatchesPage() {
  const matches = await listMatches();
  const now = new Date();
  const days = groupByDay(matches);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Matchs</h1>

      {days.length === 0 ? (
        <p className="text-zinc-500">Aucun match pour l’instant.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {days.map((day) => (
            <section key={day.dayKey}>
              <h2 className="mb-2 text-sm font-semibold capitalize text-zinc-500">
                {DAY_FMT.format(new Date(day.matches[0].kickoff_at))}
              </h2>
              <ul className="divide-y divide-black/5 rounded-lg border border-black/10 dark:divide-white/5 dark:border-white/10">
                {day.matches.map((match) => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    state={displayState(match, now)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Vérifier typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur, aucun warning.

- [ ] **Step 3: Commit**

```bash
git add src/app/matches/page.tsx
git commit -m "feat(matches): /matches page (grouped by day)"
```

---

## Task 6: Lien header + vérification finale

**Files:**
- Modify: `src/components/site-header.tsx`

- [ ] **Step 1: Ajouter le lien « Matchs »**

Remplacer le bloc du `<header>` pour insérer un lien de nav entre la marque et le bouton auth.

Avant :
```tsx
    <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
      <Link href="/" className="text-lg font-bold tracking-tight">
        42Bet
      </Link>
      <AuthButton />
    </header>
```

Après :
```tsx
    <header className="flex items-center justify-between border-b border-black/10 px-6 py-4 dark:border-white/10">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          42Bet
        </Link>
        <Link href="/matches" className="text-sm text-zinc-500 hover:text-current">
          Matchs
        </Link>
      </div>
      <AuthButton />
    </header>
```

- [ ] **Step 2: Appliquer le seed si pas déjà fait (Task 1 Step 2)**

Run: `npx supabase db push`
Expected: migration `0008` appliquée (ou déjà à jour).

- [ ] **Step 3: Suite de vérifs complète**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: tests verts (dont les 10 de `match-view`), typecheck clean, lint clean, build OK avec la route `/matches` listée.

- [ ] **Step 4: Vérification manuelle (optionnelle mais recommandée)**

Run: `npm run dev`, ouvrir `http://localhost:3000/matches`
Expected: les matchs du seed regroupés par jour ; FRA-CRO et BRA-ARG affichés « terminé » avec score ; les autres « à venir ». Lien « Matchs » présent dans le header.

- [ ] **Step 5: Commit**

```bash
git add src/components/site-header.tsx
git commit -m "feat(matches): nav link to /matches in header"
```

---

## Self-Review (couverture spec)

- Spec §4.1 seed → Task 1. ✅
- Spec §4.2 `listMatches` (anon, ordre kickoff) → Task 3. ✅
- Spec §4.3 `displayState` + `groupByDay` (purs, testés) → Task 2. ✅
- Spec §4.4 page `/matches` + empty state → Task 5 ; `MatchRow` → Task 4 ; lien header → Task 6. ✅
- Spec §6 tests (displayState 6 cas + borne, groupByDay 4 cas) → Task 2 Step 1. ✅
- Spec §7 pas de nouvelle env var, vérifs vertes → Task 6 Step 3. ✅
- Crests hors-périmètre (§3) : aucune tâche ne les rend. ✅
- Cohérence types : `Match` (types.ts), `MatchDisplayState`/`MatchDay` (match-view.ts) utilisés à l'identique dans matches.ts, match-row.tsx, page.tsx. ✅
</content>
