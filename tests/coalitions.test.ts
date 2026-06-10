import { describe, it, expect } from "vitest";

import {
  pickUserCoalition,
  COALITION_CURSUS_PRIORITY,
  PISCINE_CHEFS,
} from "@/lib/coalitions";

describe("pickUserCoalition", () => {
  it("returns null when the user has no coalition", () => {
    expect(pickUserCoalition([])).toBeNull();
  });

  it("normalises the first coalition", () => {
    expect(
      pickUserCoalition([
        { id: 42, name: "The Order", color: "#3fb27f", image_url: "https://x/o.svg" },
        { id: 99, name: "The Alliance", color: "#9b3fb2", image_url: null },
      ]),
    ).toEqual({
      ftId: 42,
      name: "The Order",
      color: "#3fb27f",
      imageUrl: "https://x/o.svg",
    });
  });

  it("falls back to a neutral colour when color is missing", () => {
    expect(pickUserCoalition([{ id: 7, name: "No Colour" }])).toEqual({
      ftId: 7,
      name: "No Colour",
      color: "#64748b",
      imageUrl: null,
    });
  });

  it("treats empty/whitespace color as missing", () => {
    expect(pickUserCoalition([{ id: 7, name: "X", color: "  " }])?.color).toBe(
      "#64748b",
    );
  });
});

describe("pickUserCoalition — sélection multi-cursus (priorité 21>9>1)", () => {
  const houseC21 = { id: 192, name: "House of Threads", color: "#599ac2", image_url: "u" };
  const houseC1 = { id: 189, name: "House of Threads", color: "#528AAE", image_url: "u" };
  const sharkC9 = { id: 168, name: "The Sharks", color: "#82CCE0", image_url: "s" };

  it("préfère la House du 42cursus (c21) à l'animal de Piscine (c9)", () => {
    expect(pickUserCoalition([sharkC9, houseC21])?.ftId).toBe(192);
    // ordre inverse : résultat identique (déterminisme)
    expect(pickUserCoalition([houseC21, sharkC9])?.ftId).toBe(192);
  });

  it("préfère l'animal de Piscine (c9) à la House legacy (c1)", () => {
    expect(pickUserCoalition([houseC1, sharkC9])?.ftId).toBe(168);
  });

  it("piscineux pur -> son animal", () => {
    expect(pickUserCoalition([sharkC9])?.ftId).toBe(168);
  });

  it("legacy pur (c1) -> sa House legacy", () => {
    expect(pickUserCoalition([houseC1])?.ftId).toBe(189);
  });

  it("aucune coalition connue du mapping -> fallback raw[0]", () => {
    const exotic = { id: 99999, name: "Autre campus", color: "#111111", image_url: null };
    expect(pickUserCoalition([exotic])?.ftId).toBe(99999);
  });

  it("expose la table de priorité", () => {
    expect(COALITION_CURSUS_PRIORITY[192]).toBe(3); // c21
    expect(COALITION_CURSUS_PRIORITY[168]).toBe(2); // c9
    expect(COALITION_CURSUS_PRIORITY[189]).toBe(1); // c1
  });
});

describe("pickUserCoalition — exception chefs de piscine", () => {
  const sharkC9 = { id: 168, name: "The Sharks", color: "#82CCE0", image_url: "s" };
  const houseC21 = { id: 192, name: "House of Threads", color: "#599ac2", image_url: "u" };

  it("chef de piscine → sa piscine (groupe piscine) même si le cursus est prioritaire", () => {
    // un chef est rattaché à la coalition de groupe « piscine » réellement
    // renvoyée par l'API, sans qu'on ait à connaître laquelle. raw contient
    // cursus (prio 3) + piscine (prio 2).
    expect(pickUserCoalition([houseC21, sharkC9], "ludebarn")?.ftId).toBe(168);
    // ordre inverse : même résultat
    expect(pickUserCoalition([sharkC9, houseC21], "ludebarn")?.ftId).toBe(168);
  });

  it("chef dont aucune piscine n'est dans raw → repli priorité cursus", () => {
    // l'API n'a pas renvoyé de coalition piscine : on ne l'invente pas.
    expect(pickUserCoalition([houseC21], "ludebarn")?.ftId).toBe(192);
  });

  it("login non-chef → sélection par priorité inchangée", () => {
    expect(pickUserCoalition([houseC21, sharkC9], "fducrot")?.ftId).toBe(192);
  });

  it("expose le set des logins de chefs de piscine", () => {
    expect(PISCINE_CHEFS).toBeInstanceOf(Set);
    expect([...PISCINE_CHEFS].sort()).toEqual(["jturrel", "ludebarn", "sweinber"]);
  });
});
