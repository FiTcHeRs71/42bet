// Garde authoritative pour pages / server components : valide la session via
// auth() (NextAuth v5) et redirige vers /login si absente/invalide. Ferme
// l'angle mort d'un cookie présent mais périmé que le proxy laisse passer.
import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/config";

/** Renvoie la session connectée, sinon redirige vers /login (ne revient jamais). */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.ftId) {
    redirect("/login");
  }
  return session;
}
