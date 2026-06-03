# Sync-Results Cron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the idempotent Vercel cron `/api/cron/sync-results` that pulls finished World Cup match scores from football-data.org, scores the related bets, and updates player totals — atomically and within the API rate limit.

**Architecture:** Dependency-injection orchestrator. Pure logic (`parseFinishedMatches`, `scoreBets`, `runSync`) lives in `src/lib/sync.ts` and is tested with plain fakes — zero mocking of Supabase or `fetch`. The route handler is a thin adapter that wires real Supabase + football-data I/O into `runSync`. Points are computed in TS (`calcBetPoints`, rule #7) and persisted atomically by a Postgres function `score_match` (a single transaction with an idempotency guard in SQL).

**Tech Stack:** Next.js 16 App Router route handler, Supabase JS (`service_role` via `supabaseAdmin`), Postgres plpgsql function, Vitest 4, TypeScript strict.

**Reference:** spec `docs/superpowers/specs/2026-06-03-sync-results-design.md`; skill `skills/football-data-sync/SKILL.md`.

---

## File Structure

- **Create** `vitest.config.ts` — register the `@/` → `src/` alias so tests can import source that uses `@/...` and `vi.mock("@/...")` resolves.
- **Create** `src/lib/sync.ts` — pure helpers + `runSync` orchestrator + shared types + `ThrottledError`. No I/O, no `server-only`.
- **Create** `tests/sync.test.ts` — unit tests for `parseFinishedMatches`, `scoreBets`, `runSync`.
- **Create** `supabase/migrations/0006_score_match.sql` — atomic `score_match` Postgres function.
- **Modify** `src/lib/database.types.ts` — regenerated after the migration so `rpc("score_match")` is typed.
- **Create** `src/lib/football-data.ts` — `server-only` fetch wrapper, throws `ThrottledError` on 429.
- **Create** `src/app/api/cron/sync-results/route.ts` — thin adapter: auth → build deps → `runSync` → JSON.
- **Create** `tests/sync-results-route.test.ts` — 401-auth test (security-critical path).

Already in place (do not recreate): `vercel.json` cron entry, `CRON_SECRET` + `FOOTBALL_DATA_API_KEY` in `.env.local.example`, `src/lib/points.ts`, `src/lib/supabase/server.ts` (`supabaseAdmin`), `src/lib/env.ts`.

---

### Task 1: Vitest `@/` alias config

Existing source uses `@/...` imports; the route test must `vi.mock("@/lib/...")`. Vitest needs the alias to resolve those specifiers. Mirrors `tsconfig.json` (`"@/*": ["./src/*"]`).

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create the config**

```ts
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 2: Verify existing tests still pass (no regression)**

Run: `npm test`
Expected: PASS — `tests/points.test.ts` (8) and `tests/env.test.ts` (4) all green.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "test: add vitest config with @/ path alias"
```

---

### Task 2: `parseFinishedMatches` (pure)

Maps the football-data response to the minimal finished-match shape. Filters to `status === "FINISHED"` and reads `score.fullTime` (90' score, per `matches` schema). Defensive: a FINISHED match without usable `fullTime` numbers is skipped.

**Files:**
- Create: `src/lib/sync.ts`
- Test: `tests/sync.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test, vi } from "vitest";

import {
  parseFinishedMatches,
  scoreBets,
  runSync,
  ThrottledError,
  type BetRow,
  type FinishedMatch,
  type FootballDataResponse,
  type SyncDeps,
} from "../src/lib/sync";

describe("parseFinishedMatches", () => {
  test("keeps only FINISHED matches and maps fullTime scores", () => {
    const res: FootballDataResponse = {
      matches: [
        { id: 1, status: "FINISHED", score: { fullTime: { home: 2, away: 1 } } },
        { id: 2, status: "IN_PLAY", score: { fullTime: { home: 0, away: 0 } } },
        { id: 3, status: "TIMED", score: { fullTime: { home: null, away: null } } },
        { id: 4, status: "FINISHED", score: { fullTime: { home: 0, away: 0 } } },
      ],
    };
    expect(parseFinishedMatches(res)).toEqual([
      { footballDataId: 1, homeScore: 2, awayScore: 1 },
      { footballDataId: 4, homeScore: 0, awayScore: 0 },
    ]);
  });

  test("skips FINISHED matches without usable fullTime numbers", () => {
    const res: FootballDataResponse = {
      matches: [
        { id: 5, status: "FINISHED", score: { fullTime: { home: null, away: 2 } } },
        { id: 6, status: "FINISHED" },
      ],
    };
    expect(parseFinishedMatches(res)).toEqual([]);
  });

  test("returns empty array when there are no matches", () => {
    expect(parseFinishedMatches({ matches: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sync`
Expected: FAIL — cannot resolve `../src/lib/sync` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/sync.ts` with the types and the first function:

```ts
// src/lib/sync.ts
// Pure orchestration for the result-sync cron. No I/O, no `server-only` import:
// every external effect is injected via `SyncDeps`, so this whole module is
// unit-testable with plain fakes. Points are computed here (rule #7) and
// persisted atomically by the Postgres `score_match` function.

import { calcBetPoints } from "@/lib/points";

/** Minimal subset of the football-data.org `/competitions/WC/matches` payload. */
export type FootballDataMatch = {
  id: number;
  status: string;
  score?: { fullTime?: { home: number | null; away: number | null } };
};
export type FootballDataResponse = { matches: FootballDataMatch[] };

/** A finished match reduced to what we persist (90' score). */
export type FinishedMatch = {
  footballDataId: number;
  homeScore: number;
  awayScore: number;
};

export function parseFinishedMatches(res: FootballDataResponse): FinishedMatch[] {
  const out: FinishedMatch[] = [];
  for (const m of res.matches) {
    if (m.status !== "FINISHED") continue;
    const home = m.score?.fullTime?.home;
    const away = m.score?.fullTime?.away;
    if (typeof home !== "number" || typeof away !== "number") continue;
    out.push({ footballDataId: m.id, homeScore: home, awayScore: away });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify the `parseFinishedMatches` block passes**

Run: `npm test -- sync`
Expected: the `parseFinishedMatches` tests PASS. (`scoreBets`/`runSync` tests are written in later tasks; if you wrote the whole test file already, those will fail until Tasks 3–4 — that is expected.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.ts tests/sync.test.ts
git commit -m "feat(sync): parse finished matches from football-data payload"
```

---

### Task 3: `scoreBets` (pure)

Turns the unscored bets of one match into a persistable payload, delegating to `calcBetPoints` (never reimplementing the rule). Input bet rows are snake_case (generated DB types); output is the minimal `{ betId, points }` the `score_match` function consumes — the owner (`user_id`) is derived in SQL from the bet row, so it is not in the payload.

**Files:**
- Modify: `src/lib/sync.ts`
- Test: `tests/sync.test.ts`

- [ ] **Step 1: Add the failing test (append to `tests/sync.test.ts`)**

```ts
describe("scoreBets", () => {
  const bets: BetRow[] = [
    { id: "b1", user_id: "u1", home_score: 2, away_score: 1 }, // exact -> 3
    { id: "b2", user_id: "u2", home_score: 1, away_score: 0 }, // right winner -> 1
    { id: "b3", user_id: "u3", home_score: 0, away_score: 2 }, // wrong -> 0
  ];

  test("maps each bet to {betId, points} via calcBetPoints", () => {
    expect(scoreBets(bets, { homeScore: 2, awayScore: 1 })).toEqual([
      { betId: "b1", points: 3 },
      { betId: "b2", points: 1 },
      { betId: "b3", points: 0 },
    ]);
  });

  test("returns empty array when there are no bets", () => {
    expect(scoreBets([], { homeScore: 1, awayScore: 1 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sync`
Expected: FAIL — `scoreBets` / `BetRow` not exported.

- [ ] **Step 3: Implement (append to `src/lib/sync.ts`)**

```ts
/** A bet row as selected from the DB (generated types are snake_case). */
export type BetRow = {
  id: string;
  user_id: string;
  home_score: number;
  away_score: number;
};

/** Payload element persisted by the `score_match` Postgres function. */
export type ScoredBet = { betId: string; points: 0 | 1 | 3 };

export function scoreBets(
  bets: BetRow[],
  result: { homeScore: number; awayScore: number },
): ScoredBet[] {
  return bets.map((b) => ({
    betId: b.id,
    points: calcBetPoints(
      { homeScore: b.home_score, awayScore: b.away_score },
      result,
    ),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- sync`
Expected: `parseFinishedMatches` + `scoreBets` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.ts tests/sync.test.ts
git commit -m "feat(sync): score a match's bets via calcBetPoints"
```

---

### Task 4: `runSync` orchestrator (pure, DI)

The heart of the brick. Drives gate → fetch → per-match scoring through injected `SyncDeps`, so it is fully testable with fakes. Encodes: the gate skip, the throttle short-circuit, the per-match idempotency skip, the "match not in our calendar" skip, and per-match error isolation.

**Files:**
- Modify: `src/lib/sync.ts`
- Test: `tests/sync.test.ts`

- [ ] **Step 1: Add the failing tests (append to `tests/sync.test.ts`)**

```ts
describe("runSync", () => {
  // A finished match the API reports, plus its DB state + bets.
  const apiFinished: FinishedMatch[] = [
    { footballDataId: 100, homeScore: 2, awayScore: 1 },
  ];

  function baseDeps(over: Partial<SyncDeps> = {}): SyncDeps {
    return {
      hasMatchInResultWindow: vi.fn(async () => true),
      fetchFinished: vi.fn(async () => apiFinished),
      loadMatchWithUnscoredBets: vi.fn(async () => ({
        matchId: "m1",
        status: "scheduled",
        homeScore: null,
        awayScore: null,
        bets: [{ id: "b1", user_id: "u1", home_score: 2, away_score: 1 }] as BetRow[],
      })),
      persistScore: vi.fn(async () => {}),
      ...over,
    };
  }

  test("skips entirely (no network) when no match is in the result window", async () => {
    const deps = baseDeps({ hasMatchInResultWindow: vi.fn(async () => false) });
    const summary = await runSync(deps);
    expect(summary).toEqual({ skipped: true, throttled: false, processed: 0, scored: 0, errors: 0 });
    expect(deps.fetchFinished).not.toHaveBeenCalled();
  });

  test("returns throttled when fetch throws ThrottledError", async () => {
    const deps = baseDeps({
      fetchFinished: vi.fn(async () => {
        throw new ThrottledError("rate limit");
      }),
    });
    const summary = await runSync(deps);
    expect(summary.throttled).toBe(true);
    expect(deps.persistScore).not.toHaveBeenCalled();
  });

  test("scores a finished match and counts processed + scored bets", async () => {
    const deps = baseDeps();
    const summary = await runSync(deps);
    expect(deps.persistScore).toHaveBeenCalledWith(100, 2, 1, [{ betId: "b1", points: 3 }]);
    expect(summary).toMatchObject({ skipped: false, throttled: false, processed: 1, scored: 1, errors: 0 });
  });

  test("idempotent: skips a match already finished with the same score and no unscored bets", async () => {
    const deps = baseDeps({
      loadMatchWithUnscoredBets: vi.fn(async () => ({
        matchId: "m1",
        status: "finished",
        homeScore: 2,
        awayScore: 1,
        bets: [],
      })),
    });
    const summary = await runSync(deps);
    expect(deps.persistScore).not.toHaveBeenCalled();
    expect(summary.processed).toBe(0);
  });

  test("skips matches not in our calendar (loadMatch returns null)", async () => {
    const deps = baseDeps({ loadMatchWithUnscoredBets: vi.fn(async () => null) });
    const summary = await runSync(deps);
    expect(deps.persistScore).not.toHaveBeenCalled();
    expect(summary.processed).toBe(0);
  });

  test("isolates a per-match failure: counts an error, keeps going", async () => {
    const deps = baseDeps({
      fetchFinished: vi.fn(async () => [
        { footballDataId: 100, homeScore: 2, awayScore: 1 },
        { footballDataId: 200, homeScore: 0, awayScore: 0 },
      ]),
      persistScore: vi.fn(async (fdId: number) => {
        if (fdId === 100) throw new Error("db down");
      }),
    });
    const summary = await runSync(deps);
    expect(summary.errors).toBe(1);
    expect(summary.processed).toBe(1); // the second match still scored
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sync`
Expected: FAIL — `runSync`, `ThrottledError`, `SyncDeps` not exported.

- [ ] **Step 3: Implement (append to `src/lib/sync.ts`)**

```ts
/** Thrown by the football-data fetch layer when the API rate limit is hit. */
export class ThrottledError extends Error {}

/** Match state + its not-yet-scored bets, as loaded from the DB. */
export type LoadedMatch = {
  matchId: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  bets: BetRow[];
};

/** Injected I/O. The route supplies real Supabase / football-data adapters. */
export type SyncDeps = {
  hasMatchInResultWindow: () => Promise<boolean>;
  fetchFinished: () => Promise<FinishedMatch[]>;
  loadMatchWithUnscoredBets: (footballDataId: number) => Promise<LoadedMatch | null>;
  persistScore: (
    footballDataId: number,
    homeScore: number,
    awayScore: number,
    scored: ScoredBet[],
  ) => Promise<void>;
};

export type SyncSummary = {
  skipped: boolean;
  throttled: boolean;
  processed: number;
  scored: number;
  errors: number;
};

export async function runSync(deps: SyncDeps): Promise<SyncSummary> {
  const summary: SyncSummary = {
    skipped: false,
    throttled: false,
    processed: 0,
    scored: 0,
    errors: 0,
  };

  // Gate: never touch the network unless a match can be finishing.
  if (!(await deps.hasMatchInResultWindow())) {
    summary.skipped = true;
    return summary;
  }

  let finished: FinishedMatch[];
  try {
    finished = await deps.fetchFinished();
  } catch (err) {
    if (err instanceof ThrottledError) {
      summary.throttled = true;
      return summary;
    }
    throw err;
  }

  for (const fm of finished) {
    try {
      const match = await deps.loadMatchWithUnscoredBets(fm.footballDataId);
      if (!match) continue; // not part of our calendar

      const scored = scoreBets(match.bets, {
        homeScore: fm.homeScore,
        awayScore: fm.awayScore,
      });

      const alreadyDone =
        match.status === "finished" &&
        match.homeScore === fm.homeScore &&
        match.awayScore === fm.awayScore &&
        scored.length === 0;
      if (alreadyDone) continue; // idempotent no-op

      await deps.persistScore(fm.footballDataId, fm.homeScore, fm.awayScore, scored);
      summary.processed += 1;
      summary.scored += scored.length;
    } catch (err) {
      summary.errors += 1;
      console.error(`sync: failed to score match ${fm.footballDataId}`, err);
    }
  }

  return summary;
}
```

- [ ] **Step 4: Run the full sync suite**

Run: `npm test -- sync`
Expected: PASS — all `parseFinishedMatches`, `scoreBets`, and `runSync` tests green.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync.ts tests/sync.test.ts
git commit -m "feat(sync): runSync orchestrator with idempotency and error isolation"
```

---

### Task 5: `score_match` Postgres function (atomic persistence)

A single-transaction plpgsql function: update the match, apply points to **only** the still-unscored bets (`points_awarded IS NULL` — the SQL idempotency guard), and bump each owner's `total_points` by the sum of just-applied points. Replaying the cron never double-counts. Points are passed in (computed by `calcBetPoints`); SQL never computes them.

**Files:**
- Create: `supabase/migrations/0006_score_match.sql`
- Modify: `src/lib/database.types.ts` (regenerated)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0006_score_match.sql
-- Atomic result-scoring for one match. Points are computed in TS (calcBetPoints,
-- AGENTS.md rule #7) and passed in via p_scored = [{ "bet_id": uuid, "points": int }].
-- This function only PERSISTS them — it never recomputes the scoring rule.
-- Idempotent: only bets with points_awarded IS NULL are updated, and only those
-- owners' totals are incremented, so re-running the cron never double-counts.

create or replace function public.score_match(
  p_fd_id  integer,
  p_home   integer,
  p_away   integer,
  p_scored jsonb
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_match_id      uuid;
  v_scored_count  integer := 0;
begin
  -- 1. Update the match result (90' score) and mark it finished.
  update public.matches
     set home_score = p_home,
         away_score = p_away,
         status     = 'finished'
   where football_data_id = p_fd_id
  returning id into v_match_id;

  if v_match_id is null then
    return jsonb_build_object('scored', 0, 'note', 'match not found');
  end if;

  -- 2. Apply points to not-yet-scored bets of THIS match (idempotency guard),
  --    then bump each owner's denormalised total by the sum just applied.
  with applied as (
    update public.bets b
       set points_awarded = s.points
      from jsonb_to_recordset(p_scored) as s(bet_id uuid, points integer)
     where b.id = s.bet_id
       and b.match_id = v_match_id
       and b.points_awarded is null
    returning b.user_id, s.points
  ),
  bumped as (
    update public.users u
       set total_points = u.total_points + agg.pts
      from (select user_id, sum(points) as pts from applied group by user_id) agg
     where u.id = agg.user_id
    returning 1
  )
  select count(*)::integer into v_scored_count from applied;

  return jsonb_build_object('scored', v_scored_count);
end;
$$;

-- The cron calls this with the service_role key only.
revoke all on function public.score_match(integer, integer, integer, jsonb) from public;
grant execute on function public.score_match(integer, integer, integer, jsonb) to service_role;
```

- [ ] **Step 2: Apply the migration to the linked project**

Run: `npx supabase db push`
Expected: migration `0006_score_match` applied with no error. (If the CLI is not linked/authenticated, run `npx supabase link` first — see prior session notes.)

- [ ] **Step 3: Manually verify idempotency (the critical property)**

In the Supabase SQL editor or `psql`, with a throwaway scheduled match + one bet:

```sql
-- setup
insert into public.users (ft_id, login) values (999001, 'sync_test_user')
  returning id; -- note <user_id>, total_points starts at 0
insert into public.matches (football_data_id, home_team, away_team, kickoff_at)
  values (999001, 'A', 'B', now() - interval '3 hours') returning id; -- <match_id>
insert into public.bets (user_id, match_id, home_score, away_score)
  values ('<user_id>', '<match_id>', 2, 1); -- exact prediction -> 3 pts
select public.bets.id from public.bets where match_id = '<match_id>'; -- <bet_id>

-- score it (exact -> 3)
select public.score_match(999001, 2, 1, '[{"bet_id":"<bet_id>","points":3}]'::jsonb);
-- expect {"scored": 1}
select total_points from public.users where id = '<user_id>'; -- expect 3
select points_awarded, status from public.bets join public.matches ... -- bet=3, match finished

-- REPLAY (idempotency): same call again
select public.score_match(999001, 2, 1, '[{"bet_id":"<bet_id>","points":3}]'::jsonb);
-- expect {"scored": 0}
select total_points from public.users where id = '<user_id>'; -- STILL 3 (no double count)

-- cleanup
delete from public.bets where match_id = '<match_id>';
delete from public.matches where football_data_id = 999001;
delete from public.users where ft_id = 999001;
```

Expected: first call `{"scored":1}` and total becomes 3; replay `{"scored":0}` and total stays 3.

- [ ] **Step 4: Regenerate the typed DB client**

Run: `npx supabase gen types typescript --linked > src/lib/database.types.ts`
Expected: file now includes a `Functions.score_match` entry (so `supabaseAdmin.rpc("score_match", …)` typechecks in Task 7).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (the regenerated types are well-formed).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0006_score_match.sql src/lib/database.types.ts
git commit -m "feat(db): add atomic score_match function (migration 0006)"
```

---

### Task 6: football-data.org fetch wrapper

`server-only` wrapper around the single global `GET /competitions/WC/matches`. Honours throttling (skill rule #3): on HTTP 429 it logs the remaining-reserve header and throws `ThrottledError` (caught by `runSync`). Never logs the API key.

**Files:**
- Create: `src/lib/football-data.ts`

- [ ] **Step 1: Implement**

```ts
// src/lib/football-data.ts
import "server-only";

import { requireEnv } from "@/lib/env";
import { ThrottledError, type FootballDataResponse } from "@/lib/sync";

// World Cup competition code is `WC`. One global call per cron tick (never a
// per-match loop — skill football-data-sync rule #3 / anti-patterns).
const WC_MATCHES_URL = "https://api.football-data.org/v4/competitions/WC/matches";

export async function fetchWorldCupMatches(): Promise<FootballDataResponse> {
  const res = await fetch(WC_MATCHES_URL, {
    headers: { "X-Auth-Token": requireEnv("FOOTBALL_DATA_API_KEY") },
    cache: "no-store",
  });

  // Throttling: respect the API's reserve. We only make one request per tick,
  // so the practical action on exhaustion is to abort this tick cleanly.
  const available = res.headers.get("x-requests-available-minute");
  if (res.status === 429) {
    console.warn(`football-data: throttled (available=${available ?? "?"})`);
    throw new ThrottledError("football-data rate limit reached");
  }
  if (!res.ok) {
    throw new Error(`football-data: HTTP ${res.status}`);
  }

  return (await res.json()) as FootballDataResponse;
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. (No unit test: this is thin network I/O; its behaviour is exercised through `runSync`'s injected `fetchFinished`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/football-data.ts
git commit -m "feat(sync): football-data WC fetch wrapper with throttle handling"
```

---

### Task 7: Cron route handler + auth test

Thin adapter: verify `CRON_SECRET` first (else 401), build the real `SyncDeps` from `supabaseAdmin` + `fetchWorldCupMatches`, call `runSync`, return the summary as JSON. All business logic lives in `runSync`; the handler is wiring only.

**Files:**
- Create: `src/app/api/cron/sync-results/route.ts`
- Test: `tests/sync-results-route.test.ts`

- [ ] **Step 1: Write the failing auth test**

```ts
import { afterEach, describe, expect, test, vi } from "vitest";

// Mock the server-only modules so importing the route never evaluates them
// (the real ones import "server-only" and hit the network / service_role key).
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/football-data", () => ({ fetchWorldCupMatches: vi.fn() }));

const ORIGINAL = process.env.CRON_SECRET;
afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL;
  vi.clearAllMocks();
});

describe("GET /api/cron/sync-results — auth", () => {
  test("returns 401 when the Authorization header is missing", async () => {
    process.env.CRON_SECRET = "s3cret";
    const { GET } = await import("../src/app/api/cron/sync-results/route");
    const res = await GET(new Request("https://x/api/cron/sync-results"));
    expect(res.status).toBe(401);
  });

  test("returns 401 when the bearer token is wrong", async () => {
    process.env.CRON_SECRET = "s3cret";
    const { GET } = await import("../src/app/api/cron/sync-results/route");
    const res = await GET(
      new Request("https://x/api/cron/sync-results", {
        headers: { authorization: "Bearer nope" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sync-results-route`
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/cron/sync-results/route.ts
import { fetchWorldCupMatches } from "@/lib/football-data";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  parseFinishedMatches,
  runSync,
  type BetRow,
  type SyncDeps,
} from "@/lib/sync";

export const dynamic = "force-dynamic"; // never cache

// Result window: a match can be finishing from kickoff up to 4h later
// (extra time + penalties in knockout rounds). See skill rule #4.
const RESULT_WINDOW_MS = 4 * 60 * 60 * 1000;

export async function GET(req: Request) {
  // 1. Auth — checked first.
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Wire real I/O into the orchestrator.
  const deps: SyncDeps = {
    hasMatchInResultWindow: async () => {
      const now = Date.now();
      const { data, error } = await supabaseAdmin
        .from("matches")
        .select("id")
        .neq("status", "finished")
        .lte("kickoff_at", new Date(now).toISOString())
        .gte("kickoff_at", new Date(now - RESULT_WINDOW_MS).toISOString())
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },

    fetchFinished: async () => parseFinishedMatches(await fetchWorldCupMatches()),

    loadMatchWithUnscoredBets: async (footballDataId) => {
      const { data: match, error: matchErr } = await supabaseAdmin
        .from("matches")
        .select("id, status, home_score, away_score")
        .eq("football_data_id", footballDataId)
        .maybeSingle();
      if (matchErr) throw matchErr;
      if (!match) return null;

      const { data: bets, error: betsErr } = await supabaseAdmin
        .from("bets")
        .select("id, user_id, home_score, away_score")
        .eq("match_id", match.id)
        .is("points_awarded", null);
      if (betsErr) throw betsErr;

      return {
        matchId: match.id,
        status: match.status,
        homeScore: match.home_score,
        awayScore: match.away_score,
        bets: (bets ?? []) as BetRow[],
      };
    },

    persistScore: async (footballDataId, homeScore, awayScore, scored) => {
      const { error } = await supabaseAdmin.rpc("score_match", {
        p_fd_id: footballDataId,
        p_home: homeScore,
        p_away: awayScore,
        p_scored: scored.map((s) => ({ bet_id: s.betId, points: s.points })),
      });
      if (error) throw error;
    },
  };

  // 3. Run and report.
  const summary = await runSync(deps);
  return Response.json({ ok: true, ...summary });
}
```

> Note: if `supabaseAdmin.rpc("score_match", …)` reports a type error on the
> `p_scored` argument, it means Task 5 Step 4 (regenerate types) was skipped —
> run it. As a last resort the payload can be cast (`p_scored: … as never`), but
> regenerating the types is the correct fix.

- [ ] **Step 4: Run the auth test**

Run: `npm test -- sync-results-route`
Expected: PASS — both 401 cases green.

- [ ] **Step 5: Full verification**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: all tests pass, no type/lint errors, production build succeeds (route compiled as dynamic).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cron/sync-results/route.ts tests/sync-results-route.test.ts
git commit -m "feat(sync): cron sync-results route wiring runSync to Supabase + football-data"
```

---

### Task 8: Final verification & merge

**Files:** none (integration + merge).

- [ ] **Step 1: Confirm the whole suite + build are green on the branch**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: green across the board.

- [ ] **Step 2: Self-review the diff**

Run: `git log --oneline main..feat/sync-results && git diff main...feat/sync-results --stat`
Confirm: no secrets committed, `.env.local.example` already covers the env vars (no change needed), skill rules honoured (single global fetch, gate before network, CRON_SECRET first, idempotent SQL).

- [ ] **Step 3: Merge into main (pre-deploy local workflow, AGENTS.md §8)**

```bash
git checkout main
git merge --no-ff feat/sync-results -m "merge: sync-results cron brick (football-data → score bets)"
git branch -d feat/sync-results
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Self-Review (plan vs spec)

**Spec coverage:**
- Spec §3.1 football-data wrapper → Task 6. ✅
- Spec §3.2 pure `parseFinishedMatches`/`scoreBets` → Tasks 2–3. ✅
- Spec §3.3 `score_match` migration (atomic, SQL idempotency guard, derives user from bet) → Task 5. ✅
- Spec §3.4 thin route handler → Task 7. ✅
- Spec §4 idempotency flow (gate, single fetch, per-match skip, double guard) → encoded in `runSync` (Task 4) + SQL (Task 5). ✅
- Spec §5 error handling (throttle → cleanly stop, per-match isolation, no secret leak) → Task 4 (`ThrottledError`, per-match try/catch, `console.error` without secrets) + Task 6 (429). ✅
- Spec §6 tests (pure helpers thorough, route 401, SQL idempotency manual) → Tasks 2–4 (pure), 7 (401), 5 Step 3 (manual SQL). ✅
- Spec §7 env vars (all pre-existing) → confirmed in Task 8 Step 2, no new vars. ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code; manual SQL verification gives concrete statements. ✅

**Type consistency:** `FinishedMatch{footballDataId,homeScore,awayScore}`, `BetRow{id,user_id,home_score,away_score}`, `ScoredBet{betId,points}`, `SyncDeps`/`LoadedMatch`/`SyncSummary` are defined once (Tasks 2–4) and used identically in the route (Task 7). The `score_match` signature `(integer,integer,integer,jsonb)` and JSON keys `bet_id`/`points` match the route's `persistScore` payload mapping (`{ bet_id, points }`). ✅

**Note on spec divergence (intentional, simpler):** the spec sketched the scored payload as `{betId,userId,points}`; the plan drops `userId` from the payload because `score_match` derives the owner from each bet row via its `user_id` FK. This is strictly simpler and equally correct — recorded here so the spec/plan difference is not mistaken for a gap.
