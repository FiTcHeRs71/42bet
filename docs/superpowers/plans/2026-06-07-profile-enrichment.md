# Enrichissement page profil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir `/profile/[login]` avec écussons + dates dans l'historique, une ventilation de la réussite, et une timeline scindée En attente / Joués — sans nouvelle I/O ni recalcul de points.

**Architecture:** Deux helpers purs ajoutés à `src/lib/profile.ts` (`countOutcomes`, `partitionHistory`), testés en isolation. La page server-component (`force-dynamic`) consomme ces helpers et délègue le rendu d'une ligne à un composant local `HistoryRow`. Aucune modification DB/requête.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript strict, Tailwind v4, Vitest.

**Spec de référence:** `docs/superpowers/specs/2026-06-07-profile-enrichment-design.md`

---

## Task 1: Helper pur `countOutcomes`

**Files:**
- Modify: `src/lib/profile.ts` (ajout après `buildProfileHistory`)
- Test: `tests/profile.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `tests/profile.test.ts` (importer `countOutcomes` depuis `@/lib/profile`). Si un helper de fabrique d'entrée n'existe pas déjà dans ce fichier, ajouter celui-ci en haut du fichier de test :

```ts
import { buildProfileHistory, countOutcomes } from "@/lib/profile";
import type { ProfileHistoryEntry, ProfileOutcome } from "@/lib/profile";

function entry(outcome: ProfileOutcome, matchId = outcome): ProfileHistoryEntry {
  return {
    matchId,
    homeTeam: "H",
    awayTeam: "A",
    homeCrestUrl: null,
    awayCrestUrl: null,
    kickoffAt: "2026-06-14T18:00:00.000Z",
    predictedHome: 1,
    predictedAway: 0,
    actualHome: null,
    actualAway: null,
    status: "TIMED",
    pointsAwarded: outcome === "exact" ? 3 : outcome === "good" ? 1 : outcome === "miss" ? 0 : null,
    outcome,
  };
}

describe("countOutcomes", () => {
  it("compte exact/good/miss et ignore pending", () => {
    const counts = countOutcomes([
      entry("exact", "1"),
      entry("exact", "2"),
      entry("good", "3"),
      entry("miss", "4"),
      entry("pending", "5"),
    ]);
    expect(counts).toEqual({ exact: 2, good: 1, miss: 1 });
  });

  it("retourne des zéros sur un tableau vide", () => {
    expect(countOutcomes([])).toEqual({ exact: 0, good: 0, miss: 0 });
  });

  it("retourne des zéros quand tout est pending", () => {
    expect(countOutcomes([entry("pending", "1"), entry("pending", "2")])).toEqual({
      exact: 0,
      good: 0,
      miss: 0,
    });
  });
});
```

> Note: `ProfileOutcome` est déjà exporté par `profile.ts`. Vérifier que `ProfileHistoryEntry` l'est aussi (il l'est — `export type ProfileHistoryEntry`).

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npm test -- profile`
Expected: FAIL — `countOutcomes is not a function` / import non résolu.

- [ ] **Step 3: Implémenter `countOutcomes`**

Ajouter dans `src/lib/profile.ts`, après `buildProfileHistory` :

