// src/lib/auth/upsert-player.ts
// Persistance de la fiche joueur via injection de dépendances : aucune
// référence directe à Supabase ici, donc testable avec un fake. L'appelant
// (config NextAuth) fournit l'implémentation réelle basée sur supabaseAdmin.

import type { PlayerProfile } from "@/lib/auth/profile";

/** Ligne `public.users` que l'on insère/maj (colonnes générées snake_case). */
export interface PlayerRow {
  ft_id: number;
  login: string;
  avatar_url: string | null;
}

export interface UpsertDeps {
  /** Upsert on conflict (ft_id). Renvoie l'erreur Postgrest éventuelle. */
  upsertUser(row: PlayerRow): Promise<{ error: unknown }>;
}

export async function upsertPlayer(
  profile: PlayerProfile,
  deps: UpsertDeps,
): Promise<void> {
  const { error } = await deps.upsertUser({
    ft_id: profile.ftId,
    login: profile.login,
    avatar_url: profile.avatarUrl,
  });
  if (error) {
    throw new Error(`Failed to upsert player ${profile.login}`);
  }
}
