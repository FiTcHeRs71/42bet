# Classement général (`/leaderboard`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher un classement public des joueurs ayant pronostiqué, trié par points, avec login + avatar + badge coalition + nb de pronos + taux de réussite.

**Architecture:** Approche A — fonction **pure testée** (`leaderboard.ts`) qui agrège les pronos (points déjà attribués par le cron) et attribue les rangs, alimentée par deux lectures I/O minces server-only (`listPlayers`, `listAllBets`) via `supabaseAdmin`. La page `/leaderboard` (server component) appelle l'I/O en parallèle, passe le tout à la fonction pure, et rend les lignes avec le composant `CoalitionBadge` (matérialise enfin la skill `coalition-badge`). Aucune migration DB.

**Tech Stack:** Next.js 16 (App Router, server component, `force-dynamic`), React 19, Supabase (`supabaseAdmin` service_role), Vitest.

**Référence spec :** `docs/superpowers/specs/2026-06-04-leaderboard-design.md`

## État d'avancement (maj 2026-06-04) — ✅ LIVRÉ

Exécution inline sur `feat/leaderboard`, mergée dans `main` (`2015634`), branche supprimée.
**Avec cette brique, le MVP est complet (5/5).**

- [x] **Task 1 — `leaderboard.ts`** (pur, 9 tests) — commit `9ffc8c7`.
- [x] **Task 2 — I/O `listPlayers` + `listAllBets`** (server-only) — commit `7b8db1c`.
- [x] **Task 3 — `coalition-badge.tsx`** (matérialise la skill) — commit `df65755`.
- [x] **Task 4 — `page.tsx` + lien nav** — commit `4e3b12a`. Build ✅ (`/leaderboard` ƒ Dynamic).
- [x] **Task 5 — gates finaux** : 64 tests · typecheck · lint · build · anti-secret ✅. Merge `2015634`.

**Branche :** créer `feat/leaderboard` depuis `main` avant la Task 1 :
```bash
git checkout main && git checkout -b feat/leaderboard
```

