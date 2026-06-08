// src/lib/auth/upsert-player.ts
// Persistance de la fiche joueur via injection de dépendances : aucune
// référence directe à Supabase ici, donc testable avec des fakes. L'appelant
// (config NextAuth) fournit les implémentations réelles (supabaseAdmin + fetch42).
// L'assignation de coalition est BEST-EFFORT : elle ne casse jamais le login.

import type { PlayerProfile } from "@/lib/auth/profile";
import {
  pickUserCoalition,
  type CoalitionRef,
  type Ft42Coalition,
} from "@/lib/coalitions";

/** Ligne `public.users` que l'on insère/maj (colonnes générées snake_case). */
export interface PlayerRow {
  ft_id: number;
  login: string;
  avatar_url: string | null;
}

export interface UpsertDeps {
  /** Upsert on conflict (ft_id). Renvoie l'erreur Postgrest éventuelle. */
  upsertUser(row: PlayerRow): Promise<{ error: unknown }>;
  /** GET /v2/users/:id/coalitions (token applicatif). */
  fetchUserCoalitions(ftId: number): Promise<Ft42Coalition[]>;
  /** Upsert la coalition (on conflict ft_id) et renvoie son uuid interne. */
  upsertCoalition(ref: CoalitionRef): Promise<{ id: string | null; error: unknown }>;
  /** Lie la coalition au joueur (update users.coalition_id by ft_id). */
  setCoalition(ftId: number, coalitionId: string): Promise<{ error: unknown }>;
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

  // Best-effort : un échec coalition n'altère jamais le succès du login.
  try {
    const raw = await deps.fetchUserCoalitions(profile.ftId);
    const ref = pickUserCoalition(raw);
    if (!ref) return;

    const { id, error: upsertErr } = await deps.upsertCoalition(ref);
    if (upsertErr || !id) {
      console.warn(`coalition upsert failed for ${profile.login}`, upsertErr);
      return;
    }

    const { error: linkErr } = await deps.setCoalition(profile.ftId, id);
    if (linkErr) console.warn(`coalition link failed for ${profile.login}`, linkErr);
  } catch (err) {
    console.warn(`coalition sync skipped for ${profile.login}:`, err);
  }
}
