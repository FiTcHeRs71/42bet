// tests/match-view.test.ts
import { describe, test, expect } from "vitest";

import { displayState, groupByDay } from "../src/lib/match-view";
import type { Match } from "../src/lib/types";

// Fabrique un Match minimal ; on ne renseigne que les champs lus par la logique.
function match(over: Partial<Match>): Match {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    football_data_id: 1,
    home_team: "A",
    away_team: "B",
    home_crest_url: null,
    away_crest_url: null,
    stage: null,
    kickoff_at: "2026-06-11T16:00:00Z",
    status: "scheduled",
    home_score: null,
    away_score: null,
    score_locked: false,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    ...over,
  };
}

describe("displayState", () => {
  const now = new Date("2026-06-11T12:00:00Z");

  test("finished -> finished", () => {
    expect(displayState(match({ status: "finished" }), now)).toBe("finished");
  });
  test("postponed -> postponed", () => {
    expect(displayState(match({ status: "postponed" }), now)).toBe("postponed");
  });
  test("cancelled -> cancelled", () => {
    expect(displayState(match({ status: "cancelled" }), now)).toBe("cancelled");
  });
  test("live status -> live", () => {
    expect(displayState(match({ status: "live" }), now)).toBe("live");
  });
  test("scheduled, kickoff futur -> upcoming", () => {
    expect(
      displayState(match({ status: "scheduled", kickoff_at: "2026-06-11T16:00:00Z" }), now),
    ).toBe("upcoming");
  });
  test("scheduled, kickoff passé -> live", () => {
    expect(
      displayState(match({ status: "scheduled", kickoff_at: "2026-06-11T10:00:00Z" }), now),
    ).toBe("live");
  });
  test("scheduled, now === kickoff -> live (borne)", () => {
    const k = "2026-06-11T12:00:00Z";
    expect(displayState(match({ status: "scheduled", kickoff_at: k }), new Date(k))).toBe("live");
  });
});

describe("groupByDay", () => {
  test("liste vide -> []", () => {
    expect(groupByDay([])).toEqual([]);
  });

  test("même jour (Europe/Zurich) -> un seul groupe trié par kickoff", () => {
    const a = match({ football_data_id: 1, kickoff_at: "2026-06-11T19:00:00Z" });
    const b = match({ football_data_id: 2, kickoff_at: "2026-06-11T16:00:00Z" });
    const groups = groupByDay([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].matches.map((m) => m.football_data_id)).toEqual([2, 1]);
  });

  test("kickoff tardif UTC -> bon jour Europe/Zurich (straddle minuit)", () => {
    // 22:30Z = 00:30 le lendemain à Zurich (CEST, +2)
    const late = match({ football_data_id: 1, kickoff_at: "2026-06-11T22:30:00Z" });
    const groups = groupByDay([late]);
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-06-12"]);
  });

  test("plusieurs jours, entrée désordonnée -> groupes triés chrono", () => {
    const d12 = match({ football_data_id: 1, kickoff_at: "2026-06-12T16:00:00Z" });
    const d11 = match({ football_data_id: 2, kickoff_at: "2026-06-11T16:00:00Z" });
    const d13 = match({ football_data_id: 3, kickoff_at: "2026-06-13T16:00:00Z" });
    const groups = groupByDay([d12, d11, d13]);
    expect(groups.map((g) => g.dayKey)).toEqual(["2026-06-11", "2026-06-12", "2026-06-13"]);
  });
});
