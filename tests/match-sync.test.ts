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
  it("mappe terminé (FINISHED et AWARDED)", () => {
    expect(mapStatus("FINISHED")).toBe("finished");
    expect(mapStatus("AWARDED")).toBe("finished");
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
  it("donne la priorité au groupe sur le stage", () => {
    expect(formatStage("FINAL", "GROUP_A")).toBe("Groupe A");
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
