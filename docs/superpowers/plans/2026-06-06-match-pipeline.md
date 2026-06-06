# Pipeline matchs (ingestion CM + simulation scoring) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingérer les vrais matchs de la Coupe du Monde 2026 depuis football-data.org dans la table `matches` (avec crests), les afficher sur `/matches`, et fournir un outil dev pour simuler l'attribution de points de bout en bout.

**Architecture:** Logique pure isolée (`match-sync.ts`, testée) + écriture atomique via fonction Postgres (`upsert_matches`) appelée par un endpoint cron protégé (`/api/cron/sync-matches`), sur le modèle exact de l'existant (`sync.ts` + `score_match` + `/api/cron/sync-results`). Un script dev exerce le vrai `score_match` pour valider le scoring. Aucune logique de points réimplémentée.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript strict, Supabase (service_role, RPC), Postgres (plpgsql), Vitest, football-data.org v4, tsx + `node --env-file`.

**Référence spec :** `docs/superpowers/specs/2026-06-06-match-pipeline-design.md`.

---

## File Structure

**Créés :**
- `src/lib/match-sync.ts` — types bruts API (fixtures) + `mapStatus` + `formatStage` + `parseMatchesForUpsert` (pur, sans `server-only`, testable).
- `tests/match-sync.test.ts` — tests unitaires du module pur.
- `supabase/migrations/0009_upsert_matches.sql` — fonction `upsert_matches(jsonb)` (service_role).
- `supabase/migrations/0010_remove_dev_seed_matches.sql` — suppression du seed factice.
- `src/app/api/cron/sync-matches/route.ts` — endpoint cron d'ingestion (CRON_SECRET).
- `scripts/simulate-score.ts` — outil dev de simulation de scoring (vrai `score_match`).

**Modifiés :**
- `src/lib/football-data.ts` — type de retour enrichi (champs fixture).
- `src/lib/database.types.ts` — régénéré (ajoute `upsert_matches`).
- `src/components/match-row.tsx` — affichage des crests.
- `vercel.json` — cron `sync-matches` quotidien.
- `package.json` — script `simulate-score` + devDep `tsx`.

**Ordre :** module pur (testé) → type fetch → migrations + regen types → route → cron → UI crests → script → validation end-to-end. Chaque tâche laisse les vérifs vertes et est commitée.

---

## Task 1: Module pur `match-sync.ts` (TDD)

**Files:**
- Create: `src/lib/match-sync.ts`
- Test: `tests/match-sync.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `tests/match-sync.test.ts` :

```ts
import { describe, it, expect } from "vitest";

import {
  mapStatus,
  formatStage,
  parseMatchesForUpsert,
  type WorldCupMatchesResponse,
} from "@/lib/match-sync";

describe("mapStatus", () => {
  it("mappe les statuts 'à venir'", () => {
    expect(mapStatus("SCHEDULED")).toBe("scheduled");
    expect(mapStatus("TIMED")).toBe("scheduled");
  });
  it("mappe les statuts 'en cours'", () => {
    expect(mapStatus("IN_PLAY")).toBe("live");
    expect(mapStatus("PAUSED")).toBe("live");
    expect(mapStatus("SUSPENDED")).toBe("live");
  });
  it("mappe terminé", () => {
    expect(mapStatus("FINISHED")).toBe("finished");
  });
  it("mappe reporté", () => {
    expect(mapStatus("POSTPONED")).toBe("postponed");
  });
  it("mappe annulé et inconnu vers 'cancelled'", () => {
    expect(mapStatus("CANCELLED")).toBe("cancelled");
    expect(mapStatus("WHATEVER")).toBe("cancelled");
  });
});

describe("formatStage", () => {
  it("formate la phase de groupes depuis le groupe", () => {
    expect(formatStage("GROUP_STAGE", "GROUP_A")).toBe("Groupe A");
  });
  it("formate les phases finales", () => {
    expect(formatStage("LAST_16", null)).toBe("8es de finale");
    expect(formatStage("QUARTER_FINALS", null)).toBe("Quarts de finale");
    expect(formatStage("SEMI_FINALS", null)).toBe("Demi-finales");
    expect(formatStage("THIRD_PLACE", null)).toBe("Petite finale");
    expect(formatStage("FINAL", null)).toBe("Finale");
  });
  it("renvoie null si stage inconnu sans groupe", () => {
    expect(formatStage(null, null)).toBeNull();
  });
});

