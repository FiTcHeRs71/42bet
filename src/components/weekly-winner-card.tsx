// Carte mise en avant du meilleur joueur de la semaine (vendredi→vendredi).
// Server component, sans état. Reçoit le gagnant calculé côté page (ou null).
import type { WeeklyEntry } from "@/lib/leaderboard";

export function WeeklyWinnerCard({ winner }: { winner: WeeklyEntry | null }) {
  return (
    <section className="glass rise mb-4 flex items-center gap-4 p-4">
      <span className="text-3xl" aria-hidden>
        🍺
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Bière de la semaine
        </p>
        {winner ? (
          <div className="mt-1 flex items-center gap-3">
            {winner.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={winner.avatarUrl}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <span className="block h-10 w-10 rounded-full bg-white/10" />
            )}
            <span className="min-w-0 flex-1 truncate font-bold">{winner.login}</span>
            <span className="shrink-0 font-semibold tabular-nums text-accent">
              {winner.weeklyPoints} pts
            </span>
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-300">
            Pas encore de gagnant cette semaine
          </p>
        )}
      </div>
    </section>
  );
}
