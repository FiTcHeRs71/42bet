// Carte du pari le plus loufoque de la semaine : le score exact deviné par le
// moins de joueurs. Server component, sans état. Reçoit le gagnant (ou null).
import Link from "next/link";

import { CoalitionBadge } from "@/components/coalition-badge";
import type { LoufoqueWinner } from "@/lib/loufoque";

export function LoufoqueBetCard({
  loufoque,
}: {
  loufoque: LoufoqueWinner | null;
}) {
  return (
    <section className="glass rise mb-4 flex items-center gap-4 p-4">
      <span className="text-3xl" aria-hidden>
        🎯
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Sniper de la semaine
        </p>
        {loufoque ? (
          <div className="mt-1 flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <Link
                href={`/profile/${loufoque.login}`}
                aria-label={`Profil de ${loufoque.login}`}
                className="shrink-0 rounded-full ring-white/0 transition-shadow hover:ring-2 hover:ring-accent/60"
              >
                {loufoque.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={loufoque.avatarUrl}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="block h-10 w-10 rounded-full bg-white/10" />
                )}
              </Link>
              <Link
                href={`/profile/${loufoque.login}`}
                className="min-w-0 flex-1 truncate font-bold transition-colors hover:text-accent"
              >
                {loufoque.login}
              </Link>
              <CoalitionBadge coalition={loufoque.coalition} size="sm" />
            </div>
            <p className="text-sm text-zinc-300">
              <span className="font-semibold">
                {loufoque.homeTeam} {loufoque.homeScore}–{loufoque.awayScore}{" "}
                {loufoque.awayTeam}
              </span>{" "}
              —{" "}
              {loufoque.scorersCount === 1
                ? "seul à avoir trouvé le score exact"
                : `l'un des ${loufoque.scorersCount} à avoir trouvé le score exact`}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-300">
            Pas encore de sniper cette semaine 🎯
          </p>
        )}
      </div>
    </section>
  );
}
