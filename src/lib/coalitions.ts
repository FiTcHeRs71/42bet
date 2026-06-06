// Pur : sélectionne et normalise la coalition d'un joueur depuis la réponse
// GET /v2/users/:id/coalitions de l'API 42. Aucun I/O, aucun import server-only.

/** Sous-ensemble utile d'un élément de GET /v2/users/:id/coalitions. */
export interface Ft42Coalition {
  id: number;
  name: string;
  color?: string | null;
  image_url?: string | null;
}

/** Coalition normalisée, prête à upserter dans public.coalitions. */
export interface CoalitionRef {
  ftId: number;
  name: string;
  color: string; // fallback gris neutre si l'API ne fournit rien
  imageUrl: string | null;
}

/** Couleur neutre lisible (slate-500) quand l'intra ne renvoie pas de couleur. */
const FALLBACK_COLOR = "#64748b";

/** Prend la première coalition (ou null si le joueur n'en a aucune). */
export function pickUserCoalition(raw: Ft42Coalition[]): CoalitionRef | null {
  const first = raw[0];
  if (!first) return null;
  const color = first.color?.trim() ? first.color.trim() : FALLBACK_COLOR;
  return {
    ftId: first.id,
    name: first.name,
    color,
    imageUrl: first.image_url ?? null,
  };
}
