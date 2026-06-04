import "server-only";

import { supabaseAdmin } from "@/lib/supabase/server";

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
