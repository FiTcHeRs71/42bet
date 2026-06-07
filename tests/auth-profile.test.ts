// tests/auth-profile.test.ts
import { describe, it, expect } from "vitest";

import { mapFt42Profile, getPrimaryCampusId } from "@/lib/auth/profile";

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

describe("getPrimaryCampusId", () => {
  it("renvoie le campus marqué is_primary", () => {
    expect(
      getPrimaryCampusId({
        id: 1,
        login: "alice",
        campus_users: [
          { campus_id: 33, is_primary: false },
          { campus_id: 47, is_primary: true }, // 47 = campus Lausanne
        ],
      }),
    ).toBe(47); // 47 = campus Lausanne
  });

  it("retombe sur le premier campus si aucun is_primary", () => {
    expect(
      getPrimaryCampusId({
        id: 2,
        login: "bob",
        campus_users: [
          { campus_id: 21, is_primary: false },
          { campus_id: 47, is_primary: false },
        ],
      }),
    ).toBe(21);
  });

  it("renvoie null si la liste est vide", () => {
    expect(getPrimaryCampusId({ id: 3, login: "carol", campus_users: [] })).toBeNull();
  });

  it("renvoie null si campus_users est absent", () => {
    expect(getPrimaryCampusId({ id: 4, login: "dave" })).toBeNull();
  });
});
