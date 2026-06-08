"use client";
// Rendu interactif du classement : 2 onglets (Coalitions / Joueurs) avec filtres.
// AUCUN fetch ici (règle projet) — toutes les vues sont calculées côté serveur
// et reçues en props. État local = onglet + filtres uniquement.

import Link from "next/link";
import { useState } from "react";

import { CoalitionBadge } from "@/components/coalition-badge";
import type {
  CampStanding,
  CoalitionStanding,
  LeaderboardEntry,
} from "@/lib/leaderboard";

const PCT_FMT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 0,
});
const AVG_FMT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export type CoalitionViews = {
  all: CoalitionStanding[];
  cursus: CoalitionStanding[];
  piscine: CoalitionStanding[];
};
export type PlayerViews = {
  all: LeaderboardEntry[];
  students: LeaderboardEntry[];
  piscineux: LeaderboardEntry[];
};

type Tab = "coalitions" | "players";
type CoalitionFilter = "all" | "cursus" | "piscine";
type PlayerFilter = "all" | "students" | "piscineux";

const COALITION_FILTERS: { key: CoalitionFilter; label: string }[] = [
  { key: "all", label: "6 coalitions" },
  { key: "cursus", label: "Cursus" },
  { key: "piscine", label: "Piscine" },
];
const PLAYER_FILTERS: { key: PlayerFilter; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "students", label: "Students" },
  { key: "piscineux", label: "Piscineux" },
];

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-3 inline-flex gap-1 rounded-lg bg-white/5 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.key
              ? "bg-white/15 text-white"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LeaderboardTabs({
  coalitions,
  camps,
  players,
}: {
  coalitions: CoalitionViews;
  camps: CampStanding[];
  players: PlayerViews;
}) {
  const [tab, setTab] = useState<Tab>("coalitions");
  const [coalitionFilter, setCoalitionFilter] = useState<CoalitionFilter>("all");
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>("all");

  const coalitionRows = coalitions[coalitionFilter];
  const playerRows = players[playerFilter];

  return (
    <>
      <Segmented<Tab>
        options={[
          { key: "coalitions", label: "Coalitions" },
          { key: "players", label: "Joueurs" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "coalitions" ? (
        <section>
          <Segmented<CoalitionFilter>
            options={COALITION_FILTERS}
            value={coalitionFilter}
            onChange={setCoalitionFilter}
          />
          {coalitionRows.length === 0 ? (
            <p className="text-zinc-400">Aucune coalition classée.</p>
          ) : (
            <ul className="glass divide-y divide-white/5 overflow-hidden">
              {coalitionRows.map((c) => (
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
                  <span className="hidden w-14 shrink-0 text-right tabular-nums text-zinc-400 sm:inline">
                    {c.totalPoints} pt
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-zinc-400">
                    {c.players} {c.players > 1 ? "joueurs" : "joueur"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section>
          {camps.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-3">
              {camps.map((camp) => (
                <div
                  key={camp.camp}
                  className="glass flex flex-col gap-0.5 px-4 py-3"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {camp.rank === 1 && <span aria-hidden>👑</span>}
                    {camp.label}
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    {AVG_FMT.format(camp.average)} pt/j
                  </span>
                  <span className="text-xs tabular-nums text-zinc-400">
                    {camp.totalPoints} pt · {camp.players}{" "}
                    {camp.players > 1 ? "joueurs" : "joueur"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Segmented<PlayerFilter>
            options={PLAYER_FILTERS}
            value={playerFilter}
            onChange={setPlayerFilter}
          />

          {playerRows.length === 0 ? (
            <p className="text-zinc-400">Aucun joueur classé.</p>
          ) : (
            <ul className="glass divide-y divide-white/5 overflow-hidden">
              {playerRows.map((e) => (
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
                  <span className="hidden w-10 shrink-0 text-right tabular-nums text-zinc-400 sm:inline">
                    {e.bets}
                  </span>
                  <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
                    {e.points} pt
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
