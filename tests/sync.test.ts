import { describe, expect, test } from "vitest";

import {
  parseFinishedMatches,
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
