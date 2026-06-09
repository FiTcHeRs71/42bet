# Résumé des rangs sur le profil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher sur la page profil une ligne compacte avec le rang du joueur (et son dénominateur) en général, dans son camp, et dans sa coalition.

**Architecture:** Une fonction pure `buildProfileRanks(entries, login)` dans `src/lib/leaderboard.ts` dérive les 3 rangs des `entries` déjà calculées par `buildLeaderboard` (réutilise `assignRanks` + `coalitionGroupOf`, aucun recalcul de points, aucune requête en plus). La page profil rend une ligne discrète via un helper inline.

**Tech Stack:** Next.js 16 (App Router, server component), React 19, TypeScript strict, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-08-profile-ranks-design.md`

**Base de branche :** `feat/profile-ranks` est stackée sur `feat/leaderboard-segments` (PR #8) — elle dépend de `assignRanks`, `coalitionGroupOf`, `CAMP_LABEL`, `LeaderboardEntry` qui y vivent déjà.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/leaderboard.ts` | + type `ProfileRanks` + fonction pure `buildProfileRanks` |
| `src/app/profile/[login]/page.tsx` | + ligne compacte des 3 rangs (helper de présentation inline) |
| `tests/leaderboard.test.ts` | tests de `buildProfileRanks` |

Vérification (AGENTS.md §6) : `npm test`, `npm run typecheck`, `npm run lint`.

---

## Task 1: `buildProfileRanks` (logique pure)

**Files:**
- Modify: `src/lib/leaderboard.ts`
- Test: `tests/leaderboard.test.ts`

- [ ] **Step 1: Write the failing test**

Dans `tests/leaderboard.test.ts`, ajouter `buildProfileRanks` et `ProfileRanks` à l'import existant depuis `../src/lib/leaderboard` (garder les symboles déjà importés, ajouter les deux nouveaux dans l'ordre alphabétique) :

```ts
import {
  assignRanks,
  buildCampStandings,
  buildCoalitionLeaderboard,
  buildLeaderboard,
  buildProfileRanks,
  type CampStanding,
  type LeaderboardBet,
  type LeaderboardEntry,
  type LeaderboardPlayer,
  type ProfileRanks,
} from "../src/lib/leaderboard";
```

Ajouter ce bloc de tests à la fin du fichier :

```ts
describe("buildProfileRanks", () => {
  const threads = { ft_id: 192, name: "House of Threads", color: "#599ac2", image_url: null };
  const cores = { ft_id: 191, name: "House of Cores", color: "#B23256", image_url: null };
  const frogs = { ft_id: 167, name: "The Frogs", color: "#6c8946", image_url: null };

  function entry(
    login: string,
    points: number,
    coalition: LeaderboardEntry["coalition"],
  ): LeaderboardEntry {
    return { rank: 0, login, avatarUrl: null, coalition, points, bets: 1, accuracy: null };
  }

  // Classement (points décroissants) : alice(cores,10) bob(threads,8)
  //   carol(threads,6) dan(frogs,4) eve(frogs,2)
  const entries: LeaderboardEntry[] = assignRanks([
    entry("alice", 10, cores),
    entry("bob", 8, threads),
    entry("carol", 6, threads),
    entry("dan", 4, frogs),
    entry("eve", 2, frogs),
  ]);

  test("rangs général / camp / coalition + totaux (joueur cursus)", () => {
    // carol : 3e/5 général ; cursus = alice,bob,carol -> 3e/3 ; Threads = bob,carol -> 2e/2
    const r = buildProfileRanks(entries, "carol");
    expect(r.general).toEqual({ rank: 3, total: 5 });
    expect(r.camp).toEqual({ rank: 3, total: 3, label: "Students" });
    expect(r.coalition).toEqual({ rank: 2, total: 2, name: "House of Threads" });
  });

  test("joueur piscine : camp Piscineux, coalition Frogs", () => {
    // dan : 4e/5 général ; piscine = dan,eve -> 1er/2 ; Frogs = dan,eve -> 1er/2
    const r = buildProfileRanks(entries, "dan");
    expect(r.general).toEqual({ rank: 4, total: 5 });
    expect(r.camp).toEqual({ rank: 1, total: 2, label: "Piscineux" });
    expect(r.coalition).toEqual({ rank: 1, total: 2, name: "The Frogs" });
  });

  test("joueur sans coalition : camp et coalition null", () => {
    const withSolo = assignRanks([
      entry("alice", 10, cores),
      entry("solo", 5, null),
    ]);
    const r = buildProfileRanks(withSolo, "solo");
    expect(r.general).toEqual({ rank: 2, total: 2 });
    expect(r.camp).toBeNull();
    expect(r.coalition).toBeNull();
  });

  test("joueur absent (0 prono) : tout null", () => {
    const r = buildProfileRanks(entries, "ghost");
    expect(r.general).toBeNull();
    expect(r.camp).toBeNull();
    expect(r.coalition).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/leaderboard.test.ts -t buildProfileRanks`
