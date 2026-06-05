// src/app/page.tsx
import Link from "next/link";

import { auth } from "@/lib/auth/config";
import { listMatches } from "@/lib/matches";
import { displayState } from "@/lib/match-view";
import { listAllBets } from "@/lib/bets";
import { listPlayers } from "@/lib/users";
import { buildLeaderboard } from "@/lib/leaderboard";
import { CoalitionBadge } from "@/components/coalition-badge";

// Points + matchs à venir évoluent en continu : rendu jamais figé.
export const dynamic = "force-dynamic";

const TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Zurich",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function Home() {
  const now = new Date();
  const [session, matches, players, bets] = await Promise.all([
    auth(),
    listMatches(),
    listPlayers(),
    listAllBets(),
  ]);

  const upcoming = matches
    .filter((m) => displayState(m, now) === "upcoming")
    .slice(0, 3);
  const top3 = buildLeaderboard(players, bets).slice(0, 3);
  const login = session?.user?.login ?? null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <section className="glass rise mb-6 p-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          42<span className="text-cyan">Bet</span>
        </h1>
        <p className="mt-2 text-zinc-400">
          Pronostics Coupe du Monde — École 42 Lausanne
        </p>
        {login ? (
          <p className="mt-3">
            Salut <strong>{login}</strong> 👋
          </p>
        ) : (
          <p className="mt-3 text-zinc-300">
            Connecte-toi avec ton compte 42 pour parier.
          </p>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="glass p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">
            Prochains matchs
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-zinc-500">Rien à venir.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {upcoming.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {m.home_team} <span className="text-zinc-500">—</span>{" "}
                    {m.away_team}
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-400">
                    {TIME_FMT.format(new Date(m.kickoff_at))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/matches"
            className="mt-3 inline-block text-sm text-accent hover:underline"
          >
            Voir tous les matchs →
          </Link>
        </section>

        <section className="glass p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">
            Top classement
          </h2>
          {top3.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucun pronostic.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {top3.map((e) => (
                <li key={e.login} className="flex items-center gap-2">
                  <span className="w-4 text-center font-bold tabular-nums text-accent">
                    {e.rank}
                  </span>
                  <Link
                    href={`/profile/${e.login}`}
                    className="flex-1 truncate font-medium hover:text-accent"
                  >
                    {e.login}
                  </Link>
                  <CoalitionBadge coalition={e.coalition} size="sm" />
                  <span className="shrink-0 font-semibold tabular-nums">
                    {e.points} pt
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/leaderboard"
            className="mt-3 inline-block text-sm text-accent hover:underline"
          >
            Voir le classement →
          </Link>
        </section>
      </div>
    </main>
  );
}
