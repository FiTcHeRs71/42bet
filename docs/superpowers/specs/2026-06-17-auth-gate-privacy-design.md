# Spec — Gate d'accès : confidentialité des utilisateurs

> Date : 2026-06-17 · Branche : `feat/auth-gate-privacy`

## 1. Problème

Aujourd'hui **toutes les pages sont publiques**. Un visiteur non connecté voit :
- la home (matchs à venir + top 3 du classement avec logins 42 et coalitions),
- `/matches`,
- `/leaderboard` (tous les logins, coalitions, points),
- `/profile/[login]` (historique de paris de n'importe quel joueur).

Les données sont lues via le client Supabase `service_role` (RLS bypassée), donc
**aucune protection DB ne s'applique** : l'identité 42 des utilisateurs, leur
activité de pari et leur appartenance de coalition sont exposées publiquement.

**Objectif** : préserver l'anonymat / la vie privée des utilisateurs. Un visiteur
non authentifié n'a accès à **rien** d'autre qu'un écran de connexion.

## 2. Comportement attendu

- Non connecté → toute URL applicative redirige vers une **page `/login` dédiée**
  (branding 42Bet + bouton « Se connecter avec 42 »). Rien d'autre n'est visible.
- Connecté → accès normal à toute l'app.
- Routes jamais redirigées (exclues du gate) : `/login`, `/api/auth/*` (flux OAuth),
  `/api/cron/*` (protégé par `CRON_SECRET`, appelé par cron-job.org), assets `/_next/*`,
  favicon.

## 3. Architecture — approche « défense en profondeur » (middleware + garde par page)

La protection est au **niveau application** (pas DB, puisque le `service_role`
bypass la RLS).

```
requête → middleware (cookie de session présent ?)
            │ non → redirect /login
            │ oui → page → requireSession() (auth() authoritative)
                        │ session invalide/périmée → redirect /login
                        │ session OK → rend la page avec les données
```

- **Le middleware** est un filet large et rapide qui couvre toutes les routes
  présentes **et futures** — garantie « accès à rien ».
- **`requireSession()`** est la validation authoritative par page : elle ferme
  l'angle mort d'un cookie présent mais périmé/invalide (que le middleware, qui ne
  vérifie que la *présence*, laisserait passer).

## 4. Composants

### 4.1 `src/app/login/page.tsx` (nouveau, public)
- Server component, aucune donnée utilisateur fetchée.
- Hero 42Bet + bouton « Se connecter avec 42 » via server action `signIn("42")`.
- Si déjà connecté → `redirect("/")` (évite d'afficher le login à un connecté).

### 4.2 `src/middleware.ts` (nouveau)
- **N'importe PAS** `src/lib/auth/config.ts` (qui est `server-only` et importe
  `supabaseAdmin` / `fetch42`) — le middleware reste léger, sans souci de runtime.
- Vérifie la présence d'un cookie de session NextAuth v5 :
  `authjs.session-token` (dev/http) ou `__Secure-authjs.session-token` (prod/https).
- Cookie absent → `NextResponse.redirect(new URL("/login", req.url))`.
- La détection est extraite en **fonction pure** `hasSessionCookie(cookieNames: string[]): boolean`
  (testable isolément, SOLID/SRP).
- `config.matcher` exclut : `/login`, `/api/*` (auth + cron gérés autrement),
  `/_next/static`, `/_next/image`, `favicon.ico`, et tout fichier statique
  (extension dans le chemin).

### 4.3 `src/lib/auth/require-session.ts` (nouveau, server-only)
```ts
import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.ftId) redirect("/login");
  return session; // typé non-null pour l'appelant
}
```
Renvoie la session pour que la page récupère le user **sans 2ᵉ appel `auth()`**.

### 4.4 Pages protégées (modifiées)
Ajout de `requireSession()` en tête de :
- `src/app/page.tsx` (home) — **suppression de la branche « anonyme »**
  (`login ? … :` + texte « Connecte-toi pour parier ») devenue inatteignable ;
  `login` est désormais toujours défini.
- `src/app/matches/page.tsx` — déjà `auth()`, remplacé par `requireSession()`.
- `src/app/leaderboard/page.tsx` — ajout (ne faisait aucun check auth).
- `src/app/profile/[login]/page.tsx` — ajout (ne faisait aucun check auth).

### 4.5 Inchangé
- `src/app/layout.tsx` — sur `/login`, `session=null` → header + bouton login,
  cohérent. Pas de modification nécessaire.
- `src/app/matches/actions.ts` (`placeBet`) — garde sa branche `"unauth"`
  (défense en profondeur : l'action peut être appelée hors rendu de page).

## 5. Gestion d'erreur

| Cas | Résultat |
|---|---|
| Pas de cookie de session | Middleware → redirect `/login` |
| Cookie présent mais périmé/invalide | Middleware passe, `requireSession()` (auth()=null) → redirect `/login` |
| Appel `placeBet` sans session | `{ ok: false, reason: "unauth" }` |
| Cron appelé sans `CRON_SECRET` | Inchangé : `401` (route exclue du middleware) |
| Connecté visite `/login` | `redirect("/")` |

## 6. Tests

- **Unitaire** : `hasSessionCookie()` — fonction pure, cas :
  cookie prod (`__Secure-authjs.session-token`), cookie dev (`authjs.session-token`),
  aucun cookie, autre cookie non pertinent.
- **Manuel (déconnecté)** : `/`, `/matches`, `/leaderboard`, `/profile/<login>`
  redirigent tous vers `/login`.
- **Manuel (cron)** : `/api/cron/sync-results` répond toujours (401 sans secret,
  scoring avec secret) — non redirigé.
- **Manuel (login)** : le flux OAuth 42 fonctionne et ramène à `/`.
- **Non-régression** : `npm run typecheck` + `npm run lint` + `npm test` verts.

## 7. Hors périmètre (YAGNI)

- Pas de durcissement RLS Supabase (la protection app suffit pour l'objectif ;
  le `service_role` reste server-only).
- Pas de page d'erreur 403 dédiée (redirect login suffit).
- Pas de gestion de rôles/permissions fines (binaire connecté / non connecté).
