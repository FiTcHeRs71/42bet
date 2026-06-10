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

/**
 * Priorité de cursus pour départager un joueur multi-coalitions à Lausanne
 * (campus 47). Source : GET /v2/blocs?filter[campus_id]=47, vérifié 2026-06-07.
 *   - cursus 21 (42cursus actuel) -> 3 : House of Cores/Threads/Processes (191/192/193)
 *   - cursus  9 (Piscine)         -> 2 : The Penguins/Sharks/Frogs (166/168/167)
 *   - cursus  1 (42 legacy)       -> 1 : House of … (188/189/190)
 * Si l'intra renumérote les coalitions (nouvelle saison), mettre à jour cette table.
 */
export const COALITION_CURSUS_PRIORITY: Record<number, number> = {
  193: 3, 192: 3, 191: 3, // cursus 21
  168: 2, 167: 2, 166: 2, // cursus 9
  190: 1, 189: 1, 188: 1, // cursus 1
};

export type CoalitionGroup = "cursus" | "piscine";

/**
 * Groupe d'une coalition d'après son cursus. La Piscine (cursus 9, priorité 2)
 * => "piscine" ; tout le reste (cursus 21 / legacy 1 / inconnu) => "cursus".
 * Sert à distinguer students et piscineux SANS colonne DB dédiée : un joueur
 * en cursus est toujours rattaché à sa coalition de cursus (cf. pickUserCoalition).
 */
export function coalitionGroupOf(ftId: number): CoalitionGroup {
  return COALITION_CURSUS_PRIORITY[ftId] === 2 ? "piscine" : "cursus";
}

/**
 * Chefs de piscine : classés dans leur coalition de PISCINE, pas leur cursus.
 * Set des logins concernés — on ne stocke PAS quelle piscine chacun dirige :
 * `pickUserCoalition` retient la coalition de groupe « piscine » réellement
 * renvoyée par l'API pour ce joueur (cf. coalitionGroupOf). Plus robuste qu'une
 * map login→ft_id (immunisée contre une erreur d'ft_id ou un changement de
 * piscine). Exception TEMPORAIRE (piscine 2026) : retirer ce set quand l'école
 * retire la double affectation — les chefs repasseront alors sur leur cursus.
 */
export const PISCINE_CHEFS: ReadonlySet<string> = new Set([
  "ludebarn",
  "jturrel",
  "sweinber",
]);

/** Normalise un élément brut de l'API 42 en CoalitionRef (couleur fallback). */
function normalise(c: Ft42Coalition): CoalitionRef {
  const color = c.color?.trim() ? c.color.trim() : FALLBACK_COLOR;
  return {
    ftId: c.id,
    name: c.name,
    color,
    imageUrl: c.image_url ?? null,
  };
}

export function pickUserCoalition(
  raw: Ft42Coalition[],
  login?: string,
): CoalitionRef | null {
  if (raw.length === 0) return null;

  // Exception chefs de piscine : on retourne la coalition de groupe « piscine »
  // que l'API a renvoyée pour ce joueur. Sinon (aucune piscine reçue), on ne
  // l'invente pas → repli sur la priorité cursus.
  if (login !== undefined && PISCINE_CHEFS.has(login)) {
    const piscine = raw.find((c) => coalitionGroupOf(c.id) === "piscine");
    if (piscine) return normalise(piscine);
  }

  // Sélection déterministe : priorité de cursus la plus haute (21>9>1). À égalité
  // de priorité (cas improbable), départage par ft_id croissant. Les coalitions
  // hors mapping (autre campus) ont priorité 0 : on tombe alors sur la 1re reçue.
  let best = raw[0];
  let bestPrio = COALITION_CURSUS_PRIORITY[best.id] ?? 0;
  for (const c of raw) {
    const prio = COALITION_CURSUS_PRIORITY[c.id] ?? 0;
    if (prio > bestPrio || (prio === bestPrio && c.id < best.id)) {
      best = c;
      bestPrio = prio;
    }
  }

  return normalise(best);
}
