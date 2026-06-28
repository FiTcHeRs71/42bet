import { describe, test, expect } from "vitest";

import { calcBetPoints } from "../src/lib/points";

// Canonical scoring rules (skill `bet-points-calc`):
//   exact score        -> 3
//   right winner/draw  -> 1
//   wrong outcome      -> 0
// In each case the first score is the bet, the second is the match result.
describe("calcBetPoints", () => {
  test("exact score, home win (2-1 / 2-1) -> 3", () => {
    expect(calcBetPoints({ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 1 })).toBe(3);
  });

  test("exact score, draw (1-1 / 1-1) -> 3", () => {
    expect(calcBetPoints({ homeScore: 1, awayScore: 1 }, { homeScore: 1, awayScore: 1 })).toBe(3);
  });

  test("exact score, away win (0-2 / 0-2) -> 3", () => {
    expect(calcBetPoints({ homeScore: 0, awayScore: 2 }, { homeScore: 0, awayScore: 2 })).toBe(3);
  });

  test("right home winner, wrong score (2-1 / 3-0) -> 1", () => {
    expect(calcBetPoints({ homeScore: 2, awayScore: 1 }, { homeScore: 3, awayScore: 0 })).toBe(1);
  });

  test("right draw, wrong score (1-1 / 2-2) -> 1", () => {
    expect(calcBetPoints({ homeScore: 1, awayScore: 1 }, { homeScore: 2, awayScore: 2 })).toBe(1);
  });

  test("wrong winner (2-1 / 0-1) -> 0", () => {
    expect(calcBetPoints({ homeScore: 2, awayScore: 1 }, { homeScore: 0, awayScore: 1 })).toBe(0);
  });

  test("predicted draw but there was a winner (1-1 / 2-1) -> 0", () => {
    expect(calcBetPoints({ homeScore: 1, awayScore: 1 }, { homeScore: 2, awayScore: 1 })).toBe(0);
  });

  test("predicted a winner but it was a draw (2-1 / 1-1) -> 0", () => {
    expect(calcBetPoints({ homeScore: 2, awayScore: 1 }, { homeScore: 1, awayScore: 1 })).toBe(0);
  });

  // Phase à élimination : nul à 90' décidé aux tirs au but. `qualifiedWinner`
  // désigne l'équipe qui se qualifie. On récompense le bon pronostic du qualifié
  // SANS retirer le point au parieur « nul » (90' était bien un nul).
  describe("knockout draw decided on penalties (qualifiedWinner)", () => {
    test("bet on the qualifying home side (2-1 / 1-1, home qualifies) -> 1", () => {
      expect(
        calcBetPoints(
          { homeScore: 2, awayScore: 1 },
          { homeScore: 1, awayScore: 1, qualifiedWinner: "home" },
        ),
      ).toBe(1);
    });

    test("bet on the qualifying away side (1-2 / 1-1, away qualifies) -> 1", () => {
      expect(
        calcBetPoints(
          { homeScore: 1, awayScore: 2 },
          { homeScore: 1, awayScore: 1, qualifiedWinner: "away" },
        ),
      ).toBe(1);
    });

    test("bet on the eliminated side (2-1 / 1-1, away qualifies) -> 0", () => {
      expect(
        calcBetPoints(
          { homeScore: 2, awayScore: 1 },
          { homeScore: 1, awayScore: 1, qualifiedWinner: "away" },
        ),
      ).toBe(0);
    });

    test("draw bettor keeps their point (1-1 / 2-2, home qualifies) -> 1", () => {
      expect(
        calcBetPoints(
          { homeScore: 1, awayScore: 1 },
          { homeScore: 2, awayScore: 2, qualifiedWinner: "home" },
        ),
      ).toBe(1);
    });

    test("exact draw score still scores 3 (1-1 / 1-1, home qualifies) -> 3", () => {
      expect(
        calcBetPoints(
          { homeScore: 1, awayScore: 1 },
          { homeScore: 1, awayScore: 1, qualifiedWinner: "home" },
        ),
      ).toBe(3);
    });
  });
});
