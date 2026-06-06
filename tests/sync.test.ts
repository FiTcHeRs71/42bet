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
  test("keeps FINISHED and AWARDED matches and maps fullTime scores", () => {
    const res: FootballDataResponse = {
      matches: [
        { id: 1, status: "FINISHED", score: { fullTime: { home: 2, away: 1 } } },
        { id: 2, status: "IN_PLAY", score: { fullTime: { home: 0, away: 0 } } },
        { id: 3, status: "TIMED", score: { fullTime: { home: null, away: null } } },
        { id: 4, status: "FINISHED", score: { fullTime: { home: 0, away: 0 } } },
        { id: 7, status: "AWARDED", score: { fullTime: { home: 3, away: 0 } } },
      ],
    };
    expect(parseFinishedMatches(res)).toEqual([
      { footballDataId: 1, homeScore: 2, awayScore: 1 },
      { footballDataId: 4, homeScore: 0, awayScore: 0 },
      { footballDataId: 7, homeScore: 3, awayScore: 0 },
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
