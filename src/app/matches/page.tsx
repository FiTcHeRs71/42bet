// src/app/matches/page.tsx
import { MatchRow } from "@/components/match-row";
import { listMatches } from "@/lib/matches";
import { displayState, groupByDay } from "@/lib/match-view";

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Zurich",
  weekday: "long",
  day: "numeric",
  month: "long",
});

export default async function MatchesPage() {
  const matches = await listMatches();
  const now = new Date();
  const days = groupByDay(matches);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Matchs</h1>

      {days.length === 0 ? (
        <p className="text-zinc-500">Aucun match pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {days.map((day) => (
            <section key={day.dayKey}>
              <h2 className="mb-2 text-sm font-semibold capitalize text-zinc-500">
                {DAY_FMT.format(new Date(day.matches[0].kickoff_at))}
              </h2>
              <ul className="divide-y divide-black/5 rounded-lg border border-black/10 dark:divide-white/5 dark:border-white/10">
                {day.matches.map((match) => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    state={displayState(match, now)}
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
