// src/app/profile/[login]/page.tsx
import { notFound } from "next/navigation";

import { CoalitionBadge } from "@/components/coalition-badge";
import { listAllBets, listBetsWithMatchByUser } from "@/lib/bets";
import { buildLeaderboard } from "@/lib/leaderboard";
import { buildProfileHistory, type ProfileOutcome } from "@/lib/profile";
import { listPlayers } from "@/lib/users";

// Les points + rang évoluent après chaque match : rendu jamais figé.
export const dynamic = "force-dynamic";

const PCT_FMT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});

const OUTCOME: Record<ProfileOutcome, { label: string; cls: string }> = {
  exact: { label: "Score exact", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  good: { label: "Bon résultat", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  miss: { label: "Raté", cls: "bg-zinc-500/15 text-zinc-500" },
  pending: { label: "En attente", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-500" },
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ login: string }>;
}) {
  const { login } = await params;

  const [players, allBets] = await Promise.all([listPlayers(), listAllBets()]);
  const player = players.find((p) => p.login === login);
  if (!player) notFound();

  const entry =
    buildLeaderboard(players, allBets).find((e) => e.login === login) ?? null;
  const history = buildProfileHistory(await listBetsWithMatchByUser(player.id));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      {/* En-tête */}
      <header className="mb-6 flex items-center gap-4">
        {player.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.avatar_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="h-16 w-16 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {player.login}
          </h1>
          <div className="mt-1">
            <CoalitionBadge coalition={player.coalition} size="md" />
          </div>
        </div>
      </header>

      {/* Stats */}
      <dl className="mb-8 grid grid-cols-4 gap-3 text-center">
        <Stat label="Rang" value={entry ? `#${entry.rank}` : "—"} />
        <Stat label="Points" value={entry ? `${entry.points}` : "0"} />
        <Stat
          label="Réussite"
          value={
            entry && entry.accuracy !== null
              ? PCT_FMT.format(entry.accuracy)
              : "—"
          }
        />
        <Stat label="Pronos" value={entry ? `${entry.bets}` : "0"} />
      </dl>

      {/* Timeline */}
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
        Historique
      </h2>
      {history.length === 0 ? (
        <p className="text-zinc-500">Aucun pronostic pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => {
            const o = OUTCOME[h.outcome];
            const finished = h.actualHome !== null && h.actualAway !== null;
            return (
              <li
                key={h.matchId}
                className="flex items-center gap-3 rounded-lg border border-black/10 px-4 py-3 text-sm dark:border-white/10"
              >
                <span className="flex-1 truncate">
                  {h.homeTeam} <span className="text-zinc-400">vs</span>{" "}
                  {h.awayTeam}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-500">
                  prono {h.predictedHome}–{h.predictedAway}
                </span>
                <span className="w-14 shrink-0 text-right tabular-nums font-medium">
                  {finished ? `${h.actualHome}–${h.actualAway}` : "—"}
                </span>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${o.cls}`}
                >
                  {o.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-black/10 px-2 py-3 dark:border-white/10">
      <dt className="text-[11px] uppercase tracking-wide text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
