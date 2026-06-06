// tests/auth-upsert-player.test.ts
import { describe, it, expect, vi } from "vitest";

import { upsertPlayer, type UpsertDeps } from "@/lib/auth/upsert-player";

const profile = {
  ftId: 42,
  login: "fducrot",
  avatarUrl: "https://cdn.intra.42.fr/users/fducrot.jpg",
};

/** Deps par défaut : upsert OK, aucune coalition. */
function baseDeps(over: Partial<UpsertDeps> = {}): UpsertDeps {
  return {
    upsertUser: vi.fn().mockResolvedValue({ error: null }),
    fetchUserCoalitions: vi.fn().mockResolvedValue([]),
    upsertCoalition: vi.fn().mockResolvedValue({ id: null, error: null }),
    setCoalition: vi.fn().mockResolvedValue({ error: null }),
    ...over,
  };
}

describe("upsertPlayer", () => {
  it("passes a snake_case row to the injected upsert", async () => {
    const deps = baseDeps();
    await upsertPlayer(profile, deps);
    expect(deps.upsertUser).toHaveBeenCalledWith({
      ft_id: 42,
      login: "fducrot",
      avatar_url: "https://cdn.intra.42.fr/users/fducrot.jpg",
    });
  });

  it("throws (mentioning the login) when the user upsert returns an error", async () => {
    const deps = baseDeps({
      upsertUser: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
    });
    await expect(upsertPlayer(profile, deps)).rejects.toThrow(/fducrot/);
  });

  it("upserts the coalition then links it to the player", async () => {
    const deps = baseDeps({
      fetchUserCoalitions: vi
        .fn()
        .mockResolvedValue([{ id: 7, name: "Order", color: "#3fb27f" }]),
      upsertCoalition: vi.fn().mockResolvedValue({ id: "coal-uuid", error: null }),
    });
    await upsertPlayer(profile, deps);
    expect(deps.upsertCoalition).toHaveBeenCalledWith({
      ftId: 7,
      name: "Order",
      color: "#3fb27f",
      imageUrl: null,
    });
    expect(deps.setCoalition).toHaveBeenCalledWith(42, "coal-uuid");
  });

  it("does not touch coalition when the player has none", async () => {
    const deps = baseDeps();
    await upsertPlayer(profile, deps);
    expect(deps.upsertCoalition).not.toHaveBeenCalled();
    expect(deps.setCoalition).not.toHaveBeenCalled();
  });

  it("never fails login when the coalition fetch throws", async () => {
    const deps = baseDeps({
      fetchUserCoalitions: vi.fn().mockRejectedValue(new Error("42 api down")),
    });
    await expect(upsertPlayer(profile, deps)).resolves.toBeUndefined();
    expect(deps.upsertUser).toHaveBeenCalledOnce();
  });
});
