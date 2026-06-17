// Gate de confidentialité (Next 16 : "proxy" = ex-"middleware"). Filtre LARGE :
// toute requête sans cookie de session NextAuth est redirigée vers /login.
// Ne valide PAS le cookie (rapide, pas d'import server-only) — la validation
// authoritative est faite par requireSession() dans chaque page.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { hasSessionCookie } from "@/lib/auth/session-cookie";

export function proxy(request: NextRequest) {
  if (hasSessionCookie(request.cookies)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // S'applique partout SAUF : /api/* (auth + cron protégé par CRON_SECRET),
  // assets _next, favicon, /login, et tout fichier statique (chemin avec un point).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|.*\\..*).*)"],
};
