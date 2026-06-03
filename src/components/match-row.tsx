// src/components/match-row.tsx
import type { Match } from "@/lib/types";
import type { MatchDisplayState } from "@/lib/match-view";

const STATE_LABEL: Record<Exclude<MatchDisplayState, "finished">, string> = {
  upcoming: "à venir",
  live: "en cours",
  postponed: "reporté",
  cancelled: "annulé",
};

const TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
});

export function MatchRow({
  match,
  state,
}: {
  match: Match;
  state: MatchDisplayState;
}) {
  const isFinished = state === "finished";
  const hasScore =
    match.home_score !== null && match.away_score !== null;

  return (
    <li className="flex items-center gap-4 px-4 py-3 text-sm">
      <span className="w-12 shrink-0 tabular-nums text-zinc-500">
        {TIME_FMT.format(new Date(match.kickoff_at))}
      </span>

      <span className="flex-1 text-right font-medium">{match.home_team}</span>

      <span className="w-14 shrink-0 text-center tabular-nums font-semibold">
        {isFinished && hasScore
          ? `${match.home_score} - ${match.away_score}`
          : "–"}
      </span>

      <span className="flex-1 font-medium">{match.away_team}</span>

      <span className="w-16 shrink-0 text-right text-xs text-zinc-500">
        {isFinished ? "terminé" : STATE_LABEL[state]}
      </span>
    </li>
  );
}
