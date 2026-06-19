// src/lib/bets.ts
// Accès données paris — I/O uniquement (SRP : aucune règle métier ici, cf.
// bet-rules.ts). Lecture/écriture PRIVÉES via le client service_role : la table
// bets a une RLS default-deny, donc tout passe par le serveur après auth().

import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/paginate";
import type { LeaderboardBet, WeeklyBet } from "@/lib/leaderboard";
import type { LoufoqueBet } from "@/lib/loufoque";
import type { ProfileBetRow } from "@/lib/profile";
import type { Bet } from "@/lib/types";

/** Tous les paris d'un joueur (par users.id). Lève en cas d'erreur DB. */
export async function listMyBets(userId: string): Promise<Bet[]> {
  const { data, error } = await supabaseAdmin
    .from("bets")
    .select("*")
    .eq("user_id", userId);

  if (error) throw new Error(`listMyBets: ${error.message}`);
  return data ?? [];
}

/**
 * Crée ou met à jour le pari d'un joueur sur un match (upsert sur la contrainte
 * unique (user_id, match_id)). N'écrit jamais points_awarded (réservé au cron de
 * scoring). Lève en cas d'erreur DB.
 */
export async function upsertBet(input: {
  userId: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("bets").upsert(
    {
      user_id: input.userId,
      match_id: input.matchId,
      home_score: input.homeScore,
      away_score: input.awayScore,
    },
    { onConflict: "user_id,match_id" },
  );

  if (error) throw new Error(`upsertBet: ${error.message}`);
}

/**
 * Tous les pronos (id joueur + points attribués) pour le classement. Lecture
 * server-only via service_role (bets est RLS default-deny). On ne renvoie que
 * user_id + points_awarded — jamais les scores pronostiqués individuels.
 * Paginé : sans cela PostgREST plafonne à 1000 lignes, faussant le comptage et
 * le taux de réussite dès que le total de paris dépasse 1000.
 */
export async function listAllBets(): Promise<LeaderboardBet[]> {
  return fetchAllRows((from, to) =>
    supabaseAdmin
      .from("bets")
      .select("user_id, points_awarded")
      .range(from, to)
      .then(({ data, error }) => {
        if (error) throw new Error(`listAllBets: ${error.message}`);
        return data ?? [];
      }),
  );
}

/**
 * Tous les pronos d'un joueur joints à leur match (équipes, crests, score réel,
 * statut, kickoff), pour la timeline du profil. Lecture server-only via
 * service_role (bets = RLS default-deny). Normalise le match imbriqué en
 * objet|null : supabase-js peut le typer en objet OU en tableau selon la
 * détection de relation (même pattern que listPlayers).
 */
export async function listBetsWithMatchByUser(
  userId: string,
): Promise<ProfileBetRow[]> {
  const { data, error } = await supabaseAdmin
    .from("bets")
    .select(
      "match_id, home_score, away_score, points_awarded, match:matches(home_team, away_team, home_crest_url, away_crest_url, home_score, away_score, kickoff_at, status)",
    )
    .eq("user_id", userId);

  if (error) throw new Error(`listBetsWithMatchByUser: ${error.message}`);

  return (data ?? []).map((row) => {
    const m = row.match as
      | ProfileBetRow["match"]
      | NonNullable<ProfileBetRow["match"]>[]
      | null;
    return {
      match_id: row.match_id,
      home_score: row.home_score,
      away_score: row.away_score,
      points_awarded: row.points_awarded,
      match: Array.isArray(m) ? (m[0] ?? null) : m,
    };
  });
}

/**
 * Paris NOTÉS (points_awarded non null) joints à la date de coup d'envoi de leur
 * match, pour le classement "meilleur de la semaine". Lecture server-only via
 * service_role (bets = RLS default-deny). Normalise le match imbriqué en
 * objet|null (supabase-js peut le typer objet OU tableau selon la relation).
 * Paginé sur les lignes BRUTES (la normalisation flatMap se fait après, sinon
 * une page filtrée incomplète arrêterait la pagination trop tôt).
 */
export async function listScoredBetsWithKickoff(): Promise<WeeklyBet[]> {
  const rows = await fetchAllRows((from, to) =>
    supabaseAdmin
      .from("bets")
      .select("user_id, points_awarded, match:matches(kickoff_at)")
      .not("points_awarded", "is", null)
      .range(from, to)
      .then(({ data, error }) => {
        if (error) throw new Error(`listScoredBetsWithKickoff: ${error.message}`);
        return data ?? [];
      }),
  );

  return rows.flatMap((row) => {
    const m = row.match as { kickoff_at: string } | { kickoff_at: string }[] | null;
    const match = Array.isArray(m) ? (m[0] ?? null) : m;
    // points_awarded est non null (filtré ci-dessus) ; match non null (FK not null).
    if (match === null || row.points_awarded === null) return [];
    return [
      {
        user_id: row.user_id,
        points_awarded: row.points_awarded,
        kickoff_at: match.kickoff_at,
      },
    ];
  });
}

/**
 * Paris ayant trouvé le SCORE EXACT (points_awarded = 3) joints à leur match
 * (équipes, score réel, kickoff), pour le "pari le plus loufoque de la semaine".
 * Lecture server-only via service_role (bets = RLS default-deny). Normalise le
 * match imbriqué en objet|null (supabase-js peut le typer objet OU tableau).
 * Paginé sur les lignes BRUTES (normalisation flatMap après la pagination).
 */
export async function listExactScoreBetsWithMatch(): Promise<LoufoqueBet[]> {
  type MatchRow = {
    home_team: string;
    away_team: string;
    home_score: number | null;
    away_score: number | null;
    kickoff_at: string;
  };
  type ExactRow = {
    user_id: string;
    match_id: string;
    match: MatchRow | MatchRow[] | null;
  };

  const rows = await fetchAllRows<ExactRow>((from, to) =>
    supabaseAdmin
      .from("bets")
      .select(
        "user_id, match_id, match:matches(home_team, away_team, home_score, away_score, kickoff_at)",
      )
      .eq("points_awarded", 3)
      .range(from, to)
      .then(({ data, error }) => {
        if (error) throw new Error(`listExactScoreBetsWithMatch: ${error.message}`);
        return (data ?? []) as ExactRow[];
      }),
  );

  return rows.flatMap((row) => {
    const m = row.match as MatchRow | MatchRow[] | null;
    const match = Array.isArray(m) ? (m[0] ?? null) : m;
    // match non null (FK) ; score réel non null car points_awarded=3 implique un
    // match fini et scoré (garde pour satisfaire le typage nullable du schéma).
    if (match === null || match.home_score === null || match.away_score === null) {
      return [];
    }
    return [
      {
        user_id: row.user_id,
        match_id: row.match_id,
        kickoff_at: match.kickoff_at,
        home_team: match.home_team,
        away_team: match.away_team,
        home_score: match.home_score,
        away_score: match.away_score,
      },
    ];
  });
}
