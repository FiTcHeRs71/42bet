// src/components/match-row.tsx
import { BetForm } from "@/components/bet-form";
import { signIn } from "@/lib/auth/config";
import type { Bet, Match } from "@/lib/types";
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
  bet,
  isAuthenticated,
}: {
  match: Match;
  state: MatchDisplayState;
  bet?: Bet;
  isAuthenticated: boolean;
}) {
  const isFinished = state === "finished";
  const hasScore = match.home_score !== null && match.away_score !== null;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm sm:flex-nowrap sm:gap-4">
      <span className="w-12 shrink-0 tabular-nums text-zinc-400">
        {TIME_FMT.format(new Date(match.kickoff_at))}
      </span>

      <span className="flex flex-1 items-center justify-end gap-2 font-medium">
        <span className="truncate">{match.home_team}</span>
        {match.home_crest_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={match.home_crest_url}
            alt=""
            className="h-5 w-5 shrink-0 rounded-full object-contain ring-1 ring-white/15"
          />
        )}
      </span>

      <span className="w-14 shrink-0 text-center font-bold tabular-nums">
        {isFinished && hasScore
          ? `${match.home_score} - ${match.away_score}`
          : "–"}
      </span>

      <span className="flex flex-1 items-center gap-2 font-medium">
        {match.away_crest_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={match.away_crest_url}
            alt=""
            className="h-5 w-5 shrink-0 rounded-full object-contain ring-1 ring-white/15"
          />
        )}
        <span className="truncate">{match.away_team}</span>
      </span>

      <span className="flex w-full justify-end text-right text-xs text-zinc-400 sm:w-auto sm:min-w-[8rem] sm:shrink-0">
        <BetCell
          match={match}
          state={state}
          bet={bet}
          isAuthenticated={isAuthenticated}
        />
      </span>
    </li>
  );
}

function BetCell({
  match,
  state,
  bet,
  isAuthenticated,
}: {
  match: Match;
  state: MatchDisplayState;
  bet?: Bet;
  isAuthenticated: boolean;
}) {
  // Match à venir : saisie (connecté) ou invite à se connecter.
  if (state === "upcoming") {
    if (!isAuthenticated) {
      return (
        <form
          action={async () => {
            "use server";
            await signIn("42");
          }}
        >
          <button
            type="submit"
            className="text-accent underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Connecte-toi pour parier
          </button>
        </form>
      );
    }
    return (
      <BetForm
        matchId={match.id}
        defaultHome={bet?.home_score}
        defaultAway={bet?.away_score}
      />
    );
  }

  // Match terminé : prono + points gagnés.
  if (state === "finished") {
    if (!bet) return <span>terminé</span>;
    return (
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent">
          {bet.home_score}-{bet.away_score}
        </span>
        {bet.points_awarded !== null && (
          <span className="font-bold text-success">+{bet.points_awarded}</span>
        )}
      </span>
    );
  }

  // En cours : prono figé (lecture seule) si présent.
  if (state === "live") {
    return bet ? (
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent">
          {bet.home_score}-{bet.away_score}
        </span>
        <span className="text-zinc-400">en cours</span>
      </span>
    ) : (
      <span>en cours</span>
    );
  }

  // postponed / cancelled : badge état.
  return <span>{STATE_LABEL[state]}</span>;
}
