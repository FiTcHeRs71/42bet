import { describe, test, expect } from "vitest";

import { canPlaceBet, validateScore } from "../src/lib/bet-rules";

// kickoff de référence : 2026-06-12T16:00:00Z
const KICKOFF = "2026-06-12T16:00:00Z";
const BEFORE = new Date("2026-06-12T15:59:00Z");
const AFTER = new Date("2026-06-12T16:00:01Z");
const AT = new Date(KICKOFF);

describe("canPlaceBet", () => {
  test("scheduled + kickoff futur -> true", () => {
    expect(canPlaceBet({ status: "scheduled", kickoff_at: KICKOFF }, BEFORE)).toBe(true);
  });

  test("scheduled + kickoff passé -> false", () => {
    expect(canPlaceBet({ status: "scheduled", kickoff_at: KICKOFF }, AFTER)).toBe(false);
  });

  test("scheduled + now == kickoff (limite) -> false", () => {
    expect(canPlaceBet({ status: "scheduled", kickoff_at: KICKOFF }, AT)).toBe(false);
  });

  test("live -> false même avant kickoff", () => {
    expect(canPlaceBet({ status: "live", kickoff_at: KICKOFF }, BEFORE)).toBe(false);
  });

  test("finished -> false", () => {
    expect(canPlaceBet({ status: "finished", kickoff_at: KICKOFF }, BEFORE)).toBe(false);
  });

  test("postponed -> false", () => {
    expect(canPlaceBet({ status: "postponed", kickoff_at: KICKOFF }, BEFORE)).toBe(false);
  });

  test("cancelled -> false", () => {
    expect(canPlaceBet({ status: "cancelled", kickoff_at: KICKOFF }, BEFORE)).toBe(false);
  });
});

describe("validateScore", () => {
  test("nominal (2, 1) -> true", () => {
    expect(validateScore(2, 1)).toBe(true);
  });

  test("(0, 0) -> true", () => {
    expect(validateScore(0, 0)).toBe(true);
  });

  test("négatif (-1, 0) -> false", () => {
    expect(validateScore(-1, 0)).toBe(false);
  });

  test("non-entier (1.5, 0) -> false", () => {
    expect(validateScore(1.5, 0)).toBe(false);
  });

  test("NaN -> false", () => {
    expect(validateScore(NaN, 0)).toBe(false);
  });

  test("hors borne (100, 0) -> false", () => {
    expect(validateScore(100, 0)).toBe(false);
  });
});
