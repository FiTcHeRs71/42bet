// tests/leaderboard.test.ts
import { describe, test, expect } from "vitest";

import {
  buildCoalitionLeaderboard,
  buildLeaderboard,
  type LeaderboardBet,
  type LeaderboardEntry,
  type LeaderboardPlayer,
} from "../src/lib/leaderboard";
import { coalitionGroupOf } from "../src/lib/coalitions";

const COA = { ft_id: 192, name: "The Federation", color: "#39c2c2", image_url: null };

function player(
  id: string,
  login: string,
  total_points = 0,
  coalition: LeaderboardPlayer["coalition"] = null,
): LeaderboardPlayer {
  return { id, login, avatar_url: null, total_points, coalition };
}

describe("buildLeaderboard", () => {
  test("aucune donnée -> []", () => {
    expect(buildLeaderboard([], [])).toEqual([]);
  });

  test("joueur sans prono -> exclu", () => {
    expect(buildLeaderboard([player("u1", "alice")], [])).toEqual([]);
  });

  test("tri par points décroissant", () => {
    const players = [player("u1", "alice", 1), player("u2", "bob", 3)];
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
      player("u1", "alice", 3),
      player("u2", "bob", 3),
      player("u3", "carol", 1),
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
    const players = [player("u2", "bob", 3), player("u1", "alice", 3)];
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

  test("points proviennent de total_points (pas de la somme des bets)", () => {
    const players = [player("u1", "alice", 42)];
    const bets: LeaderboardBet[] = [
      { user_id: "u1", points_awarded: 3 },
      { user_id: "u1", points_awarded: 1 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r[0].points).toBe(42); // total_points, pas 4
    expect(r[0].bets).toBe(2); // nb de pronos inchangé
  });

  test("coalition propagée telle quelle", () => {
    const players = [player("u1", "alice", 1, COA)];
    const bets: LeaderboardBet[] = [{ user_id: "u1", points_awarded: 1 }];
    const r = buildLeaderboard(players, bets);
    expect(r[0].coalition).toEqual(COA);
  });
});

const FED = { ft_id: 192, name: "Federation", color: "#39c2c2", image_url: null };
const ORDER = { ft_id: 191, name: "Order", color: "#9b59b6", image_url: null };
const ALLI = { ft_id: 168, name: "Alliance", color: "#e67e22", image_url: null };

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

  test("fusionne les Houses homonymes et garde la couleur du cursus prioritaire", () => {
    const houseC21 = { ft_id: 192, name: "House of Threads", color: "#599ac2", image_url: "c21" };
    const houseC1 = { ft_id: 189, name: "House of Threads", color: "#528AAE", image_url: "c1" };
    const entries = [
      entry("alice", 4, houseC21),
      entry("bob", 2, houseC1),
    ];
    const r = buildCoalitionLeaderboard(entries);
    expect(r).toHaveLength(1);
    expect(r[0].coalition.name).toBe("House of Threads");
    expect(r[0].coalition.color).toBe("#599ac2"); // couleur c21 (priorité 3)
    expect(r[0].coalition.image_url).toBe("c21");
    expect(r[0].totalPoints).toBe(6);
    expect(r[0].players).toBe(2);
  });

  test("couleur canonique indépendante de l'ordre des entrées", () => {
    const houseC21 = { ft_id: 192, name: "House of Threads", color: "#599ac2", image_url: "c21" };
    const houseC1 = { ft_id: 189, name: "House of Threads", color: "#528AAE", image_url: "c1" };
    const r = buildCoalitionLeaderboard([entry("bob", 2, houseC1), entry("alice", 4, houseC21)]);
    expect(r[0].coalition.color).toBe("#599ac2");
  });
});

describe("coalitionGroupOf", () => {
  test("coalitions cursus 21 -> cursus", () => {
    expect(coalitionGroupOf(191)).toBe("cursus");
    expect(coalitionGroupOf(192)).toBe("cursus");
    expect(coalitionGroupOf(193)).toBe("cursus");
  });

  test("coalitions piscine (cursus 9) -> piscine", () => {
    expect(coalitionGroupOf(166)).toBe("piscine");
    expect(coalitionGroupOf(167)).toBe("piscine");
    expect(coalitionGroupOf(168)).toBe("piscine");
  });

  test("cursus legacy (1) -> cursus", () => {
    expect(coalitionGroupOf(188)).toBe("cursus");
  });

  test("ft_id inconnu -> cursus (fallback)", () => {
    expect(coalitionGroupOf(99999)).toBe("cursus");
  });
});
