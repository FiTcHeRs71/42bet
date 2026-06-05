// src/app/leaderboard/page.tsx
import Link from "next/link";

import { CoalitionBadge } from "@/components/coalition-badge";
import { listAllBets } from "@/lib/bets";
import {
  buildCoalitionLeaderboard,
  buildLeaderboard,
} from "@/lib/leaderboard";
import { listPlayers } from "@/lib/users";

// Les points évoluent après chaque match : le rendu ne doit pas être figé.
export const dynamic = "force-dynamic";

const PCT_FMT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});

const AVG_FMT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export default async function LeaderboardPage() {
  const [players, bets] = await Promise.all([listPlayers(), listAllBets()]);
  const entries = buildLeaderboard(players, bets);
  const coalitions = buildCoalitionLeaderboard(entries);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Classement</h1>

      {entries.length === 0 ? (
        <p className="text-zinc-400">Aucun pronostic pour l&apos;instant.</p>
      ) : (
        <>
          {coalitions.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
                Par coalition
              </h2>
              <ul className="glass divide-y divide-white/5 overflow-hidden">
                {coalitions.map((c) => (
                  <li
                    key={c.coalition.name}
                    className="flex items-center gap-3 px-4 py-3 text-sm"
                  >
                    <span className="w-6 shrink-0 text-center font-bold tabular-nums text-zinc-400">
                      {c.rank}
                    </span>
                    <CoalitionBadge coalition={c.coalition} size="md" />
                    <span className="flex-1" />
                    <span className="shrink-0 text-right font-semibold tabular-nums">
                      {AVG_FMT.format(c.average)} pt/j
                    </span>
                    <span className="w-14 shrink-0 text-right tabular-nums text-zinc-400">
                      {c.totalPoints} pt
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-zinc-400">
                      {c.players} {c.players > 1 ? "joueurs" : "joueur"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
            Individuel
          </h2>
          <div className="flex items-center gap-3 px-4 pb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            <span className="w-6" />
            <span className="w-8" />
            <span className="flex-1">Joueur</span>
            <span className="w-14 text-right">Réussite</span>
            <span className="w-10 text-right">Pronos</span>
            <span className="w-12 text-right">Points</span>
          </div>

          <ul className="glass divide-y divide-white/5 overflow-hidden">
            {entries.map((e) => (
              <li
                key={e.login}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <span
                  className={`w-6 shrink-0 text-center font-bold tabular-nums ${
                    e.rank <= 3 ? "text-accent" : "text-zinc-400"
                  }`}
                >
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
                  <span className="h-8 w-8 shrink-0 rounded-full bg-white/10" />
                )}
                <Link
                  href={`/profile/${e.login}`}
                  className="flex-1 truncate font-medium transition-colors hover:text-accent"
                >
                  {e.login}
                </Link>
                <CoalitionBadge coalition={e.coalition} size="sm" />
                <span className="w-14 shrink-0 text-right tabular-nums">
                  {e.accuracy === null ? "—" : PCT_FMT.format(e.accuracy)}
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums text-zinc-400">
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
