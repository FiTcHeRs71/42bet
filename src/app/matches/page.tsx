// src/app/matches/page.tsx
import { MatchRow } from "@/components/match-row";
import { requireSession } from "@/lib/auth/require-session";
import { listMyBets } from "@/lib/bets";
import { listMatches } from "@/lib/matches";
import { displayState, groupByDay } from "@/lib/match-view";
import { resolveUserId } from "@/lib/users";
import type { Bet } from "@/lib/types";

// Les états d'affichage (à venir / en cours / terminé) dépendent de `now`, et la
// page lit les pronos privés du joueur connecté : le rendu doit rester dynamique.
export const dynamic = "force-dynamic";

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Zurich",
  weekday: "long",
  day: "numeric",
  month: "long",
});

export default async function MatchesPage() {
  const [matches, session] = await Promise.all([listMatches(), requireSession()]);

  // Pronos du joueur connecté, indexés par match_id (lecture privée après auth()).
  const betsByMatch = new Map<string, Bet>();
  if (session?.user?.ftId) {
    const userId = await resolveUserId(session.user.ftId);
    if (userId) {
      for (const bet of await listMyBets(userId)) {
        betsByMatch.set(bet.match_id, bet);
      }
    }
  }
  const isAuthenticated = Boolean(session?.user?.ftId);

  const now = new Date();
  const days = groupByDay(matches);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Matchs</h1>

      {days.length === 0 ? (
        <p className="text-zinc-400">Aucun match pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => (
            <section key={day.dayKey} className="rise">
              <h2 className="mb-2 px-1 text-sm font-semibold capitalize text-zinc-400">
                {DAY_FMT.format(new Date(day.matches[0].kickoff_at))}
              </h2>
              <ul className="glass divide-y divide-white/5 overflow-hidden">
                {day.matches.map((match) => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    state={displayState(match, now)}
                    bet={betsByMatch.get(match.id)}
                    isAuthenticated={isAuthenticated}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
