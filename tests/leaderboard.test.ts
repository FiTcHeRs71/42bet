// tests/leaderboard.test.ts
import { describe, test, expect } from "vitest";

import {
  assignRanks,
  buildCampStandings,
  buildCoalitionLeaderboard,
  buildLeaderboard,
  buildProfileRanks,
  buildWeeklyLeaderboard,
  type CampStanding,
  type LeaderboardBet,
  type LeaderboardEntry,
  type LeaderboardPlayer,
  type WeeklyBet,
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

describe("assignRanks", () => {
  function entry(login: string, points: number): Omit<LeaderboardEntry, "rank"> {
    return { login, avatarUrl: null, coalition: null, points, bets: 1, accuracy: null };
  }

  test("[] -> []", () => {
    expect(assignRanks([])).toEqual([]);
  });

  test("rang standard 1,1,3 et recalcule un rang préexistant", () => {
    const r = assignRanks([entry("a", 5), entry("b", 5), entry("c", 2)]);
    expect(r.map((e) => e.rank)).toEqual([1, 1, 3]);
  });

  test("ignore un rang préexistant sur une entrée déjà classée", () => {
    // Entrées portant un rang global périmé (7, 9) : assignRanks doit les
    // re-classer 1,2 sans laisser le rang préexistant l'emporter.
    const stale: LeaderboardEntry[] = [
      { rank: 7, login: "a", avatarUrl: null, coalition: null, points: 5, bets: 1, accuracy: null },
      { rank: 9, login: "b", avatarUrl: null, coalition: null, points: 2, bets: 1, accuracy: null },
    ];
    expect(assignRanks(stale).map((e) => e.rank)).toEqual([1, 2]);
  });
});

describe("buildCampStandings", () => {
  const cursusCoa = { ft_id: 192, name: "House of Threads", color: "#599ac2", image_url: null };
  const piscineCoa = { ft_id: 167, name: "The Frogs", color: "#6c8946", image_url: null };

  function e(points: number, coalition: LeaderboardEntry["coalition"]): LeaderboardEntry {
    return { rank: 0, login: "x", avatarUrl: null, coalition, points, bets: 1, accuracy: null };
  }

  test("classe à la moyenne : petit camp peut devancer un grand", () => {
    const r: CampStanding[] = buildCampStandings([
      e(10, cursusCoa), e(10, cursusCoa), e(2, cursusCoa), // students moy = 22/3 ≈ 7.33
      e(9, piscineCoa), e(9, piscineCoa),                  // piscineux moy = 9
    ]);
    expect(r.map((c) => c.label)).toEqual(["Piscineux", "Students"]);
    expect(r.map((c) => c.rank)).toEqual([1, 2]);
    expect(r[0]).toMatchObject({ camp: "piscine", players: 2, totalPoints: 18, average: 9 });
  });

  test("exclut les joueurs sans coalition", () => {
    const r = buildCampStandings([e(5, cursusCoa), e(99, null)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ camp: "cursus", players: 1, totalPoints: 5 });
  });

  test("un seul camp présent -> length 1", () => {
    const r = buildCampStandings([e(3, piscineCoa)]);
    expect(r).toHaveLength(1);
    expect(r[0].label).toBe("Piscineux");
  });

  test("aucune entry -> []", () => {
    expect(buildCampStandings([])).toEqual([]);
  });
});

describe("buildProfileRanks", () => {
  const threads = { ft_id: 192, name: "House of Threads", color: "#599ac2", image_url: null };
  const cores = { ft_id: 191, name: "House of Cores", color: "#B23256", image_url: null };
  const frogs = { ft_id: 167, name: "The Frogs", color: "#6c8946", image_url: null };

  function entry(
    login: string,
    points: number,
    coalition: LeaderboardEntry["coalition"],
  ): Omit<LeaderboardEntry, "rank"> {
    return { login, avatarUrl: null, coalition, points, bets: 1, accuracy: null };
  }

  const entries: LeaderboardEntry[] = assignRanks([
    entry("alice", 10, cores),
    entry("bob", 8, threads),
    entry("carol", 6, threads),
    entry("dan", 4, frogs),
    entry("eve", 2, frogs),
  ]);

  test("rangs général / camp / coalition + totaux (joueur cursus)", () => {
    const r = buildProfileRanks(entries, "carol");
    expect(r.general).toEqual({ rank: 3, total: 5 });
    expect(r.camp).toEqual({ rank: 3, total: 3, label: "Students" });
    expect(r.coalition).toEqual({ rank: 2, total: 2, name: "House of Threads" });
  });

  test("joueur piscine : camp Piscineux, coalition Frogs", () => {
    const r = buildProfileRanks(entries, "dan");
    expect(r.general).toEqual({ rank: 4, total: 5 });
    expect(r.camp).toEqual({ rank: 1, total: 2, label: "Piscineux" });
    expect(r.coalition).toEqual({ rank: 1, total: 2, name: "The Frogs" });
  });

  test("joueur sans coalition : camp et coalition null", () => {
    const withSolo = assignRanks([
      entry("alice", 10, cores),
      entry("solo", 5, null),
    ] as Parameters<typeof assignRanks>[0]);
    const r = buildProfileRanks(withSolo, "solo");
    expect(r.general).toEqual({ rank: 2, total: 2 });
    expect(r.camp).toBeNull();
    expect(r.coalition).toBeNull();
  });

  test("joueur absent (0 prono) : tout null", () => {
    const r = buildProfileRanks(entries, "ghost");
    expect(r.general).toBeNull();
    expect(r.camp).toBeNull();
    expect(r.coalition).toBeNull();
  });
});

describe("buildWeeklyLeaderboard", () => {
  const WIN = {
    start: new Date("2026-06-18T22:00:00Z"), // vendredi 19/06 00:00 Zurich
    end: new Date("2026-06-25T22:00:00Z"), // vendredi 26/06 00:00 Zurich
  };
  // Un kickoff dans la fenêtre et un hors fenêtre.
  const IN = "2026-06-20T18:00:00Z";
  const OUT = "2026-06-10T18:00:00Z";

  test("aucun pari → []", () => {
    expect(buildWeeklyLeaderboard([], [player("u1", "alice")], WIN)).toEqual([]);
  });

  test("somme les points de la fenêtre, ignore le hors-fenêtre", () => {
    const players = [player("u1", "alice"), player("u2", "bob")];
    const bets: WeeklyBet[] = [
      { user_id: "u1", points_awarded: 3, kickoff_at: IN },
      { user_id: "u1", points_awarded: 1, kickoff_at: IN },
      { user_id: "u1", points_awarded: 3, kickoff_at: OUT }, // ignoré
      { user_id: "u2", points_awarded: 1, kickoff_at: IN },
    ];
    const res = buildWeeklyLeaderboard(bets, players, WIN);
    expect(res.map((e) => [e.login, e.weeklyPoints, e.rank])).toEqual([
      ["alice", 4, 1],
      ["bob", 1, 2],
    ]);
  });

  test("exclut les joueurs à 0 pt sur la semaine", () => {
    const players = [player("u1", "alice"), player("u2", "bob")];
    const bets: WeeklyBet[] = [
      { user_id: "u1", points_awarded: 3, kickoff_at: IN },
      { user_id: "u2", points_awarded: 0, kickoff_at: IN }, // a parié, rien gagné
    ];
    const res = buildWeeklyLeaderboard(bets, players, WIN);
    expect(res.map((e) => e.login)).toEqual(["alice"]);
  });

  test("égalité → rang standard (1,1,3) + départage par login", () => {
    const players = [
      player("u1", "alice"),
      player("u2", "bob"),
      player("u3", "carol"),
    ];
    const bets: WeeklyBet[] = [
      { user_id: "u1", points_awarded: 3, kickoff_at: IN },
      { user_id: "u2", points_awarded: 3, kickoff_at: IN },
      { user_id: "u3", points_awarded: 1, kickoff_at: IN },
    ];
    const res = buildWeeklyLeaderboard(bets, players, WIN);
    expect(res.map((e) => [e.login, e.rank])).toEqual([
      ["alice", 1],
      ["bob", 1],
      ["carol", 3],
    ]);
  });

  test("user_id sans joueur correspondant → ignoré", () => {
    const players = [player("u1", "alice")];
    const bets: WeeklyBet[] = [
      { user_id: "u1", points_awarded: 1, kickoff_at: IN },
      { user_id: "ghost", points_awarded: 3, kickoff_at: IN },
    ];
    const res = buildWeeklyLeaderboard(bets, players, WIN);
    expect(res.map((e) => e.login)).toEqual(["alice"]);
  });
});
