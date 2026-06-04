// src/app/leaderboard/page.tsx
import { CoalitionBadge } from "@/components/coalition-badge";
import { listAllBets } from "@/lib/bets";
import { buildLeaderboard } from "@/lib/leaderboard";
import { listPlayers } from "@/lib/users";

// Les points évoluent après chaque match : le rendu ne doit pas être figé.
export const dynamic = "force-dynamic";

const PCT_FMT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});

export default async function LeaderboardPage() {
  const [players, bets] = await Promise.all([listPlayers(), listAllBets()]);
  const entries = buildLeaderboard(players, bets);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Classement</h1>

      {entries.length === 0 ? (
        <p className="text-zinc-500">Aucun pronostic pour l&apos;instant.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 px-4 pb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            <span className="w-6" />
            <span className="w-8" />
            <span className="flex-1">Joueur</span>
            <span className="w-14 text-right">Réussite</span>
            <span className="w-10 text-right">Pronos</span>
            <span className="w-12 text-right">Points</span>
          </div>

          <ul className="divide-y divide-black/5 rounded-lg border border-black/10 dark:divide-white/5 dark:border-white/10">
            {entries.map((e) => (
              <li
                key={e.login}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <span className="w-6 shrink-0 text-center font-semibold tabular-nums text-zinc-500">
                  {e.rank}
                </span>
                {e.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.avatarUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                )}
                <span className="flex-1 truncate font-medium">{e.login}</span>
                <CoalitionBadge coalition={e.coalition} size="sm" />
                <span className="w-14 shrink-0 text-right tabular-nums">
                  {e.accuracy === null ? "—" : PCT_FMT.format(e.accuracy)}
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums text-zinc-500">
                  {e.bets}
                </span>
                <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
                  {e.points} pt
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
