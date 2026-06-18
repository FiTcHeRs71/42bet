import { describe, test, expect } from "vitest";

import { buildLoufoqueBet, type LoufoqueBet } from "../src/lib/loufoque";
import type { LeaderboardPlayer } from "../src/lib/leaderboard";

const COA = { ft_id: 192, name: "The Federation", color: "#39c2c2", image_url: null };

function player(
  id: string,
  login: string,
  coalition: LeaderboardPlayer["coalition"] = null,
): LeaderboardPlayer {
  return { id, login, avatar_url: null, total_points: 0, coalition };
}

const WIN = {
  start: new Date("2026-06-18T22:00:00Z"), // vendredi 19/06 00:00 Zurich
  end: new Date("2026-06-25T22:00:00Z"), // vendredi 26/06 00:00 Zurich
};
const IN = "2026-06-20T18:00:00Z"; // dans la fenêtre
const OUT = "2026-06-10T18:00:00Z"; // hors fenêtre

function bet(
  user_id: string,
  match_id: string,
  homeScore: number,
  awayScore: number,
  kickoff_at = IN,
): LoufoqueBet {
  return {
    user_id,
    match_id,
    kickoff_at,
    home_team: `${match_id}-home`,
    away_team: `${match_id}-away`,
    home_score: homeScore,
    away_score: awayScore,
  };
}

describe("buildLoufoqueBet", () => {
  test("aucun pari → null", () => {
    expect(buildLoufoqueBet([], [player("u1", "alice")], WIN)).toBeNull();
  });

  test("pari hors fenêtre ignoré → null", () => {
    const bets = [bet("u1", "m1", 4, 3, OUT)];
    expect(buildLoufoqueBet(bets, [player("u1", "alice")], WIN)).toBeNull();
  });

  test("rareté : 1 scoreur bat 2 scoreurs", () => {
    const players = [player("u1", "alice"), player("u2", "bob"), player("u3", "carol")];
    const bets = [
      bet("u1", "m1", 2, 1), // m1 : alice seule (rareté 1)
      bet("u2", "m2", 0, 0), // m2 : bob + carol (rareté 2)
      bet("u3", "m2", 0, 0),
    ];
    const res = buildLoufoqueBet(bets, players, WIN);
    expect(res?.login).toBe("alice");
    expect(res?.scorersCount).toBe(1);
    expect([res?.homeScore, res?.awayScore]).toEqual([2, 1]);
  });

  test("égalité de rareté → plus de buts gagne", () => {
    const players = [player("u1", "alice"), player("u2", "bob")];
    const bets = [
      bet("u1", "m1", 1, 0), // rareté 1, 1 but
      bet("u2", "m2", 4, 3), // rareté 1, 7 buts
    ];
    const res = buildLoufoqueBet(bets, players, WIN);
    expect(res?.login).toBe("bob");
    expect(res?.homeScore).toBe(4);
    expect(res?.awayScore).toBe(3);
  });

  test("égalité rareté et buts → login départage", () => {
    const players = [player("u1", "zoe"), player("u2", "bob")];
    const bets = [
      bet("u1", "m1", 1, 1), // zoe, rareté 1, 2 buts
      bet("u2", "m2", 1, 1), // bob, rareté 1, 2 buts
    ];
    const res = buildLoufoqueBet(bets, players, WIN);
    expect(res?.login).toBe("bob"); // bob < zoe
  });

  test("user_id sans joueur correspondant → ignoré", () => {
    const players = [player("u1", "alice")];
    const bets = [
      bet("ghost", "m1", 5, 5), // inconnu : gros score mais exclu
      bet("u1", "m2", 1, 0),
    ];
    const res = buildLoufoqueBet(bets, players, WIN);
    expect(res?.login).toBe("alice");
    expect(res?.scorersCount).toBe(1);
  });

  test("plusieurs scoreurs sur le match gagnant : login + scorersCount", () => {
    const players = [player("u1", "zoe"), player("u2", "bob")];
    const bets = [
      bet("u1", "m1", 3, 2),
      bet("u2", "m1", 3, 2),
    ];
    const res = buildLoufoqueBet(bets, players, WIN);
    expect(res?.login).toBe("bob");
    expect(res?.scorersCount).toBe(2);
  });

  test("coalition du joueur transmise", () => {
    const players = [player("u1", "alice", COA)];
    const bets = [bet("u1", "m1", 2, 2)];
    const res = buildLoufoqueBet(bets, players, WIN);
    expect(res?.coalition).toEqual(COA);
  });
});
