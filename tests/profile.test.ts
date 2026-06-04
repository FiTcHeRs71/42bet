import { describe, test, expect } from "vitest";

import { buildProfileHistory, type ProfileBetRow } from "../src/lib/profile";
import type { MatchStatus } from "../src/lib/types";

function makeRow(
  matchId: string,
  kickoff: string,
  points: number | null,
  predicted: [number, number],
  actual: [number, number] | null,
  status: MatchStatus,
): ProfileBetRow {
  return {
    match_id: matchId,
    home_score: predicted[0],
    away_score: predicted[1],
    points_awarded: points,
    match: {
      home_team: "H",
      away_team: "A",
      home_crest_url: null,
      away_crest_url: null,
      home_score: actual ? actual[0] : null,
      away_score: actual ? actual[1] : null,
      kickoff_at: kickoff,
      status,
    },
  };
}

describe("buildProfileHistory", () => {
  test("liste vide -> []", () => {
    expect(buildProfileHistory([])).toEqual([]);
  });

  test("ligne sans match (jointure nulle) -> ignorée", () => {
    const orphan: ProfileBetRow = {
      match_id: "m0",
      home_score: 1,
      away_score: 1,
      points_awarded: null,
      match: null,
    };
    expect(buildProfileHistory([orphan])).toEqual([]);
  });

  test("tri par kickoff décroissant", () => {
    const rows = [
      makeRow("m1", "2026-06-10T18:00:00Z", null, [1, 0], null, "scheduled"),
      makeRow("m2", "2026-06-12T18:00:00Z", null, [2, 2], null, "scheduled"),
      makeRow("m3", "2026-06-11T18:00:00Z", null, [0, 1], null, "scheduled"),
    ];
    expect(buildProfileHistory(rows).map((e) => e.matchId)).toEqual([
      "m2",
      "m3",
      "m1",
    ]);
  });

  test("départage déterministe par matchId à kickoff identique", () => {
    const k = "2026-06-10T18:00:00Z";
    const rows = [
      makeRow("mb", k, null, [1, 0], null, "scheduled"),
      makeRow("ma", k, null, [0, 0], null, "scheduled"),
    ];
    expect(buildProfileHistory(rows).map((e) => e.matchId)).toEqual([
      "ma",
      "mb",
    ]);
  });

  test("outcome étiqueté depuis points_awarded (3/1/0/null)", () => {
    const rows = [
      makeRow("m1", "2026-06-10T18:00:00Z", 3, [2, 1], [2, 1], "finished"),
      makeRow("m2", "2026-06-09T18:00:00Z", 1, [1, 0], [3, 1], "finished"),
      makeRow("m3", "2026-06-08T18:00:00Z", 0, [0, 0], [2, 1], "finished"),
      makeRow("m4", "2026-06-07T18:00:00Z", null, [1, 1], null, "scheduled"),
    ];
    const out = buildProfileHistory(rows);
    const byId = Object.fromEntries(out.map((e) => [e.matchId, e.outcome]));
    expect(byId).toEqual({
      m1: "exact",
      m2: "good",
      m3: "miss",
      m4: "pending",
    });
  });

  test("scores réels: null si non terminé, valeurs si terminé", () => {
    const rows = [
      makeRow("m1", "2026-06-10T18:00:00Z", 3, [2, 1], [2, 1], "finished"),
      makeRow("m2", "2026-06-09T18:00:00Z", null, [1, 1], null, "scheduled"),
    ];
    const out = buildProfileHistory(rows);
    const m1 = out.find((e) => e.matchId === "m1")!;
    const m2 = out.find((e) => e.matchId === "m2")!;
    expect([m1.actualHome, m1.actualAway]).toEqual([2, 1]);
    expect([m1.predictedHome, m1.predictedAway]).toEqual([2, 1]);
    expect([m2.actualHome, m2.actualAway]).toEqual([null, null]);
    expect([m2.predictedHome, m2.predictedAway]).toEqual([1, 1]);
  });
});
