// src/app/leaderboard/page.tsx
import { coalitionGroupOf } from "@/lib/coalitions";
import {
  LeaderboardTabs,
  type CoalitionViews,
  type PlayerViews,
} from "@/components/leaderboard-tabs";
import { listAllBets } from "@/lib/bets";
import {
  assignRanks,
  buildCampStandings,
  buildCoalitionLeaderboard,
  buildLeaderboard,
  type LeaderboardEntry,
} from "@/lib/leaderboard";
import { listPlayers } from "@/lib/users";

// Les points évoluent après chaque match : le rendu ne doit pas être figé.
export const dynamic = "force-dynamic";

function inGroup(e: LeaderboardEntry, group: "cursus" | "piscine"): boolean {
  return e.coalition !== null && coalitionGroupOf(e.coalition.ft_id) === group;
}

export default async function LeaderboardPage() {
  const [players, bets] = await Promise.all([listPlayers(), listAllBets()]);
  const entries = buildLeaderboard(players, bets);

  const cursusEntries = entries.filter((e) => inGroup(e, "cursus"));
  const piscineEntries = entries.filter((e) => inGroup(e, "piscine"));

  const coalitions: CoalitionViews = {
    all: buildCoalitionLeaderboard(entries),
    cursus: buildCoalitionLeaderboard(cursusEntries),
    piscine: buildCoalitionLeaderboard(piscineEntries),
  };
  const playerViews: PlayerViews = {
    all: entries,
    students: assignRanks(cursusEntries),
    piscineux: assignRanks(piscineEntries),
  };
  const camps = buildCampStandings(entries);

  return (
    <main className="rise mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Classement</h1>

      {entries.length === 0 ? (
        <p className="text-zinc-400">Aucun pronostic pour l&apos;instant.</p>
      ) : (
        <LeaderboardTabs
          coalitions={coalitions}
          camps={camps}
          players={playerViews}
        />
      )}
    </main>
  );
}
