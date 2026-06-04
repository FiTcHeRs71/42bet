// src/lib/leaderboard.ts
// Construction du classement général — logique PURE (aucune I/O, aucun temps).
// Agrège les pronos notés par le cron (points_awarded) sans JAMAIS recalculer de
// points (rule #7) : on additionne des valeurs déjà attribuées. Tri + ex æquo +
// taux de réussite testés dans tests/leaderboard.test.ts.

export type LeaderboardPlayer = {
  id: string;
  login: string;
  avatar_url: string | null;
  coalition: { name: string; color: string; image_url: string | null } | null;
};

export type LeaderboardBet = {
  user_id: string;
  points_awarded: number | null;
};

export type LeaderboardEntry = {
  rank: number;
  login: string;
  avatarUrl: string | null;
  coalition: { name: string; color: string; image_url: string | null } | null;
  points: number; // somme des points_awarded (null compté 0)
  bets: number; // nb total de pronos
  accuracy: number | null; // 0..1 ; null si aucun prono noté
};

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
      let points = 0;
      let scored = 0;
      let wins = 0;
      for (const b of userBets) {
        if (b.points_awarded !== null) {
          points += b.points_awarded;
          scored += 1;
          if (b.points_awarded > 0) wins += 1;
        }
      }
      return {
        login: p.login,
        avatarUrl: p.avatar_url,
        coalition: p.coalition,
        points,
        bets: userBets.length,
        accuracy: scored > 0 ? wins / scored : null,
      };
    });

  // 3. Tri : points décroissants, puis login croissant (départage déterministe).
  aggregated.sort(
    (a, b) => b.points - a.points || a.login.localeCompare(b.login),
  );

  // 4. Rang standard (1,1,3) : même rang à points égaux, le suivant saute.
  let lastPoints: number | null = null;
  let lastRank = 0;
  return aggregated.map((entry, index) => {
    const rank =
      lastPoints !== null && entry.points === lastPoints ? lastRank : index + 1;
    lastPoints = entry.points;
    lastRank = rank;
    return { rank, ...entry };
  });
}

export type CoalitionStanding = {
  rank: number;
  coalition: { name: string; color: string; image_url: string | null };
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