describe("parseMatchesForUpsert", () => {
  it("mappe une fixture complète", () => {
    const res: WorldCupMatchesResponse = {
      matches: [
        {
          id: 537327,
          utcDate: "2026-06-11T19:00:00Z",
          status: "TIMED",
          stage: "GROUP_STAGE",
          group: "GROUP_A",
          homeTeam: { name: "Mexico", crest: "https://c/769.svg" },
          awayTeam: { name: "South Africa", crest: "https://c/9396.svg" },
        },
      ],
    };
    expect(parseMatchesForUpsert(res)).toEqual([
      {
        football_data_id: 537327,
        home_team: "Mexico",
        away_team: "South Africa",
        home_crest_url: "https://c/769.svg",
        away_crest_url: "https://c/9396.svg",
        stage: "Groupe A",
        kickoff_at: "2026-06-11T19:00:00Z",
        status: "scheduled",
      },
    ]);
  });

  it("gère équipes/crests nuls (match KO non déterminé)", () => {
    const res: WorldCupMatchesResponse = {
      matches: [
        {
          id: 1,
          utcDate: "2026-07-01T19:00:00Z",
          status: "TIMED",
          stage: "LAST_16",
          group: null,
          homeTeam: { name: null, crest: null },
          awayTeam: null,
        },
      ],
    };
    expect(parseMatchesForUpsert(res)).toEqual([
      {
        football_data_id: 1,
        home_team: "À déterminer",
        away_team: "À déterminer",
        home_crest_url: null,
        away_crest_url: null,
        stage: "8es de finale",
        kickoff_at: "2026-07-01T19:00:00Z",
        status: "scheduled",
      },
    ]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/match-sync.test.ts`
Expected: FAIL — `Cannot find module '@/lib/match-sync'`.

- [ ] **Step 3: Implémenter le module minimal**

Créer `src/lib/match-sync.ts` :

```ts
// src/lib/match-sync.ts
// Transformation pure du payload football-data.org (/competitions/WC/matches)
// vers les lignes d'upsert de la table `matches`. Aucune I/O, aucun
// `server-only` : testable avec des objets simples. Le statut API est mappé sur
// l'enum `match_status` (vocabulaire simplifié) au moment de l'ingestion.

import type { MatchStatus } from "@/lib/types";

/** Équipe telle que renvoyée par l'API (champs utiles ; nullable en phase KO). */
export type FdTeam = { name: string | null; crest: string | null };

/** Sous-ensemble d'un match API utile à l'ingestion (fixtures + statut/score). */
export type FdFixture = {
  id: number;
  utcDate: string;
  status: string;
  stage?: string | null;
  group?: string | null;
  homeTeam?: FdTeam | null;
  awayTeam?: FdTeam | null;
  score?: { fullTime?: { home: number | null; away: number | null } };
};

export type WorldCupMatchesResponse = { matches: FdFixture[] };

/** Ligne destinée à l'upsert dans `public.matches` (colonnes snake_case). */
export type MatchUpsertRow = {
  football_data_id: number;
  home_team: string;
  away_team: string;
  home_crest_url: string | null;
  away_crest_url: string | null;
  stage: string | null;
  kickoff_at: string;
  status: MatchStatus;
};

/** Mappe le vocabulaire football-data.org sur l'enum interne `match_status`. */
export function mapStatus(apiStatus: string): MatchStatus {
  switch (apiStatus) {
    case "SCHEDULED":
    case "TIMED":
      return "scheduled";
    case "IN_PLAY":
    case "PAUSED":
    case "SUSPENDED":
      return "live";
    case "FINISHED":
      return "finished";
    case "POSTPONED":
      return "postponed";
    case "CANCELLED":
    default:
      return "cancelled";
  }
}

/** Libellé d'affichage de la phase. Groupe prioritaire, sinon phase finale. */
export function formatStage(
  stage: string | null,
  group: string | null,
): string | null {
  if (group) {
    return `Groupe ${group.replace(/^GROUP_/, "")}`;
  }
  switch (stage) {
    case "LAST_16":
      return "8es de finale";
    case "QUARTER_FINALS":
      return "Quarts de finale";
    case "SEMI_FINALS":
      return "Demi-finales";
    case "THIRD_PLACE":
      return "Petite finale";
    case "FINAL":
      return "Finale";
    default:
      return null;
  }
}

/** Transforme la réponse API en lignes d'upsert (équipes/crests/stage/statut). */
export function parseMatchesForUpsert(
  res: WorldCupMatchesResponse,
): MatchUpsertRow[] {
  return res.matches.map((m) => ({
    football_data_id: m.id,
    home_team: m.homeTeam?.name ?? "À déterminer",
    away_team: m.awayTeam?.name ?? "À déterminer",
    home_crest_url: m.homeTeam?.crest ?? null,
    away_crest_url: m.awayTeam?.crest ?? null,
    stage: formatStage(m.stage ?? null, m.group ?? null),
    kickoff_at: m.utcDate,
    status: mapStatus(m.status),
  }));
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/match-sync.test.ts`
Expected: PASS (tous les cas verts).

- [ ] **Step 5: Vérifs + commit**

Run: `npm run typecheck && npm run lint`
Expected: vert.

```bash
git add src/lib/match-sync.ts tests/match-sync.test.ts
git commit -m "feat(matches): module pur match-sync (parse/mapping fixtures CM)"
```

---

## Task 2: Type de retour enrichi dans `football-data.ts`

**Files:**
- Modify: `src/lib/football-data.ts`

Le fetch existant lit le même endpoint et renvoie déjà tout le JSON ; on élargit
seulement le **type** de retour pour exposer les champs fixture à la route
d'ingestion. `parseFinishedMatches` (sync-results) continue de fonctionner car
`WorldCupMatchesResponse` est structurellement assignable à `FootballDataResponse`.

- [ ] **Step 1: Mettre à jour le type de retour**

Dans `src/lib/football-data.ts`, ajouter l'import et changer la signature + le cast :

```ts
import { ThrottledError, type FootballDataResponse } from "@/lib/sync";
import type { WorldCupMatchesResponse } from "@/lib/match-sync";
```

Changer la signature de la fonction :

```ts
export async function fetchWorldCupMatches(): Promise<WorldCupMatchesResponse> {
```

et le `return` final :

```ts
  return (await res.json()) as WorldCupMatchesResponse;
```

(`FootballDataResponse` reste importé : il sert au typage côté `sync.ts`/route
sync-results, inchangé. Si l'import devient inutilisé après build, le garder
n'est pas une erreur ; sinon supprimer l'import `FootballDataResponse`.)

- [ ] **Step 2: Vérifier que sync-results compile toujours**

Run: `npm run typecheck`
Expected: vert. (`parseFinishedMatches(await fetchWorldCupMatches())` reste
valide : le type riche contient `id`/`status`/`score`.)

Si `FootballDataResponse` est signalé comme import inutilisé par le lint :

```ts
import { ThrottledError } from "@/lib/sync";
```

- [ ] **Step 3: Vérifs + commit**

Run: `npm run lint && npm test`
Expected: vert (75 + nouveaux tests Task 1).

```bash
git add src/lib/football-data.ts
git commit -m "feat(matches): fetchWorldCupMatches renvoie le type fixture enrichi"
```

---

## Task 3: Migrations `upsert_matches` + suppression seed, puis regen des types

**Files:**
- Create: `supabase/migrations/0009_upsert_matches.sql`
- Create: `supabase/migrations/0010_remove_dev_seed_matches.sql`
- Modify: `src/lib/database.types.ts` (régénéré)

> **Pré-requis** : Supabase CLI lié au projet (`npx supabase link` déjà fait, cf.
> `docs/deploy.md`). Cette tâche applique les migrations à la base liée et
> régénère les types — nécessite l'accès DB (clé service_role / lien Supabase).

- [ ] **Step 1: Créer `supabase/migrations/0009_upsert_matches.sql`**

```sql
-- supabase/migrations/0009_upsert_matches.sql
-- Upsert idempotent des fixtures (ingestion depuis football-data.org).
-- Met à jour UNIQUEMENT les champs fixture (équipes, crests, stage, kickoff,
-- statut) — ne touche JAMAIS home_score/away_score. Le statut 'finished' est
-- collant : un match déjà scoré n'est pas ramené en arrière par une réingestion.
-- Écriture server-only (service_role), comme score_match.

create or replace function public.upsert_matches(p_matches jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  with rows as (
    select * from jsonb_to_recordset(p_matches) as r(
      football_data_id integer,
      home_team        text,
      away_team        text,
      home_crest_url   text,
      away_crest_url   text,
      stage            text,
      kickoff_at       timestamptz,
      status           public.match_status
    )
  ),
  upserted as (
    insert into public.matches as m
      (football_data_id, home_team, away_team, home_crest_url, away_crest_url,
       stage, kickoff_at, status)
    select football_data_id, home_team, away_team, home_crest_url, away_crest_url,
           stage, kickoff_at, status
      from rows
    on conflict (football_data_id) do update set
      home_team      = excluded.home_team,
      away_team      = excluded.away_team,
      home_crest_url = excluded.home_crest_url,
      away_crest_url = excluded.away_crest_url,
      stage          = excluded.stage,
      kickoff_at     = excluded.kickoff_at,
      status         = case
                         when m.status = 'finished' then m.status
                         else excluded.status
                       end
    returning 1
  )
  select count(*)::integer into v_count from upserted;

  return jsonb_build_object('upserted', v_count);
end;
$$;

revoke all on function public.upsert_matches(jsonb) from public;
grant execute on function public.upsert_matches(jsonb) to service_role;
```

- [ ] **Step 2: Créer `supabase/migrations/0010_remove_dev_seed_matches.sql`**

```sql
-- supabase/migrations/0010_remove_dev_seed_matches.sql
-- Retire les fixtures de dev factices (0008_seed_matches.sql, ids 900001–900007)
-- maintenant que l'ingestion réelle (cron sync-matches) insère les vrais matchs.
-- Cascade sur d'éventuels bets de dev posés dessus (bets.match_id on delete cascade).

delete from public.matches
 where football_data_id between 900001 and 900007;
```

- [ ] **Step 3: Appliquer les migrations à la base liée**

Run: `npx supabase db push`
Expected: les migrations 0009 et 0010 s'appliquent sans erreur.

- [ ] **Step 4: Régénérer les types TypeScript**

Run: `npx supabase gen types typescript --linked > src/lib/database.types.ts`
Expected: `src/lib/database.types.ts` régénéré, contient désormais la fonction
`upsert_matches` dans la map `Functions` (et toujours `score_match`).

- [ ] **Step 5: Vérifs + commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: vert.

```bash
git add supabase/migrations/0009_upsert_matches.sql supabase/migrations/0010_remove_dev_seed_matches.sql src/lib/database.types.ts
git commit -m "feat(db): upsert_matches RPC + suppression seed dev + regen types"
```

---

## Task 4: Route cron d'ingestion `/api/cron/sync-matches`

**Files:**
- Create: `src/app/api/cron/sync-matches/route.ts`

- [ ] **Step 1: Créer la route**

```ts
// src/app/api/cron/sync-matches/route.ts
// Ingestion des fixtures CM depuis football-data.org vers la table `matches`.
// Pattern identique à sync-results : auth CRON_SECRET d'abord, I/O server-only,
// écriture atomique via la fonction Postgres upsert_matches.

import { fetchWorldCupMatches } from "@/lib/football-data";
import { parseMatchesForUpsert } from "@/lib/match-sync";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ThrottledError } from "@/lib/sync";

export const dynamic = "force-dynamic"; // never cache

export async function GET(req: Request) {
  // 1. Auth — checked first.
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Fetch (one global request per tick), tolérant au throttling.
  let res;
  try {
    res = await fetchWorldCupMatches();
  } catch (err) {
    if (err instanceof ThrottledError) {
      return Response.json({ ok: true, throttled: true });
    }
    throw err;
  }

  // 3. Parse pur → upsert atomique.
  const rows = parseMatchesForUpsert(res);
  const { data, error } = await supabaseAdmin.rpc("upsert_matches", {
    p_matches: rows,
  });
  if (error) throw error;

  return Response.json({ ok: true, ...(data as object) });
}
```

- [ ] **Step 2: Vérifier le typage du RPC**

Run: `npm run typecheck`
Expected: vert (`upsert_matches` est connu depuis la regen Task 3).

- [ ] **Step 3: Vérifs + build + commit**

Run: `npm run lint && npm run build`
Expected: vert ; la route `/api/cron/sync-matches` apparaît dans la liste des
routes du build.

```bash
git add src/app/api/cron/sync-matches/route.ts
git commit -m "feat(matches): endpoint cron sync-matches (ingestion CM, CRON_SECRET)"
```

---

## Task 5: Cron Vercel quotidien

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Ajouter le cron `sync-matches`**

Remplacer le contenu de `vercel.json` par :

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/sync-results",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/sync-matches",
      "schedule": "0 4 * * *"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore(cron): planifier sync-matches une fois par jour"
```

---

## Task 6: Affichage des crests sur `/matches`

**Files:**
- Modify: `src/components/match-row.tsx`

Les colonnes `home_crest_url` / `away_crest_url` existent déjà sur le type
`Match` (schéma 0003). On ajoute juste l'écusson à côté de chaque nom d'équipe.

- [ ] **Step 1: Ajouter les écussons**

Dans `src/components/match-row.tsx`, remplacer les deux `<span>` des équipes :

```tsx
      <span className="flex flex-1 items-center justify-end gap-2 font-medium">
        <span className="truncate">{match.home_team}</span>
        {match.home_crest_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={match.home_crest_url}
            alt=""
            className="h-5 w-5 shrink-0 rounded-full object-contain ring-1 ring-white/15"
          />
        )}
      </span>

      <span className="w-14 shrink-0 text-center font-bold tabular-nums">
        {isFinished && hasScore
          ? `${match.home_score} - ${match.away_score}`
          : "–"}
      </span>

      <span className="flex flex-1 items-center gap-2 font-medium">
        {match.away_crest_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={match.away_crest_url}
            alt=""
            className="h-5 w-5 shrink-0 rounded-full object-contain ring-1 ring-white/15"
          />
        )}
        <span className="truncate">{match.away_team}</span>
      </span>
```

(La cellule de score `w-14` au milieu reste identique ; seules les deux cellules
équipes gagnent l'écusson. `truncate` évite tout débordement avec l'image.)

- [ ] **Step 2: Vérifs + build + commit**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: vert (75 + tests match-sync).

```bash
git add src/components/match-row.tsx
git commit -m "feat(ui): écussons d'équipe sur la liste des matchs"
```

---

## Task 7: Script dev de simulation de scoring

**Files:**
- Create: `scripts/simulate-score.ts`
- Modify: `package.json`

- [ ] **Step 1: Installer `tsx` (devDependency) si absent**

Run: `npm ls tsx || npm install -D tsx`
Expected: `tsx` présent dans `devDependencies`.

- [ ] **Step 2: Créer `scripts/simulate-score.ts`**

```ts
// scripts/simulate-score.ts
// OUTIL DEV — jamais importé par l'app. Simule l'attribution de points sur un
// match en appelant le VRAI RPC Postgres score_match (persistance + idempotence
// réelles). Réutilise scoreBets (logique de points centralisée, AGENTS.md §7).
//
// Crée son PROPRE client service_role (n'importe PAS @/lib/supabase/server, qui
// charge `server-only` et lèverait hors runtime Next). N'importe que de la
// logique pure (scoreBets) + les types. Path alias @ résolus par tsx (tsconfig).
//
// Usage : npm run simulate-score -- <footballDataId> <home> <away>
//   ex.  npm run simulate-score -- 537327 2 1

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { scoreBets, type BetRow } from "@/lib/sync";

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const [fdArg, homeArg, awayArg] = process.argv.slice(2);
  const fdId = Number(fdArg);
  const home = Number(homeArg);
  const away = Number(awayArg);

  if (![fdId, home, away].every(Number.isInteger)) {
    console.error(
      "Usage: npm run simulate-score -- <footballDataId> <home> <away>",
    );
    process.exit(1);
  }

  // 1. Retrouver le match par son id football-data.
  const { data: match, error: mErr } = await supabaseAdmin
    .from("matches")
    .select("id, home_team, away_team")
    .eq("football_data_id", fdId)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!match) {
    console.error(`Match football_data_id=${fdId} introuvable.`);
    process.exit(1);
  }

  // 2. Charger les paris non encore scorés (même requête que le cron réel).
  const { data: bets, error: bErr } = await supabaseAdmin
    .from("bets")
    .select("id, user_id, home_score, away_score")
    .eq("match_id", match.id)
    .is("points_awarded", null);
  if (bErr) throw bErr;

  // 3. Calculer les points (logique centralisée) puis appeler le vrai RPC.
  const scored = scoreBets((bets ?? []) as BetRow[], {
    homeScore: home,
    awayScore: away,
  });
  const { data, error } = await supabaseAdmin.rpc("score_match", {
    p_fd_id: fdId,
    p_home: home,
    p_away: away,
    p_scored: scored.map((s) => ({ bet_id: s.betId, points: s.points })),
  });
  if (error) throw error;

  console.log(`Match : ${match.home_team} – ${match.away_team} → ${home}-${away}`);
  console.log(`Paris à scorer : ${scored.length}`);
  console.table(scored);
  console.log("Résultat score_match :", data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Ajouter le script npm**

Dans `package.json`, ajouter dans `"scripts"` :

```json
    "simulate-score": "node --env-file=.env.local --import tsx scripts/simulate-score.ts",
```

(`--env-file=.env.local` charge `SUPABASE_SERVICE_ROLE_KEY` & co ; `--import tsx`
exécute le TypeScript directement. Node ≥ 20.6 requis — la machine a v20.19.)

- [ ] **Step 4: Vérifier que le script se charge (sans muter la DB)**

Run: `npm run simulate-score`
Expected: affiche l'usage et sort en code 1 (aucun argument → aucune écriture DB).

- [ ] **Step 5: Vérifs + commit**

Run: `npm run typecheck && npm run lint`
Expected: vert.

```bash
git add scripts/simulate-score.ts package.json package-lock.json
git commit -m "feat(dev): script simulate-score (vrai RPC score_match)"
```

---

## Task 8: Validation end-to-end + suite verte + handoff

**Files:**
- Modify: `docs/handoff.md`

- [ ] **Step 1: Vérification automatique complète**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: **tout vert** (75 tests existants + tests match-sync).

- [ ] **Step 2: Ingestion réelle (manuel, local)**

Terminal A : `npm run dev`
Terminal B (remplacer `<SECRET>` par la valeur de `CRON_SECRET` dans `.env.local`) :

```bash
curl -s -H "Authorization: Bearer <SECRET>" \
  http://localhost:3000/api/cron/sync-matches
```

Expected : `{"ok":true,"upserted":104}` (ou nombre courant de fixtures CM).
Ouvrir `http://localhost:3000/matches` : les vrais matchs CM 2026 s'affichent,
avec les écussons des équipes, groupés par jour. Le seed factice (France–Croatie
etc.) a disparu (Task 3).

Vérifier aussi le rejet sans secret :

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/sync-matches
```

Expected : `401`.

- [ ] **Step 3: Simulation de scoring (manuel, local)**

1. Se connecter via 42 sur `http://localhost:3000`.
2. Sur `/matches`, parier sur 1–2 matchs à venir (noter un `football_data_id`
   ciblé — visible via l'API, ou choisir un match et récupérer son id en base).
3. Lancer la simulation avec un résultat choisi :

```bash
npm run simulate-score -- <footballDataId> 2 1
```

Expected : `Paris à scorer : N` puis `Résultat score_match : { scored: N }`.
Vérifier `/leaderboard` et `/profile/<login>` : les points correspondent à
`calcBetPoints` (3 si score exact, 1 si bon vainqueur/nul, 0 sinon).

- [ ] **Step 4: Vérifier l'idempotence**

Relancer exactement la même commande :

```bash
npm run simulate-score -- <footballDataId> 2 1
```

Expected : `Résultat score_match : { scored: 0 }` — aucun double comptage, les
totaux du classement sont inchangés.

- [ ] **Step 5: Mettre à jour le handoff**

Dans `docs/handoff.md`, ajouter une section « Pipeline matchs — livré » résumant :
ingestion via `/api/cron/sync-matches` (cron quotidien), seed factice retiré,
crests affichés, et l'outil `npm run simulate-score` pour tester le scoring.
Mentionner que **Feature B (coalitions / photos)** reste à faire (spec séparé) et
que le déploiement Vercel (2 crons + env vars) est l'étape suivante.

```bash
git add docs/handoff.md
git commit -m "docs: pipeline matchs livré (ingestion CM + simulate-score)"
```

---

## Notes de fin

- **Merge** : phase pré-déploiement (AGENTS.md §8) — branche `feat/match-pipeline`,
  self-review du diff, vérifs vertes, `git merge --no-ff` dans `main` en local.
- **Dépendance externe** : Task 3 nécessite la base Supabase liée (push migrations
  + regen types). Sans accès DB, s'arrêter et demander à l'utilisateur de lancer
  `npx supabase db push` + la regen.
- **Hors périmètre** : Feature B (coalitions). Pas de modif de `sync-results` ni
  de `points.ts`/`score_match` (logique déjà testée).
- **Quota API** : football-data.org gratuit = 10 req/min ; le cron sync-matches
  ne fait qu'une requête par tick (1×/jour), sans risque.
```
