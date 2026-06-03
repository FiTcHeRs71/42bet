// tests/auth-upsert-player.test.ts
import { describe, it, expect, vi } from "vitest";

import { upsertPlayer } from "@/lib/auth/upsert-player";

const profile = {
  ftId: 42,
  login: "fducrot",
  avatarUrl: "https://cdn.intra.42.fr/users/fducrot.jpg",
};

describe("upsertPlayer", () => {
  it("passes a snake_case row to the injected upsert", async () => {
    const upsertUser = vi.fn().mockResolvedValue({ error: null });
    await upsertPlayer(profile, { upsertUser });
    expect(upsertUser).toHaveBeenCalledWith({
      ft_id: 42,
      login: "fducrot",
      avatar_url: "https://cdn.intra.42.fr/users/fducrot.jpg",
    });
  });

  it("throws (mentioning the login) when the upsert returns an error", async () => {
    const upsertUser = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    await expect(upsertPlayer(profile, { upsertUser })).rejects.toThrow(
      /fducrot/,
    );
  });
});
