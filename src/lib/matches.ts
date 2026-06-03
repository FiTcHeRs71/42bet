// src/lib/matches.ts
// Accès données pour la liste des matchs — I/O uniquement (SRP : aucune logique
// de présentation ici). Lecture publique via le client anon (RLS public read).

import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Match } from "@/lib/types";

/** Tous les matchs, triés par coup d'envoi croissant. Lève en cas d'erreur DB. */
export async function listMatches(): Promise<Match[]> {
  const { data, error } = await supabaseBrowser
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });

  if (error) throw new Error(`listMatches: ${error.message}`);
  return data ?? [];
}
