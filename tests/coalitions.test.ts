import { describe, it, expect } from "vitest";

import { pickUserCoalition } from "@/lib/coalitions";

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
