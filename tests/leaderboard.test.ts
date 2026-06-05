// tests/leaderboard.test.ts
import { describe, test, expect } from "vitest";

import {
  buildCoalitionLeaderboard,
  buildLeaderboard,
  type LeaderboardBet,
  type LeaderboardEntry,
  type LeaderboardPlayer,
} from "../src/lib/leaderboard";

const COA = { name: "The Federation", color: "#39c2c2", image_url: null };

function player(
  id: string,
  login: string,
  coalition: LeaderboardPlayer["coalition"] = null,
): LeaderboardPlayer {
  return { id, login, avatar_url: null, coalition };
}

describe("buildLeaderboard", () => {
  test("aucune donnée -> []", () => {
    expect(buildLeaderboard([], [])).toEqual([]);
  });

  test("joueur sans prono -> exclu", () => {
    expect(buildLeaderboard([player("u1", "alice")], [])).toEqual([]);
  });

  test("tri par points décroissant", () => {
    const players = [player("u1", "alice"), player("u2", "bob")];
    const bets: LeaderboardBet[] = [
      { user_id: "u1", points_awarded: 1 },
      { user_id: "u2", points_awarded: 3 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r.map((e) => e.login)).toEqual(["bob", "alice"]);
    expect(r.map((e) => e.rank)).toEqual([1, 2]);
  });

  test("ex æquo -> même rang, le suivant saute (1,1,3)", () => {
    const players = [
      player("u1", "alice"),
      player("u2", "bob"),
      player("u3", "carol"),
    ];
    const bets: LeaderboardBet[] = [
      { user_id: "u1", points_awarded: 3 },
      { user_id: "u2", points_awarded: 3 },
      { user_id: "u3", points_awarded: 1 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r.map((e) => e.rank)).toEqual([1, 1, 3]);
  });

  test("départage par login à points égaux", () => {
    const players = [player("u2", "bob"), player("u1", "alice")];
    const bets: LeaderboardBet[] = [
      { user_id: "u2", points_awarded: 3 },
      { user_id: "u1", points_awarded: 3 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r.map((e) => e.login)).toEqual(["alice", "bob"]);
  });

  test("accuracy = gagnants / notés, pronos en attente exclus du dénominateur", () => {
    const players = [player("u1", "alice")];
    const bets: LeaderboardBet[] = [
      { user_id: "u1", points_awarded: 3 }, // gagné, noté
      { user_id: "u1", points_awarded: 0 }, // perdu, noté
      { user_id: "u1", points_awarded: null }, // en attente
    ];
    const r = buildLeaderboard(players, bets);
    expect(r[0].bets).toBe(3);
    expect(r[0].accuracy).toBe(0.5); // 1 gagné / 2 notés
  });

  test("accuracy = null si aucun prono noté", () => {
    const players = [player("u1", "alice")];
    const bets: LeaderboardBet[] = [{ user_id: "u1", points_awarded: null }];
    const r = buildLeaderboard(players, bets);
    expect(r[0].accuracy).toBeNull();
    expect(r[0].bets).toBe(1);
  });

  test("points somme correctement, null compté 0", () => {
    const players = [player("u1", "alice")];
    const bets: LeaderboardBet[] = [
      { user_id: "u1", points_awarded: 3 },
      { user_id: "u1", points_awarded: null },
      { user_id: "u1", points_awarded: 1 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r[0].points).toBe(4);
  });

  test("coalition propagée telle quelle", () => {
    const players = [player("u1", "alice", COA)];
    const bets: LeaderboardBet[] = [{ user_id: "u1", points_awarded: 1 }];
    const r = buildLeaderboard(players, bets);
    expect(r[0].coalition).toEqual(COA);
  });
});

const FED = { name: "Federation", color: "#39c2c2", image_url: null };
const ORDER = { name: "Order", color: "#9b59b6", image_url: null };
const ALLI = { name: "Alliance", color: "#e67e22", image_url: null };

function entry(
  login: string,
  points: number,
  coalition: LeaderboardEntry["coalition"],
): LeaderboardEntry {
  return {
    rank: 0,
    login,
    avatarUrl: null,
    coalition,
    points,
    bets: 0,
    accuracy: null,
  };
}

describe("buildCoalitionLeaderboard", () => {
  test("aucune entrée -> []", () => {
    expect(buildCoalitionLeaderboard([])).toEqual([]);
  });

  test("entrées sans coalition -> exclues", () => {
    const entries = [entry("alice", 5, null), entry("bob", 3, null)];
    expect(buildCoalitionLeaderboard(entries)).toEqual([]);
  });

  test("agrège total, nb joueurs et moyenne par coalition", () => {
    const entries = [
      entry("alice", 3, FED),
      entry("bob", 1, FED),
      entry("carol", 5, ORDER),
    ];
    const r = buildCoalitionLeaderboard(entries);
    const fed = r.find((c) => c.coalition.name === "Federation")!;
    const order = r.find((c) => c.coalition.name === "Order")!;
    expect(fed.totalPoints).toBe(4);
    expect(fed.players).toBe(2);
    expect(fed.average).toBe(2);
    expect(order.totalPoints).toBe(5);
    expect(order.players).toBe(1);
    expect(order.average).toBe(5);
  });

  test("tri par moyenne décroissante : petite coalition efficace devant", () => {
    const entries = [
      entry("alice", 3, FED),
      entry("bob", 1, FED),
      entry("carol", 5, ORDER),
    ];
    const r = buildCoalitionLeaderboard(entries);
    expect(r.map((c) => c.coalition.name)).toEqual(["Order", "Federation"]);
    expect(r.map((c) => c.rank)).toEqual([1, 2]);
  });

  test("ex æquo sur la moyenne -> rang 1,1,3, départage total puis name", () => {
    const entries = [
      entry("alice", 2, ORDER),
      entry("bob", 2, FED),
      entry("carol", 1, ALLI),
    ];
    const r = buildCoalitionLeaderboard(entries);
    expect(r.map((c) => c.coalition.name)).toEqual([
      "Federation",
      "Order",
      "Alliance",
    ]);
    expect(r.map((c) => c.rank)).toEqual([1, 1, 3]);
  });
});
