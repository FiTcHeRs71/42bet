"use server";
// Server action de soumission d'un pari. Orchestration MINCE : auth -> validation
// pure -> lock pur -> upsert I/O. Ne throw jamais vers l'UI : retourne un résultat
// discriminé. La règle de lock (bet-rules) est l'autorité, ré-appliquée ici sur
// les données fraîches de la DB (anti-triche).

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth/config";
import { canPlaceBet, validateScore } from "@/lib/bet-rules";
import { upsertBet } from "@/lib/bets";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveUserId } from "@/lib/users";

export type PlaceBetError =
  | "unauth"
  | "invalid"
  | "no-user"
  | "no-match"
  | "locked";

export type PlaceBetResult = { ok: true } | { ok: false; reason: PlaceBetError };

export async function placeBet(formData: FormData): Promise<PlaceBetResult> {
  const session = await auth();
  if (!session?.user?.ftId) return { ok: false, reason: "unauth" };

  const matchId = String(formData.get("matchId") ?? "");
  const homeScore = Number(formData.get("homeScore"));
  const awayScore = Number(formData.get("awayScore"));

  if (!validateScore(homeScore, awayScore)) return { ok: false, reason: "invalid" };

  const userId = await resolveUserId(session.user.ftId);
  if (!userId) return { ok: false, reason: "no-user" };

  const { data: match, error } = await supabaseAdmin
    .from("matches")
    .select("status, kickoff_at")
    .eq("id", matchId)
    .maybeSingle();

  if (error) throw new Error(`placeBet: ${error.message}`);
  if (!match) return { ok: false, reason: "no-match" };

  if (!canPlaceBet(match, new Date())) return { ok: false, reason: "locked" };

  await upsertBet({ userId, matchId, homeScore, awayScore });
  revalidatePath("/matches");
  return { ok: true };
}