Expected: FAIL — `buildProfileRanks` non exporté.

- [ ] **Step 3: Write minimal implementation**

Dans `src/lib/leaderboard.ts`, ajouter à la fin du fichier :

```ts
export type ProfileRanks = {
  general: { rank: number; total: number } | null;
  camp: { rank: number; total: number; label: string } | null;
  coalition: { rank: number; total: number; name: string } | null;
};

/**
 * Rangs individuels d'un joueur dans 3 dimensions, dérivés des `entries` déjà
 * produites par buildLeaderboard (parieurs actifs). Rang ET dénominateur
 * proviennent du même sous-ensemble. Aucun recalcul de points (rule #7).
 * Si le joueur n'a pas parié (absent de `entries`) -> tout null. Sans coalition
 * -> camp et coalition null.
 */
export function buildProfileRanks(
  entries: LeaderboardEntry[],
  login: string,
): ProfileRanks {
  const self = entries.find((e) => e.login === login);
  if (!self) return { general: null, camp: null, coalition: null };

  const general = { rank: self.rank, total: entries.length };

  if (self.coalition === null) {
    return { general, camp: null, coalition: null };
  }

  const selfGroup = coalitionGroupOf(self.coalition.ft_id);
  const campEntries = assignRanks(
    entries.filter(
      (e) => e.coalition !== null && coalitionGroupOf(e.coalition.ft_id) === selfGroup,
    ),
  );
  const campSelf = campEntries.find((e) => e.login === login)!;
  const camp = {
    rank: campSelf.rank,
    total: campEntries.length,
    label: CAMP_LABEL[selfGroup],
  };

  const coalitionName = self.coalition.name;
  const coalitionEntries = assignRanks(
    entries.filter((e) => e.coalition !== null && e.coalition.name === coalitionName),
  );
  const coalitionSelf = coalitionEntries.find((e) => e.login === login)!;
  const coalition = {
    rank: coalitionSelf.rank,
    total: coalitionEntries.length,
    name: coalitionName,
  };

  return { general, camp, coalition };
}
```

