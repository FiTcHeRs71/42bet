// src/lib/loufoque.ts
// Pari le plus loufoque de la semaine — logique PURE (aucune I/O, aucun temps).
// Le "loufoque" = le score exact (points_awarded = 3, filtré à la source) deviné
// par le MOINS de joueurs sur la semaine. Aucun recalcul de points (rule #7).
// Classement : rareté asc, total de buts desc, login asc. Testée dans
// tests/loufoque.test.ts.

import type { LeaderboardCoalition, LeaderboardPlayer } from "@/lib/leaderboard";

export type LoufoqueBet = {
  user_id: string;
  match_id: string;
  kickoff_at: string;
  home_team: string;
  away_team: string;
  home_score: number; // score réel = score deviné (exact)
  away_score: number;
};

export type LoufoqueWinner = {
  login: string;
  avatarUrl: string | null;
  coalition: LeaderboardCoalition | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  scorersCount: number; // nb de joueurs connus ayant trouvé ce score exact
};

/**
 * Désigne le pari le plus loufoque de la fenêtre [start, end) : le score exact
 * (paris déjà à 3 pts) deviné par le moins de joueurs. Regroupe par match (un
 * match n'a qu'un score exact = son résultat), exclut les user_id sans joueur
 * connu, et trie rareté asc / total buts desc / login asc. Null si aucun
 * candidat.
 */
export function buildLoufoqueBet(
  bets: LoufoqueBet[],
  players: LeaderboardPlayer[],
  weekWindow: { start: Date; end: Date },
): LoufoqueWinner | null {
  const startMs = weekWindow.start.getTime();
  const endMs = weekWindow.end.getTime();
  const playerById = new Map(players.map((p) => [p.id, p]));

  // 1. Regrouper les scoreurs (mappés à un joueur connu) par match, dans la fenêtre.
  type Group = {
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    scorers: LeaderboardPlayer[];
  };
  const byMatch = new Map<string, Group>();
  for (const b of bets) {
    const t = new Date(b.kickoff_at).getTime();
    if (t < startMs || t >= endMs) continue;
    const p = playerById.get(b.user_id);
    if (!p) continue;
    const g = byMatch.get(b.match_id);
    if (g) {
      g.scorers.push(p);
    } else {
      byMatch.set(b.match_id, {
        homeTeam: b.home_team,
        awayTeam: b.away_team,
        homeScore: b.home_score,
        awayScore: b.away_score,
        scorers: [p],
      });
    }
  }

  // 2. Un candidat par match : son scoreur au login le plus petit.
  const candidates = [...byMatch.values()].map((g) => {
    const winner = g.scorers.reduce((a, b) =>
      a.login.localeCompare(b.login) <= 0 ? a : b,
    );
    return {
      login: winner.login,
      avatarUrl: winner.avatar_url,
      coalition: winner.coalition,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      scorersCount: g.scorers.length,
    };
  });

  if (candidates.length === 0) return null;

  // 3. Tri : rareté asc, total de buts desc, login asc (déterministe, gère aussi
  // les égalités entre matchs différents).
  candidates.sort(
    (a, b) =>
      a.scorersCount - b.scorersCount ||
      b.homeScore + b.awayScore - (a.homeScore + a.awayScore) ||
      a.login.localeCompare(b.login),
  );

  return candidates[0];
}
