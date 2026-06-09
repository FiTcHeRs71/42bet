// src/app/profile/[login]/page.tsx
import { notFound } from "next/navigation";

import { CoalitionBadge } from "@/components/coalition-badge";
import { listAllBets, listBetsWithMatchByUser } from "@/lib/bets";
import { buildLeaderboard, buildProfileRanks, type ProfileRanks } from "@/lib/leaderboard";
import {
  buildProfileHistory,
  countOutcomes,
  partitionHistory,
  type ProfileHistoryEntry,
  type ProfileOutcome,
} from "@/lib/profile";
import { listPlayers } from "@/lib/users";

// Les points + rang évoluent après chaque match : rendu jamais figé.
export const dynamic = "force-dynamic";

const PCT_FMT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

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

  const entries = buildLeaderboard(players, allBets);
  const entry = entries.find((e) => e.login === login) ?? null;
  const ranks = buildProfileRanks(entries, login);
  const history = buildProfileHistory(await listBetsWithMatchByUser(player.id));
  const counts = countOutcomes(history);
  const { pending, played } = partitionHistory(history);

  return (
    <main className="rise mx-auto w-full max-w-2xl flex-1 p-6">
      {/* En-tête */}
      <header className="glass mb-6 flex items-center gap-4 p-4">
        {player.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.avatar_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-white/15"
          />
        ) : (
          <span className="h-16 w-16 shrink-0 rounded-full bg-white/10" />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {player.login}
          </h1>
          <div className="mt-1">
            <CoalitionBadge coalition={player.coalition} size="md" />
          </div>
          <RankLine ranks={ranks} />
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

      {/* Chips de ventilation */}
      {history.length > 0 && (
        <div className="mb-8 flex gap-3">
          <OutcomeChip n={counts.exact} label="scores exacts" cls={OUTCOME.exact.cls} />
          <OutcomeChip n={counts.good} label="bons résultats" cls={OUTCOME.good.cls} />
          <OutcomeChip n={counts.miss} label="ratés" cls={OUTCOME.miss.cls} />
        </div>
      )}

      {/* Timeline */}
      {history.length === 0 ? (
        <p className="text-zinc-400">Aucun pronostic pour l&apos;instant.</p>
      ) : (
        <>
          {pending.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
                En attente
              </h2>
              <ul className="space-y-2">
                {pending.map((h) => (
                  <HistoryRow key={h.matchId} entry={h} />
                ))}
              </ul>
            </section>
          )}
          {played.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">
                Joués
              </h2>
              <ul className="space-y-2">
                {played.map((h) => (
                  <HistoryRow key={h.matchId} entry={h} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass px-2 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Crest({ url }: { url: string | null }) {
  if (!url) {
    return <span className="h-5 w-5 shrink-0 rounded bg-white/10" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-5 w-5 shrink-0 rounded object-contain" />
  );
}

function HistoryRow({ entry }: { entry: ProfileHistoryEntry }) {
  const o = OUTCOME[entry.outcome];
  const finished = entry.actualHome !== null && entry.actualAway !== null;
  return (
    <li className="glass flex items-center gap-3 px-4 py-3 text-sm">
      <Crest url={entry.homeCrestUrl} />
      <span className="flex-1 truncate">
        {entry.homeTeam} <span className="text-zinc-500">vs</span> {entry.awayTeam}
      </span>
      <Crest url={entry.awayCrestUrl} />
      <span className="shrink-0 text-zinc-400">
        {DATE_FMT.format(new Date(entry.kickoffAt))}
      </span>
      <span className="shrink-0 tabular-nums text-zinc-400">
        prono {entry.predictedHome}–{entry.predictedAway}
      </span>
      <span className="w-12 shrink-0 text-right font-medium tabular-nums">
        {finished ? `${entry.actualHome}–${entry.actualAway}` : "—"}
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${o.cls}`}
      >
        {o.label}
      </span>
    </li>
  );
}

function OutcomeChip({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div className={`flex-1 rounded-xl px-3 py-2 text-center text-sm ${cls}`}>
      <span className="block text-lg font-bold tabular-nums">{n}</span>
      {label}
    </div>
  );
}

/** Ordinal français : 1 -> "1ᵉʳ", n -> "nᵉ". */
function ordinalFr(n: number): string {
  return n === 1 ? "1ᵉʳ" : `${n}ᵉ`;
}

/** Ligne compacte des 3 rangs sous le badge. Masquée si le joueur n'a pas parié. */
function RankLine({ ranks }: { ranks: ProfileRanks }) {
  if (ranks.general === null) return null;
  const parts = [`${ordinalFr(ranks.general.rank)}/${ranks.general.total} général`];
  if (ranks.camp) {
    parts.push(`${ordinalFr(ranks.camp.rank)}/${ranks.camp.total} ${ranks.camp.label.toLowerCase()}`);
  }
  if (ranks.coalition) {
    parts.push(`${ordinalFr(ranks.coalition.rank)}/${ranks.coalition.total} ${ranks.coalition.name}`);
  }
  return (
    <p className="mt-1.5 text-xs tabular-nums text-zinc-400">
      {parts.join(" · ")}
    </p>
  );
}