**Conventions repo à respecter :**
- Fonction pure testée, I/O séparée (SRP, AGENTS.md §10) — calque `points.ts` / `match-view.ts`.
- `supabaseAdmin` est `server-only` ; jamais importé dans un `"use client"` (rule #3). La page et l'I/O sont server-side ; on n'expose que des agrégats, jamais les pronos individuels.
- Calcul des points jamais réimplémenté (rule #7) — on additionne `points_awarded`.
- JSX français : apostrophes via `&apos;` (sinon ESLint `react/no-unescaped-entities`).
- Commits : `type(scope): description` impérative ≤ 72 char, scope `leaderboard`.

---

## Task 1 : `leaderboard.ts` — logique pure (TDD)

**Files:**
- Create: `src/lib/leaderboard.ts`
- Test: `tests/leaderboard.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
// tests/leaderboard.test.ts
import { describe, test, expect } from "vitest";

import {
  buildLeaderboard,
  type LeaderboardBet,
  type LeaderboardPlayer,
} from "../src/lib/leaderboard";

const COA = { name: "The Federation", color: "#39c2c2", image_url: null };

function player(
  id: string,
  login: string,
  coalition: LeaderboardPlayer["coalition"] = null,
): LeaderboardPlayer {
  return { id, login, avatar_url: null, coalition };
}

describe("buildLeaderboard", () => {
  test("aucune donnée -> []", () => {
    expect(buildLeaderboard([], [])).toEqual([]);
  });

  test("joueur sans prono -> exclu", () => {
    expect(buildLeaderboard([player("u1", "alice")], [])).toEqual([]);
  });

  test("tri par points décroissant", () => {
    const players = [player("u1", "alice"), player("u2", "bob")];
    const bets: LeaderboardBet[] = [
      { user_id: "u1", points_awarded: 1 },
      { user_id: "u2", points_awarded: 3 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r.map((e) => e.login)).toEqual(["bob", "alice"]);
    expect(r.map((e) => e.rank)).toEqual([1, 2]);
  });

  test("ex æquo -> même rang, le suivant saute (1,1,3)", () => {
    const players = [
      player("u1", "alice"),
      player("u2", "bob"),
      player("u3", "carol"),
    ];
    const bets: LeaderboardBet[] = [
      { user_id: "u1", points_awarded: 3 },
      { user_id: "u2", points_awarded: 3 },
      { user_id: "u3", points_awarded: 1 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r.map((e) => e.rank)).toEqual([1, 1, 3]);
  });

  test("départage par login à points égaux", () => {
    const players = [player("u2", "bob"), player("u1", "alice")];
    const bets: LeaderboardBet[] = [
      { user_id: "u2", points_awarded: 3 },
      { user_id: "u1", points_awarded: 3 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r.map((e) => e.login)).toEqual(["alice", "bob"]);
  });

  test("accuracy = gagnants / notés, pronos en attente exclus du dénominateur", () => {
    const players = [player("u1", "alice")];
    const bets: LeaderboardBet[] = [
      { user_id: "u1", points_awarded: 3 }, // gagné, noté
      { user_id: "u1", points_awarded: 0 }, // perdu, noté
      { user_id: "u1", points_awarded: null }, // en attente
    ];
    const r = buildLeaderboard(players, bets);
    expect(r[0].bets).toBe(3);
    expect(r[0].accuracy).toBe(0.5); // 1 gagné / 2 notés
  });

  test("accuracy = null si aucun prono noté", () => {
    const players = [player("u1", "alice")];
    const bets: LeaderboardBet[] = [{ user_id: "u1", points_awarded: null }];
    const r = buildLeaderboard(players, bets);
    expect(r[0].accuracy).toBeNull();
    expect(r[0].bets).toBe(1);
  });

  test("points somme correctement, null compté 0", () => {
    const players = [player("u1", "alice")];
    const bets: LeaderboardBet[] = [
      { user_id: "u1", points_awarded: 3 },
      { user_id: "u1", points_awarded: null },
      { user_id: "u1", points_awarded: 1 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r[0].points).toBe(4);
  });

  test("coalition propagée telle quelle", () => {
    const players = [player("u1", "alice", COA)];
    const bets: LeaderboardBet[] = [{ user_id: "u1", points_awarded: 1 }];
    const r = buildLeaderboard(players, bets);
    expect(r[0].coalition).toEqual(COA);
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npx vitest run tests/leaderboard.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/leaderboard'`.

- [ ] **Step 3 : Implémenter le module pur**

```ts
// src/lib/leaderboard.ts
// Construction du classement général — logique PURE (aucune I/O, aucun temps).
// Agrège les pronos notés par le cron (points_awarded) sans JAMAIS recalculer de
// points (rule #7) : on additionne des valeurs déjà attribuées. Tri + ex æquo +
// taux de réussite testés dans tests/leaderboard.test.ts.

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
  points: number; // somme des points_awarded (null compté 0)
  bets: number; // nb total de pronos
  accuracy: number | null; // 0..1 ; null si aucun prono noté
};

export function buildLeaderboard(
  players: LeaderboardPlayer[],
  bets: LeaderboardBet[],
): LeaderboardEntry[] {
  // 1. Regrouper les pronos par joueur.
  const betsByUser = new Map<string, LeaderboardBet[]>();
  for (const bet of bets) {
    const list = betsByUser.get(bet.user_id);
    if (list) list.push(bet);
    else betsByUser.set(bet.user_id, [bet]);
  }

  // 2. Agréger uniquement les joueurs ayant au moins un prono.
  const aggregated = players
    .filter((p) => betsByUser.has(p.id))
    .map((p) => {
      const userBets = betsByUser.get(p.id)!;
      let points = 0;
      let scored = 0;
      let wins = 0;
      for (const b of userBets) {
        if (b.points_awarded !== null) {
          points += b.points_awarded;
          scored += 1;
          if (b.points_awarded > 0) wins += 1;
        }
      }
      return {
        login: p.login,
        avatarUrl: p.avatar_url,
        coalition: p.coalition,
        points,
        bets: userBets.length,
        accuracy: scored > 0 ? wins / scored : null,
      };
    });

  // 3. Tri : points décroissants, puis login croissant (départage déterministe).
  aggregated.sort(
    (a, b) => b.points - a.points || a.login.localeCompare(b.login),
  );

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
}
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `npx vitest run tests/leaderboard.test.ts`
Expected: PASS — 9/9.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/leaderboard.ts tests/leaderboard.test.ts
git commit -m "feat(leaderboard): pure buildLeaderboard (aggregate + rank)"
```

---

## Task 2 : I/O — `listPlayers` + `listAllBets`

**Files:**
- Modify: `src/lib/users.ts`
- Modify: `src/lib/bets.ts`

> Convention repo : l'I/O n'est pas testée unitairement (cf. `matches.ts`, `sync.ts`). On valide via typecheck/lint.

- [ ] **Step 1 : Ajouter `listPlayers` à `users.ts`**

Ajouter l'import du type en tête de fichier (après les imports existants) :

```ts
import type { LeaderboardPlayer } from "@/lib/leaderboard";
```

Puis ajouter la fonction en fin de fichier :

```ts
/**
 * Tous les joueurs avec leur coalition (jointure), pour le classement. Lecture
 * server-only via service_role. Normalise la coalition imbriquée en objet|null :
 * supabase-js peut la typer en objet OU en tableau selon la détection de relation,
 * donc on gère les deux formes à l'exécution.
 */
export async function listPlayers(): Promise<LeaderboardPlayer[]> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, login, avatar_url, coalition:coalitions(name, color, image_url)");

  if (error) throw new Error(`listPlayers: ${error.message}`);

  return (data ?? []).map((row) => {
    const c = row.coalition as
      | { name: string; color: string; image_url: string | null }
      | { name: string; color: string; image_url: string | null }[]
      | null;
    return {
      id: row.id,
      login: row.login,
      avatar_url: row.avatar_url,
      coalition: Array.isArray(c) ? (c[0] ?? null) : c,
    };
  });
}
```

- [ ] **Step 2 : Ajouter `listAllBets` à `bets.ts`**

Ajouter l'import du type au bloc d'imports de types existant (`bets.ts` importe déjà `Bet` depuis `@/lib/types`) :

```ts
import type { LeaderboardBet } from "@/lib/leaderboard";
```

Puis ajouter la fonction en fin de fichier :

```ts
/**
 * Tous les pronos (id joueur + points attribués) pour le classement. Lecture
 * server-only via service_role (bets est RLS default-deny). On ne renvoie que
 * user_id + points_awarded — jamais les scores pronostiqués individuels.
 */
export async function listAllBets(): Promise<LeaderboardBet[]> {
  const { data, error } = await supabaseAdmin
    .from("bets")
    .select("user_id, points_awarded");

  if (error) throw new Error(`listAllBets: ${error.message}`);
  return data ?? [];
}
```

- [ ] **Step 3 : Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: pas d'erreur.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/users.ts src/lib/bets.ts
git commit -m "feat(leaderboard): I/O listPlayers + listAllBets (server-only)"
```

---

## Task 3 : `coalition-badge.tsx` — composant badge coalition

**Files:**
- Create: `src/components/coalition-badge.tsx`

> Matérialise la skill `coalition-badge`. Fichier kebab-case (convention repo) ; export `CoalitionBadge`. Couleur depuis la DB, fallback neutre, `aria-label`, contraste texte/fond auto.

- [ ] **Step 1 : Implémenter le composant**

```tsx
// src/components/coalition-badge.tsx
// Badge coalition 42 — composant unique réutilisable (skill coalition-badge).
// Couleur officielle depuis la DB (jamais hardcodée), fallback gris si pas de
// coalition, aria-label = nom, texte noir/blanc choisi selon la luminance du fond
// (contraste). Purement informatif (pas de lien).

type Coalition = { name: string; color: string; image_url: string | null };

const SIZE = {
  sm: "h-5 px-2 text-[10px]",
  md: "h-6 px-2.5 text-xs",
  lg: "h-7 px-3 text-sm",
} as const;

export function CoalitionBadge({
  coalition,
  size = "md",
}: {
  coalition: Coalition | null;
  size?: keyof typeof SIZE;
}) {
  if (!coalition) {
    return (
      <span
        aria-label="Sans coalition"
        className={`inline-flex items-center rounded-full bg-zinc-200 font-medium text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300 ${SIZE[size]}`}
      >
        —
      </span>
    );
  }

  return (
    <span
      aria-label={coalition.name}
      style={{ backgroundColor: coalition.color, color: readableTextColor(coalition.color) }}
      className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold ${SIZE[size]}`}
    >
      {coalition.name}
    </span>
  );
}

/** Noir ou blanc selon la luminance perçue du fond (contraste lisible). */
function readableTextColor(hex: string): "#000" | "#fff" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#000";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#000" : "#fff";
}
```

- [ ] **Step 2 : Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: pas d'erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/components/coalition-badge.tsx
git commit -m "feat(leaderboard): CoalitionBadge component (skill coalition-badge)"
```

---

## Task 4 : `page.tsx` + lien nav

**Files:**
- Create: `src/app/leaderboard/page.tsx`
- Modify: `src/components/site-header.tsx`

- [ ] **Step 1 : Créer la page classement**

```tsx
// src/app/leaderboard/page.tsx
import { CoalitionBadge } from "@/components/coalition-badge";
import { listAllBets } from "@/lib/bets";
import { buildLeaderboard } from "@/lib/leaderboard";
import { listPlayers } from "@/lib/users";

// Les points évoluent après chaque match : le rendu ne doit pas être figé.
export const dynamic = "force-dynamic";

const PCT_FMT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});

export default async function LeaderboardPage() {
  const [players, bets] = await Promise.all([listPlayers(), listAllBets()]);
  const entries = buildLeaderboard(players, bets);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Classement</h1>

      {entries.length === 0 ? (
        <p className="text-zinc-500">Aucun pronostic pour l&apos;instant.</p>
      ) : (
        <>
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
                <span className="flex-1 truncate font-medium">{e.login}</span>
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

> Note alignement : le badge coalition (largeur auto) vit dans la zone `flex-1` du joueur ; les 3 colonnes numériques (`w-14`/`w-10`/`w-12`, alignées à droite) restent donc alignées entre l'en-tête et les lignes.

- [ ] **Step 2 : Ajouter le lien `Classement` dans le header**

Dans `src/components/site-header.tsx`, ajouter le lien après celui de `/matches` (ligne 12-14), dans le même `<div className="flex items-center gap-6">` :

```tsx
        <Link
          href="/leaderboard"
          className="text-sm text-zinc-500 hover:text-current"
        >
          Classement
        </Link>
```

Le `<div>` doit donc contenir, dans l'ordre : lien `42Bet` (/), lien `Matchs` (/matches), lien `Classement` (/leaderboard).

- [ ] **Step 3 : Build complet (route dynamique)**

Run: `npm run build`
Expected: succès, `/leaderboard` listée `ƒ (Dynamic)`.

- [ ] **Step 4 : Commit**

```bash
git add src/app/leaderboard/page.tsx src/components/site-header.tsx
git commit -m "feat(leaderboard): /leaderboard page + nav link"
```

---

## Task 5 : Gates finaux + merge

**Files:** (aucun — vérification)

- [ ] **Step 1 : Suite de tests complète**

Run: `npm test`
Expected: tous verts (55 existants + 9 nouveaux = 64).

- [ ] **Step 2 : Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: pas d'erreur.

- [ ] **Step 3 : Vérif import server-only côté client**

Run: `grep -rnE "^import .*(supabase|/server)" src/components`
Expected: aucune sortie (le badge n'importe aucun client Supabase).

- [ ] **Step 4 : Merge dans main (phase pré-déploiement, AGENTS.md §8)**

```bash
git checkout main
git merge --no-ff feat/leaderboard -m "merge: classement général (/leaderboard, tri + ex æquo + taux)"
npm test
git branch -d feat/leaderboard
```

(Pousser ensuite vers `origin/main` uniquement si l'utilisateur le demande.)

---

## Notes d'implémentation

- **Ordre des tâches** : 1 → 4 strictement (la page importe la fonction pure, l'I/O et le badge ; l'I/O importe les types de `leaderboard.ts`).
- **Pas de migration DB** : `users`, `bets`, `coalitions` existent déjà (0001/0002/0004).
- **Confidentialité** : on lit `bets` via `supabaseAdmin` mais on n'expose que des agrégats (points/nb/taux), jamais les scores pronostiqués individuels.
- **Avatars** : `<img>` brut (CDN 42) avec `eslint-disable-next-line @next/next/no-img-element` — pas de config `next/image remotePatterns` à ajouter pour cette brique.
- **Vérif manuelle optionnelle** après Task 4 : `npm run dev` → http://localhost:3000/leaderboard ; vérifier le tri, les ex æquo et le « — » de taux pour un joueur sans match terminé.