Notes pour l'implémenteur :
- `coalitionGroupOf` et `CAMP_LABEL` existent déjà dans ce fichier / son import (`@/lib/coalitions` pour `coalitionGroupOf`, `CAMP_LABEL` est une const module-locale ajoutée par la feature précédente). Si `CAMP_LABEL` n'est pas accessible, vérifier qu'il est bien défini plus haut dans `leaderboard.ts` (il l'est).
- `assignRanks` accepte `Omit<LeaderboardEntry,"rank">[]` ; lui passer des `LeaderboardEntry[]` est OK (le `rank` excédentaire est ignoré et recalculé).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/leaderboard.test.ts -t buildProfileRanks`
Expected: PASS (4 tests).
Run: `npm test`
Expected: toute la suite verte.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts tests/leaderboard.test.ts
git commit -m "feat(profile): buildProfileRanks — rangs général/camp/coalition + totaux"
```

---

## Task 2: ligne compacte sur le profil

**Files:**
- Modify: `src/app/profile/[login]/page.tsx`

> Pas de test unitaire : rendu de présentation. La logique est testée en Task 1. Vérification = typecheck + lint + build.

- [ ] **Step 1: Importer `buildProfileRanks` et calculer les rangs**

Dans `src/app/profile/[login]/page.tsx`, l'import existant (lignes ~6) est :
```ts
import { buildLeaderboard } from "@/lib/leaderboard";
```
Le remplacer par :
```ts
import { buildLeaderboard, buildProfileRanks } from "@/lib/leaderboard";
```

Le composant calcule déjà (lignes ~44-45) :
```ts
  const entry =
    buildLeaderboard(players, allBets).find((e) => e.login === login) ?? null;
```
Le remplacer par (réutiliser le tableau au lieu de rappeler `buildLeaderboard`) :
```ts
  const entries = buildLeaderboard(players, allBets);
  const entry = entries.find((e) => e.login === login) ?? null;
  const ranks = buildProfileRanks(entries, login);
```

- [ ] **Step 2: Rendre la ligne sous le `CoalitionBadge`**

Dans l'en-tête, le bloc actuel (lignes ~64-71) est :
```tsx
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {player.login}
          </h1>
          <div className="mt-1">
            <CoalitionBadge coalition={player.coalition} size="md" />
          </div>
        </div>
```
Le remplacer par :
```tsx
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {player.login}
          </h1>
          <div className="mt-1">
            <CoalitionBadge coalition={player.coalition} size="md" />
          </div>
          <RankLine ranks={ranks} />
        </div>
```

- [ ] **Step 3: Ajouter le helper `RankLine` et `ordinalFr`**

Ajouter ces helpers en bas du fichier (à côté de `Stat` / `OutcomeChip`) :
```tsx
/** Ordinal français : 1 -> "1ᵉʳ", n -> "nᵉ". */
function ordinalFr(n: number): string {
  return n === 1 ? "1ᵉʳ" : `${n}ᵉ`;
}

/** Ligne compacte des 3 rangs sous le badge. Masquée si le joueur n'a pas parié. */
function RankLine({ ranks }: { ranks: ProfileRanks }) {
  if (ranks.general === null) return null;
  const parts = [`${ordinalFr(ranks.general.rank)}/${ranks.general.total} général`];
  if (ranks.camp) {
    parts.push(`${ordinalFr(ranks.camp.rank)}/${ranks.camp.total} ${ranks.camp.label.toLowerCase()}`);
  }
  if (ranks.coalition) {
    parts.push(`${ordinalFr(ranks.coalition.rank)}/${ranks.coalition.total} ${ranks.coalition.name}`);
  }
  return (
    <p className="mt-1.5 text-xs tabular-nums text-zinc-400">
      {parts.join(" · ")}
    </p>
  );
}
```

Ajouter le type `ProfileRanks` à l'import depuis `@/lib/leaderboard` (Step 1 l'a importé sans le type) :
```ts
import { buildLeaderboard, buildProfileRanks, type ProfileRanks } from "@/lib/leaderboard";
```

- [ ] **Step 4: Vérifier typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Vérifier le build**

Run: `npm run build`
Expected: build OK, route `/profile/[login]` présente.

- [ ] **Step 6: Commit**

```bash
git add src/app/profile/[login]/page.tsx
git commit -m "feat(profile): ligne compacte des rangs général/camp/coalition"
```

---

## Task 3: gates finaux

**Files:** aucun (vérification).

- [ ] **Step 1: Suite complète**

Run: `npm test`
Expected: tout vert.

- [ ] **Step 2: Typecheck + lint + build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: PASS partout.

- [ ] **Step 3: Vérification visuelle (optionnel)**

`npm run dev`, ouvrir un profil `http://localhost:3000/profile/<login>` :
- ligne « Nᵉ/T général · Nᵉ/T camp · Nᵉ/T coalition » sous le badge ;
- joueur sans coalition → seulement le général ;
- joueur sans prono → pas de ligne.

- [ ] **Step 4: PR**

Suivre `skills/pr-template/SKILL.md` + `.github/pull_request_template.md`. Cible `main`. Note : branche stackée sur `feat/leaderboard-segments` (PR #8) — la mentionner dans la description ; idéalement merger #8 d'abord pour un diff propre.

---

## Self-Review (effectué)

- **Couverture spec** : §3 logique → Task 1 ; §4 UI ligne compacte + masquage → Task 2 ; §2 cohérence rang/total (sous-ensemble parieurs actifs) → assuré par `entries.filter(...).length` + `assignRanks` en Task 1 ; §5 tests → Task 1. ✓
- **Placeholders** : aucun — code complet à chaque étape. ✓
- **Cohérence des types** : `ProfileRanks` (general/camp/coalition avec rank+total, label pour camp, name pour coalition) identique entre Task 1 (lib + tests) et Task 2 (UI). `buildProfileRanks(entries, login)` même signature partout. ✓
- **Règles projet** : pas de recalcul de points, pas de requête supplémentaire (réutilise `entries`), server component (pas de fetch client). ✓