```ts
export type OutcomeCounts = { exact: number; good: number; miss: number };

/** Compte les issues par catégorie, en ignorant les pronos en attente. */
export function countOutcomes(entries: ProfileHistoryEntry[]): OutcomeCounts {
  const counts: OutcomeCounts = { exact: 0, good: 0, miss: 0 };
  for (const e of entries) {
    if (e.outcome === "exact") counts.exact += 1;
    else if (e.outcome === "good") counts.good += 1;
    else if (e.outcome === "miss") counts.miss += 1;
  }
  return counts;
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npm test -- profile`
Expected: PASS (anciens tests + 3 nouveaux).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile.ts tests/profile.test.ts
git commit -m "feat(profile): countOutcomes pur (ventilation exact/good/miss)"
```

---

## Task 2: Helper pur `partitionHistory`

**Files:**
- Modify: `src/lib/profile.ts`
- Test: `tests/profile.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `tests/profile.test.ts` (étendre l'import : `import { buildProfileHistory, countOutcomes, partitionHistory } from "@/lib/profile";`). Réutilise la fabrique `entry` de la Task 1 :

```ts
describe("partitionHistory", () => {
  it("sépare pending et played", () => {
    const { pending, played } = partitionHistory([
      entry("pending", "1"),
      entry("exact", "2"),
      entry("miss", "3"),
    ]);
    expect(pending.map((e) => e.matchId)).toEqual(["1"]);
    expect(played.map((e) => e.matchId)).toEqual(["2", "3"]);
  });

  it("préserve l'ordre d'entrée dans chaque groupe", () => {
    const { played } = partitionHistory([
      entry("exact", "a"),
      entry("good", "b"),
      entry("miss", "c"),
    ]);
    expect(played.map((e) => e.matchId)).toEqual(["a", "b", "c"]);
  });

  it("retourne deux tableaux vides sur entrée vide", () => {
    expect(partitionHistory([])).toEqual({ pending: [], played: [] });
  });

  it("gère le cas tout-pending et tout-played", () => {
    expect(partitionHistory([entry("pending", "1")]).played).toEqual([]);
    expect(partitionHistory([entry("exact", "1")]).pending).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npm test -- profile`
Expected: FAIL — `partitionHistory is not a function`.

- [ ] **Step 3: Implémenter `partitionHistory`**

Ajouter dans `src/lib/profile.ts`, après `countOutcomes` :

```ts
/**
 * Sépare l'historique en pronos en attente (match non terminé) et matchs joués.
 * Ne re-trie PAS : l'ordre vient de buildProfileHistory (kickoff décroissant).
 */
export function partitionHistory(entries: ProfileHistoryEntry[]): {
  pending: ProfileHistoryEntry[];
  played: ProfileHistoryEntry[];
} {
  const pending: ProfileHistoryEntry[] = [];
  const played: ProfileHistoryEntry[] = [];
  for (const e of entries) {
    if (e.outcome === "pending") pending.push(e);
    else played.push(e);
  }
  return { pending, played };
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npm test -- profile`
Expected: PASS (anciens + 4 nouveaux).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile.ts tests/profile.test.ts
git commit -m "feat(profile): partitionHistory pur (en attente / joués)"
```

---

## Task 3: Composant `HistoryRow` (écussons + date)

**Files:**
- Modify: `src/app/profile/[login]/page.tsx`

> Pas de test unitaire de rendu (le projet teste la logique pure, pas le JSX). La vérification se fait via typecheck/lint/build à la Task 5.

- [ ] **Step 1: Ajouter le formateur de date au niveau module**

Dans `src/app/profile/[login]/page.tsx`, juste après la déclaration de `PCT_FMT` :

```ts
const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
```

- [ ] **Step 2: Ajouter le composant `HistoryRow` en bas du fichier**

Ajouter après le composant `Stat` (en bas du fichier). Importe le type si besoin : `ProfileHistoryEntry` est déjà importé indirectement ? Non — ajouter à l'import existant : `import { buildProfileHistory, type ProfileOutcome, type ProfileHistoryEntry } from "@/lib/profile";`

```tsx
function Crest({ url }: { url: string | null }) {
  if (!url) {
    return <span className="h-5 w-5 shrink-0 rounded bg-white/10" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-5 w-5 shrink-0 rounded object-contain" />
  );
}

function HistoryRow({ entry }: { entry: ProfileHistoryEntry }) {
  const o = OUTCOME[entry.outcome];
  const finished = entry.actualHome !== null && entry.actualAway !== null;
  return (
    <li className="glass flex items-center gap-3 px-4 py-3 text-sm">
      <Crest url={entry.homeCrestUrl} />
      <span className="flex-1 truncate">
        {entry.homeTeam} <span className="text-zinc-500">vs</span> {entry.awayTeam}
      </span>
      <Crest url={entry.awayCrestUrl} />
      <span className="shrink-0 text-zinc-400">
        {DATE_FMT.format(new Date(entry.kickoffAt))}
      </span>
      <span className="shrink-0 tabular-nums text-zinc-400">
        prono {entry.predictedHome}–{entry.predictedAway}
      </span>
      <span className="w-12 shrink-0 text-right font-medium tabular-nums">
        {finished ? `${entry.actualHome}–${entry.actualAway}` : "—"}
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${o.cls}`}
      >
        {o.label}
      </span>
    </li>
  );
}
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npm run typecheck`
Expected: PASS (le composant n'est pas encore utilisé — c'est attendu, pas d'erreur de type ; un warning lint "unused" est possible mais sera résolu à la Task 4 quand on l'utilise).

> Si `npm run typecheck` signale `HistoryRow`/`Crest` non utilisés : ignorer, la Task 4 les câble. Ne pas committer cette task isolément — enchaîner Task 4 puis commit groupé à la Task 5.

---

## Task 4: Câbler chips de ventilation + sections En attente / Joués

**Files:**
- Modify: `src/app/profile/[login]/page.tsx`

- [ ] **Step 1: Calculer counts + partition dans le composant page**

Dans `ProfilePage`, après la ligne `const history = buildProfileHistory(...)`, ajouter (et étendre l'import depuis `@/lib/profile` avec `countOutcomes, partitionHistory`) :

```ts
const counts = countOutcomes(history);
const { pending, played } = partitionHistory(history);
```

Import final attendu en tête de fichier :

```ts
import {
  buildProfileHistory,
  countOutcomes,
  partitionHistory,
  type ProfileHistoryEntry,
  type ProfileOutcome,
} from "@/lib/profile";
```

- [ ] **Step 2: Ajouter la rangée de chips après le `<dl>` des stats**

Juste après la fermeture `</dl>` (la grille des 4 stats), avant le `<h2>` Historique :

```tsx
{history.length > 0 && (
  <div className="mb-8 flex gap-3">
    <OutcomeChip n={counts.exact} label="scores exacts" cls={OUTCOME.exact.cls} />
    <OutcomeChip n={counts.good} label="bons résultats" cls={OUTCOME.good.cls} />
    <OutcomeChip n={counts.miss} label="ratés" cls={OUTCOME.miss.cls} />
  </div>
)}
```

- [ ] **Step 3: Remplacer le bloc timeline par deux sections**

Remplacer tout le bloc actuel `<h2>Historique</h2> … </ul>)}` par :

```tsx
{history.length === 0 ? (
  <p className="text-zinc-400">Aucun pronostic pour l&apos;instant.</p>
) : (
  <>
    {pending.length > 0 && (
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
          En attente
        </h2>
        <ul className="space-y-2">
          {pending.map((h) => (
            <HistoryRow key={h.matchId} entry={h} />
          ))}
        </ul>
      </section>
    )}
    {played.length > 0 && (
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
          Joués
        </h2>
        <ul className="space-y-2">
          {played.map((h) => (
            <HistoryRow key={h.matchId} entry={h} />
          ))}
        </ul>
      </section>
    )}
  </>
)}
```

- [ ] **Step 4: Ajouter le composant `OutcomeChip` en bas du fichier**

Après `Stat` (ou à côté de `HistoryRow`) :

```tsx
function OutcomeChip({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div className={`flex-1 rounded-xl px-3 py-2 text-center text-sm ${cls}`}>
      <span className="block text-lg font-bold tabular-nums">{n}</span>
      {label}
    </div>
  );
}
```

- [ ] **Step 5: Nettoyer les imports inutilisés**

Vérifier que `ProfileOutcome` est toujours utilisé (oui — par la constante `OUTCOME`). Retirer tout import devenu inutile.

---

## Task 5: Vérification finale + commit UI

**Files:** aucun nouveau — gates de qualité.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS, aucune erreur.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: PASS — pas d'erreur `no-img-element` (le commentaire `eslint-disable-next-line` est présent dans `Crest`), pas de variable inutilisée.

- [ ] **Step 3: Suite de tests complète**

Run: `npm test`
Expected: PASS — 101 anciens + 7 nouveaux (3 `countOutcomes` + 4 `partitionHistory`).

- [ ] **Step 4: Build production**

Run: `npm run build`
Expected: SUCCESS — la route `/profile/[login]` compile.

- [ ] **Step 5: Commit UI**

```bash
git add src/app/profile/[login]/page.tsx
git commit -m "feat(profile): historique enrichi (écussons, date, ventilation, sections)"
```

---

## Notes d'exécution

- Tasks 3 et 4 modifient le même fichier et **ne sont pas committées séparément** : le composant `HistoryRow` créé en Task 3 n'est câblé qu'en Task 4. Le commit unique tombe à la Task 5 après que toutes les gates sont vertes.
- Tasks 1 et 2 sont indépendantes et committées chacune (logique pure testée isolément).
- Ne pas pousser ni ouvrir de PR : ce travail s'empile sur `feat/coalitions-pipeline` pour une PR groupée ultérieure.
