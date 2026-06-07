// src/lib/auth/profile.ts
// Pur : normalise la réponse /v2/me de l'API 42 en profil joueur interne.
// Aucun I/O, aucun import server-only — entièrement testable.

/** Sous-ensemble utile de la réponse `GET /v2/me` de l'API 42. */
export interface Ft42Me {
  id: number;
  login: string;
  image?: { link?: string | null } | null;
  campus_users?: Array<{ campus_id: number; is_primary: boolean }>;
}

/** Profil joueur normalisé (ce que l'app stocke et expose). */
export interface PlayerProfile {
  ftId: number;
  login: string;
  avatarUrl: string | null;
}

export function mapFt42Profile(raw: Ft42Me): PlayerProfile {
  return {
    ftId: raw.id,
    login: raw.login,
    avatarUrl: raw.image?.link ?? null,
  };
}

/** Campus principal du compte 42 (is_primary), sinon le premier listé, sinon null. */
export function getPrimaryCampusId(raw: Ft42Me): number | null {
  const list = raw.campus_users ?? [];
  if (list.length === 0) return null;
  const primary = list.find((c) => c.is_primary);
  return (primary ?? list[0]).campus_id;
}
