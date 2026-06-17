// Détection PURE de la présence d'un cookie de session NextAuth v5 (authjs).
// Aucune validation cryptographique : sert de filtre rapide côté proxy.
// La validation authoritative est faite par requireSession() (auth()).

// Deux noms selon l'environnement : NextAuth préfixe le cookie de `__Secure-`
// quand il est servi en HTTPS (prod), pas en HTTP (dev local).
const SESSION_COOKIE_NAMES = [
  "authjs.session-token", // dev / http
  "__Secure-authjs.session-token", // prod / https
];

/** Interface minimale (ISP) : tout objet sachant tester la présence d'un cookie. */
export interface CookieChecker {
  has(name: string): boolean;
}

/** True si l'un des cookies de session NextAuth est présent. */
export function hasSessionCookie(cookies: CookieChecker): boolean {
  return SESSION_COOKIE_NAMES.some((name) => cookies.has(name));
}
