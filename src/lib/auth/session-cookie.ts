// Détection PURE de la présence d'un cookie de session NextAuth v5 (authjs).
// Aucune validation cryptographique : sert de filtre rapide côté proxy.
// La validation authoritative est faite par requireSession() (auth()).

/** Noms de cookie de session émis par NextAuth v5 selon l'environnement. */
const SESSION_COOKIE_NAMES = [
  "authjs.session-token", // dev / http
  "__Secure-authjs.session-token", // prod / https
];

/** True si l'un des cookies de session NextAuth est présent. */
export function hasSessionCookie(cookieNames: string[]): boolean {
  return cookieNames.some((name) => SESSION_COOKIE_NAMES.includes(name));
}
