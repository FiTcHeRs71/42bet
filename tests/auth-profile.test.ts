// tests/auth-profile.test.ts
import { describe, it, expect } from "vitest";

import { mapFt42Profile } from "@/lib/auth/profile";

describe("mapFt42Profile", () => {
  it("maps a full /v2/me payload", () => {
    expect(
      mapFt42Profile({
        id: 42,
        login: "fducrot",
        image: { link: "https://cdn.intra.42.fr/users/fducrot.jpg" },
      }),
    ).toEqual({
      ftId: 42,
      login: "fducrot",
      avatarUrl: "https://cdn.intra.42.fr/users/fducrot.jpg",
    });
  });

  it("returns null avatar when image is absent", () => {
    expect(mapFt42Profile({ id: 7, login: "norminet" }).avatarUrl).toBeNull();
  });

  it("returns null avatar when image.link is null", () => {
    expect(
      mapFt42Profile({ id: 7, login: "norminet", image: { link: null } })
        .avatarUrl,
    ).toBeNull();
  });
});
