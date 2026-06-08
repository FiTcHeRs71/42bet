// src/lib/leaderboard.ts
// Construction du classement général — logique PURE (aucune I/O, aucun temps).
// Les points proviennent de users.total_points (colonne dénormalisée maintenue
// atomiquement par la fonction Postgres score_match) — aucun recalcul de points
// (rule #7). Les pronos ne servent qu'au comptage et au taux de réussite. Tri +
// ex æquo + accuracy testés dans tests/leaderboard.test.ts.

import { COALITION_CURSUS_PRIORITY, coalitionGroupOf, type CoalitionGroup } from "@/lib/coalitions";

export type LeaderboardCoalition = {
  ft_id: number;
  name: string;
  color: string;
  image_url: string | null;
};

export type LeaderboardPlayer = {
  id: string;
  login: string;
  avatar_url: string | null;
  total_points: number;
  coalition: LeaderboardCoalition | null;
};

export type LeaderboardBet = {
  user_id: string;
  points_awarded: number | null;
};

export type LeaderboardEntry = {
  rank: number;
  login: string;
  avatarUrl: string | null;
  coalition: LeaderboardCoalition | null;
  points: number; // users.total_points (dénormalisé par score_match)
  bets: number; // nb total de pronos
  accuracy: number | null; // 0..1 ; null si aucun prono noté
};

/**
 * Applique le rang standard (1,1,3) à une liste DÉJÀ triée par points
 * décroissants. Recalcule `rank` à partir de l'ordre, en ignorant tout rang
 * préexistant — réutilisable pour re-classer un sous-ensemble filtré.
 */
export function assignRanks(
  entries: Omit<LeaderboardEntry, "rank">[],
): LeaderboardEntry[] {
  let lastPoints: number | null = null;
  let lastRank = 0;
  return entries.map((entry, index) => {
    const rank =
      lastPoints !== null && entry.points === lastPoints ? lastRank : index + 1;
    lastPoints = entry.points;
    lastRank = rank;
    return { rank, ...entry };
  });
}

export function buildLeaderboard(
  players: LeaderboardPlayer[],
  bets: LeaderboardBet[],
): LeaderboardEntry[] {
  // 1. Regrouper les pronos par joueur.
  const betsByUser = new Map<string, LeaderboardBet[]>();
  for (const bet of bets) {
    const list = betsByUser.get(bet.user_id);
    if (list) list.push(bet);
    else betsByUser.set(bet.user_id, [bet]);
  }

  // 2. Agréger uniquement les joueurs ayant au moins un prono.
  const aggregated = players
    .filter((p) => betsByUser.has(p.id))
    .map((p) => {
      const userBets = betsByUser.get(p.id)!;
      let scored = 0;
      let wins = 0;
      for (const b of userBets) {
        if (b.points_awarded !== null) {
          scored += 1;
          if (b.points_awarded > 0) wins += 1;
        }
      }
      return {
        login: p.login,
        avatarUrl: p.avatar_url,
        coalition: p.coalition,
        points: p.total_points, // source de vérité dénormalisée (score_match)
        bets: userBets.length,
        accuracy: scored > 0 ? wins / scored : null,
      };
    });

  // 3. Tri : points décroissants, puis login croissant (départage déterministe).
  aggregated.sort(
    (a, b) => b.points - a.points || a.login.localeCompare(b.login),
  );

  // 4. Rang standard (1,1,3) : même rang à points égaux, le suivant saute.
  return assignRanks(aggregated);
}

export type CoalitionStanding = {
  rank: number;
  coalition: LeaderboardCoalition;
  totalPoints: number;
  players: number; // nb de parieurs actifs de la coalition
  average: number; // totalPoints / players (float, arrondi à l'affichage)
};

/**
 * Classement des coalitions à la moyenne de points par parieur actif. Agrège la
 * sortie de buildLeaderboard (déjà filtrée aux parieurs actifs) — aucun recalcul
 * de points (rule #7). Exclut les joueurs sans coalition. Testée dans
 * tests/leaderboard.test.ts.
 */
