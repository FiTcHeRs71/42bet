// src/lib/bets.ts
// Accès données paris — I/O uniquement (SRP : aucune règle métier ici, cf.
// bet-rules.ts). Lecture/écriture PRIVÉES via le client service_role : la table
// bets a une RLS default-deny, donc tout passe par le serveur après auth().

import { supabaseAdmin } from "@/lib/supabase/server";
import type { LeaderboardBet } from "@/lib/leaderboard";
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
 */
export async function listAllBets(): Promise<LeaderboardBet[]> {
  const { data, error } = await supabaseAdmin
    .from("bets")
    .select("user_id, points_awarded");

  if (error) throw new Error(`listAllBets: ${error.message}`);
  return data ?? [];
}
