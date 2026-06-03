import { describe, expect, test } from "vitest";

import {
  parseFinishedMatches,
  scoreBets,
  type BetRow,
  type FootballDataResponse,
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
