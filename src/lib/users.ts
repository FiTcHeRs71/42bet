import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";
import type { LeaderboardPlayer } from "@/lib/leaderboard";

/**
 * Résout l'identifiant interne (users.id, uuid) à partir de l'id 42 (ft_id).
 * Retourne null si aucun utilisateur ne correspond. Lève en cas d'erreur DB.
 */
export async function resolveUserId(ftId: number): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("ft_id", ftId)
    .maybeSingle();

  if (error) throw new Error(`resolveUserId: ${error.message}`);
  return data?.id ?? null;
}

/**
 * Tous les joueurs avec leur coalition (jointure), pour le classement. Lecture
 * server-only via service_role. Normalise la coalition imbriquée en objet|null :
 * supabase-js peut la typer en objet OU en tableau selon la détection de relation,
 * donc on gère les deux formes à l'exécution.
 */
export async function listPlayers(): Promise<LeaderboardPlayer[]> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, login, avatar_url, coalition:coalitions(name, color, image_url)");

  if (error) throw new Error(`listPlayers: ${error.message}`);

  return (data ?? []).map((row) => {
    const c = row.coalition as
      | { name: string; color: string; image_url: string | null }
      | { name: string; color: string; image_url: string | null }[]
      | null;
    return {
      id: row.id,
      login: row.login,
      avatar_url: row.avatar_url,
      coalition: Array.isArray(c) ? (c[0] ?? null) : c,
    };
  });
}
