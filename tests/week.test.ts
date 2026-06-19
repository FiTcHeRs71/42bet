import { describe, test, expect } from "vitest";

import { currentWeekWindow } from "../src/lib/week";

/** Lit l'heure-horloge Europe/Zurich d'un instant : { weekday, hm }. */
function zurich(date: Date): { weekday: string; hm: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), hm: `${get("hour")}:${get("minute")}` };
}

const H = 3600 * 1000;

describe("currentWeekWindow", () => {
  test("un mercredi → start = samedi précédent 00:00 Zurich", () => {
    const { start, end } = currentWeekWindow(new Date("2026-06-17T12:00:00Z")); // mercredi
    expect(zurich(start)).toEqual({ weekday: "Saturday", hm: "00:00" });
    expect(zurich(end)).toEqual({ weekday: "Saturday", hm: "00:00" });
    expect(start.getTime()).toBeLessThanOrEqual(Date.parse("2026-06-17T12:00:00Z"));
    expect(end.getTime()).toBeGreaterThan(Date.parse("2026-06-17T12:00:00Z"));
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * H); // semaine standard
    // samedi 13 juin 2026 00:00 CEST = 12 juin 22:00 UTC
    expect(start.toISOString()).toBe("2026-06-12T22:00:00.000Z");
  });

  test("un dimanche → même semaine que le samedi précédent", () => {
    const { start } = currentWeekWindow(new Date("2026-06-21T12:00:00Z")); // dimanche
    expect(zurich(start)).toEqual({ weekday: "Saturday", hm: "00:00" });
    // samedi 20 juin 2026 00:00 CEST = 19 juin 22:00 UTC
    expect(start.toISOString()).toBe("2026-06-19T22:00:00.000Z");
  });

  test("un samedi → start = ce samedi 00:00 (borne incluse)", () => {
    const now = new Date("2026-06-20T08:00:00Z"); // samedi matin
    const { start, end } = currentWeekWindow(now);
    expect(zurich(start)).toEqual({ weekday: "Saturday", hm: "00:00" });
    expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(now.getTime()).toBeLessThan(end.getTime());
    expect(start.toISOString()).toBe("2026-06-19T22:00:00.000Z");
  });

  test("un vendredi → dernier jour de la semaine du samedi précédent", () => {
    const now = new Date("2026-06-19T08:00:00Z"); // vendredi matin
    const { start, end } = currentWeekWindow(now);
    expect(zurich(start)).toEqual({ weekday: "Saturday", hm: "00:00" });
    // semaine du samedi 13 juin → samedi 20 juin ; vendredi 19 est dedans
    expect(start.toISOString()).toBe("2026-06-12T22:00:00.000Z");
    expect(now.getTime()).toBeLessThan(end.getTime());
    expect(end.toISOString()).toBe("2026-06-19T22:00:00.000Z");
  });

  test("semaine du passage à l'heure d'été (DST) → 167h", () => {
    // Dimanche 29 mars 2026 = passage CET→CEST (on perd 1h). La semaine va du
    // samedi 28 mars au samedi 4 avril et contient ce dimanche.
    const { start, end } = currentWeekWindow(new Date("2026-03-30T12:00:00Z")); // lundi
    expect(zurich(start)).toEqual({ weekday: "Saturday", hm: "00:00" });
    expect(zurich(end)).toEqual({ weekday: "Saturday", hm: "00:00" });
    expect(end.getTime() - start.getTime()).toBe(167 * H); // 7j - 1h
  });
});