export function buildCoalitionLeaderboard(
  entries: LeaderboardEntry[],
): CoalitionStanding[] {
  // 1. Regrouper par coalition (clé = nom, unique par campus), exclure les nuls.
  const byName = new Map<
    string,
    {
      coalition: NonNullable<LeaderboardEntry["coalition"]>;
      totalPoints: number;
      players: number;
    }
  >();
  for (const e of entries) {
    if (e.coalition === null) continue;
    const acc = byName.get(e.coalition.name);
    if (acc) {
      acc.totalPoints += e.points;
      acc.players += 1;
      // Couleur/logo canoniques = coalition de cursus le plus prioritaire (21>9>1).
      const cur = COALITION_CURSUS_PRIORITY[acc.coalition.ft_id] ?? 0;
      const cand = COALITION_CURSUS_PRIORITY[e.coalition.ft_id] ?? 0;
      if (cand > cur) acc.coalition = e.coalition;
    } else {
      byName.set(e.coalition.name, {
        coalition: e.coalition,
        totalPoints: e.points,
        players: 1,
      });
    }
  }

  // 2. Moyenne par coalition.
  const aggregated = [...byName.values()].map((a) => ({
    coalition: a.coalition,
    totalPoints: a.totalPoints,
    players: a.players,
    average: a.totalPoints / a.players,
  }));

  // 3. Tri : moyenne décroissante, départage total décroissant puis nom croissant.
  aggregated.sort(
    (a, b) =>
      b.average - a.average ||
      b.totalPoints - a.totalPoints ||
      a.coalition.name.localeCompare(b.coalition.name),
  );

  // 4. Rang standard (1,1,3) sur la moyenne : même rang à moyenne égale.
  let lastAvg: number | null = null;
  let lastRank = 0;
  return aggregated.map((entry, index) => {
    const rank =
      lastAvg !== null && entry.average === lastAvg ? lastRank : index + 1;
    lastAvg = entry.average;
    lastRank = rank;
    return { rank, ...entry };
  });
}

export type CampStanding = {
  rank: number;
  camp: CoalitionGroup;
  label: string; // "Students" | "Piscineux"
  totalPoints: number;
  players: number; // parieurs actifs du camp
  average: number; // totalPoints / players
};

const CAMP_LABEL: Record<CoalitionGroup, string> = {
  cursus: "Students",
  piscine: "Piscineux",
};

/**
 * Classement des 2 camps (Students vs Piscineux) à la moyenne de points par
 * parieur actif. Agrège la sortie de buildLeaderboard ; exclut les joueurs sans
 * coalition. Aucun recalcul de points (rule #7).
 */
export function buildCampStandings(entries: LeaderboardEntry[]): CampStanding[] {
  const byCamp = new Map<CoalitionGroup, { totalPoints: number; players: number }>();
  for (const e of entries) {
    if (e.coalition === null) continue;
    const camp = coalitionGroupOf(e.coalition.ft_id);
    const acc = byCamp.get(camp);
    if (acc) {
      acc.totalPoints += e.points;
      acc.players += 1;
    } else {
      byCamp.set(camp, { totalPoints: e.points, players: 1 });
    }
  }

  const aggregated = [...byCamp.entries()].map(([camp, a]) => ({
    camp,
    label: CAMP_LABEL[camp],
    totalPoints: a.totalPoints,
    players: a.players,
    average: a.totalPoints / a.players,
  }));

  aggregated.sort(
    (a, b) => b.average - a.average || b.totalPoints - a.totalPoints,
  );

  let lastAvg: number | null = null;
  let lastRank = 0;
  return aggregated.map((entry, index) => {
    const rank =
      lastAvg !== null && entry.average === lastAvg ? lastRank : index + 1;
    lastAvg = entry.average;
    lastRank = rank;
    return { rank, ...entry };
  });
}
