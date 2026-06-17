# Gate d'accès — confidentialité utilisateurs : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un visiteur non authentifié n'a accès à rien d'autre qu'une page `/login` ; tout le reste de l'app est réservé aux utilisateurs connectés.

**Architecture:** Défense en profondeur. (1) Un `proxy.ts` (ex-`middleware`, Next 16) redirige vers `/login` toute requête sans cookie de session — filet large couvrant routes présentes et futures. (2) Un helper `requireSession()` fait la validation authoritative `auth()` dans chaque page protégée, fermant l'angle mort d'un cookie périmé. La protection est au niveau app car le client Supabase `service_role` bypasse la RLS.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), NextAuth v5 (`auth`, `signIn`), TypeScript strict, Vitest.

**Spec :** `docs/superpowers/specs/2026-06-17-auth-gate-privacy-design.md`

---

## Notes Next.js 16 (vérifiées dans `node_modules/next/dist/docs/`)

- Le fichier `middleware.ts` est **renommé `proxy.ts`** en Next 16 ; la fonction exportée s'appelle `proxy` (export nommé ou défaut). Runtime Node.js par défaut.
- `request.cookies.getAll()` renvoie `{ name, value }[]`.
- `matcher` supporte les négative lookaheads regex. Les Server Functions sont des POST sur la route où elles vivent : une route exclue du matcher n'est plus gardée par le proxy → toujours garder un check `auth()` côté action (déjà le cas pour `placeBet`).
- Tokens couleur dispo (globals.css) : `bg-accent` (#7c3aed), `bg-accent-2`, `text-cyan`. Utilitaires `glass`, `rise`.
- Path alias `@/*` → `src/*` (tsconfig), résolu par Next dans `proxy.ts`.

---

## File Structure

- **Create** `src/lib/auth/session-cookie.ts` — fonction pure `hasSessionCookie(cookieNames)`. Aucune dépendance, testable isolément.
- **Create** `tests/auth-session-cookie.test.ts` — tests de la fonction pure.
- **Create** `src/proxy.ts` — gate large (présence cookie → sinon redirect `/login`).
- **Create** `src/lib/auth/require-session.ts` — garde authoritative `auth()` + redirect.
- **Create** `src/app/login/page.tsx` — page publique de connexion.
- **Modify** `src/app/page.tsx` — `requireSession()` + suppression branche anonyme.
- **Modify** `src/app/matches/page.tsx` — `auth()` → `requireSession()`.
- **Modify** `src/app/leaderboard/page.tsx` — ajout `requireSession()`.
- **Modify** `src/app/profile/[login]/page.tsx` — ajout `requireSession()`.

---

## Task 1 : Fonction pure de détection du cookie de session

**Files:**
- Create: `src/lib/auth/session-cookie.ts`
- Test: `tests/auth-session-cookie.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

`tests/auth-session-cookie.test.ts` :
```ts
import { describe, it, expect } from "vitest";

import { hasSessionCookie } from "@/lib/auth/session-cookie";

describe("hasSessionCookie", () => {
  it("détecte le cookie de prod (__Secure-authjs.session-token)", () => {
    expect(hasSessionCookie(["__Secure-authjs.session-token"])).toBe(true);
  });

  it("détecte le cookie de dev (authjs.session-token)", () => {
    expect(hasSessionCookie(["authjs.session-token"])).toBe(true);
  });

  it("retourne false sans aucun cookie", () => {
    expect(hasSessionCookie([])).toBe(false);
  });

  it("ignore les cookies non pertinents", () => {
    expect(hasSessionCookie(["theme", "csrf-token"])).toBe(false);
  });

  it("détecte le cookie de session parmi d'autres", () => {
    expect(hasSessionCookie(["theme", "authjs.session-token"])).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npm test -- auth-session-cookie`
Expected: FAIL — `Cannot find module '@/lib/auth/session-cookie'`.

- [ ] **Step 3 : Implémenter le minimum**

`src/lib/auth/session-cookie.ts` :
```ts
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
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npm test -- auth-session-cookie`
Expected: PASS (5 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/auth/session-cookie.ts tests/auth-session-cookie.test.ts
git commit -m "feat(auth): fonction pure hasSessionCookie (détection cookie NextAuth)"
```

---

## Task 2 : Proxy — gate large vers /login

**Files:**
- Create: `src/proxy.ts`

> Pas de test unitaire : le proxy n'enveloppe que des API Next internes ; sa logique métier (`hasSessionCookie`) est déjà testée en Task 1. Vérification par typecheck + manuel.

- [ ] **Step 1 : Créer le proxy**

`src/proxy.ts` :
```ts
// Gate de confidentialité (Next 16 : "proxy" = ex-"middleware"). Filtre LARGE :
// toute requête sans cookie de session NextAuth est redirigée vers /login.
// Ne valide PAS le cookie (rapide, pas d'import server-only) — la validation
// authoritative est faite par requireSession() dans chaque page.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { hasSessionCookie } from "@/lib/auth/session-cookie";

export function proxy(request: NextRequest) {
  const cookieNames = request.cookies.getAll().map((c) => c.name);
  if (hasSessionCookie(cookieNames)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // S'applique partout SAUF : /api/* (auth + cron protégé par CRON_SECRET),
  // assets _next, favicon, /login, et tout fichier statique (chemin avec un point).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login|.*\\..*).*)"],
};
```

- [ ] **Step 2 : Typecheck**

Run: `npm run typecheck`
Expected: pas d'erreur.

- [ ] **Step 3 : Vérification manuelle du gate**

Démarrer `npm run dev`. **Déconnecté** (effacer les cookies du site / fenêtre privée) :
- `http://localhost:3000/` → redirige vers `/login`.
- `http://localhost:3000/matches` → redirige vers `/login`.
- `http://localhost:3000/leaderboard` → redirige vers `/login`.
- `http://localhost:3000/login` → s'affiche (pas de boucle de redirection).
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/cron/sync-results` → `401` (et non une redirection 307 vers /login).

Expected: tous les comportements ci-dessus respectés.

- [ ] **Step 4 : Commit**

```bash
git add src/proxy.ts
git commit -m "feat(auth): proxy Next 16 — gate /login si pas de session"
```

---

## Task 3 : requireSession — garde authoritative

**Files:**
- Create: `src/lib/auth/require-session.ts`

- [ ] **Step 1 : Créer le helper**

`src/lib/auth/require-session.ts` :
```ts
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
```

> `redirect()` a le type de retour `never` : après le `if`, TypeScript affine `session` en non-null, donc le `return session` est typé `Session` (non nullable) pour les appelants.

- [ ] **Step 2 : Typecheck**

Run: `npm run typecheck`
Expected: pas d'erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/auth/require-session.ts
git commit -m "feat(auth): helper requireSession (validation auth() + redirect /login)"
```

---

## Task 4 : Page de login publique

**Files:**
- Create: `src/app/login/page.tsx`

- [ ] **Step 1 : Créer la page**

`src/app/login/page.tsx` :
```tsx
import { redirect } from "next/navigation";

import { auth, signIn } from "@/lib/auth/config";

// Page publique : seul écran visible hors authentification.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.ftId) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center p-6">
      <section className="glass rise w-full p-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          42<span className="text-cyan">Bet</span>
        </h1>
        <p className="mt-2 text-zinc-400">
          Pronostics Coupe du Monde — École 42 Lausanne
        </p>
        <p className="mt-6 text-sm text-zinc-300">
          Connecte-toi avec ton compte 42 pour accéder aux pronostics et au
          classement. Aucune donnée n&apos;est visible sans connexion.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("42");
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-3 font-semibold text-white transition hover:bg-accent-2"
          >
            Se connecter avec 42
          </button>
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 2 : Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: pas d'erreur.

- [ ] **Step 3 : Vérification manuelle**

`npm run dev`, déconnecté, ouvrir `/login` : la carte 42Bet s'affiche avec le bouton « Se connecter avec 42 ». Cliquer → flux OAuth 42 → retour connecté sur `/`.

- [ ] **Step 4 : Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(auth): page /login publique (bouton sign-in 42)"
```

---

## Task 5 : Appliquer requireSession aux pages protégées

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/matches/page.tsx:22`
- Modify: `src/app/leaderboard/page.tsx:24`
- Modify: `src/app/profile/[login]/page.tsx:38`

- [ ] **Step 1 : Home — requireSession + suppression branche anonyme**

Dans `src/app/page.tsx` :

1. Remplacer l'import `import { auth } from "@/lib/auth/config";` par
   `import { requireSession } from "@/lib/auth/require-session";`.
2. Remplacer `auth(),` par `requireSession(),` dans le `Promise.all` (le tableau devient `[requireSession(), listMatches(), listPlayers(), listAllBets()]`).
3. `login` est désormais toujours défini. Remplacer
   `const login = session?.user?.login ?? null;`
   par
   `const login = session.user.login;`.
4. Supprimer la branche anonyme du hero. Remplacer ce bloc :
```tsx
        {login ? (
          <p className="mt-3">
            Salut <strong>{login}</strong> 👋
          </p>
        ) : (
          <p className="mt-3 text-zinc-300">
            Connecte-toi avec ton compte 42 pour parier.
          </p>
        )}
```
par :
```tsx
        <p className="mt-3">
          Salut <strong>{login}</strong> 👋
        </p>
```

- [ ] **Step 2 : Matches — auth() → requireSession()**

Dans `src/app/matches/page.tsx` :

1. Remplacer l'import `import { auth } from "@/lib/auth/config";` par
   `import { requireSession } from "@/lib/auth/require-session";`.
2. Remplacer la ligne
   `const [matches, session] = await Promise.all([listMatches(), auth()]);`
   par
   `const [matches, session] = await Promise.all([listMatches(), requireSession()]);`.

(Le reste de la page utilise `session` pour indexer les pronos privés — inchangé.)

- [ ] **Step 3 : Leaderboard — ajout requireSession()**

Dans `src/app/leaderboard/page.tsx` :

1. Ajouter l'import (avec les autres imports en tête de fichier) :
   `import { requireSession } from "@/lib/auth/require-session";`.
2. En première instruction de `LeaderboardPage`, avant le `Promise.all`, ajouter :
   `await requireSession();`
   La fonction devient :
```tsx
export default async function LeaderboardPage() {
  await requireSession();
  const [players, bets] = await Promise.all([listPlayers(), listAllBets()]);
```

- [ ] **Step 4 : Profile — ajout requireSession()**

Dans `src/app/profile/[login]/page.tsx` :

1. Ajouter l'import (avec les autres imports en tête de fichier) :
   `import { requireSession } from "@/lib/auth/require-session";`.
2. Après `const { login } = await params;`, ajouter :
   `await requireSession();`
   Le début de la fonction devient :
```tsx
  const { login } = await params;
  await requireSession();

  const [players, allBets] = await Promise.all([listPlayers(), listAllBets()]);
```

- [ ] **Step 5 : Typecheck + lint + tests**

Run: `npm run typecheck && npm run lint && npm test`
Expected: pas d'erreur ; tous les tests passent (dont les 5 de Task 1).

- [ ] **Step 6 : Vérification manuelle (cookie périmé)**

`npm run dev`. Se connecter, puis depuis les DevTools modifier la valeur du cookie `authjs.session-token` (le rendre invalide) sans le supprimer, puis recharger `/leaderboard`.
Expected: redirige vers `/login` (le proxy laisse passer car cookie présent, mais `requireSession()` rejette la session invalide).

- [ ] **Step 7 : Commit**

```bash
git add src/app/page.tsx src/app/matches/page.tsx src/app/leaderboard/page.tsx "src/app/profile/[login]/page.tsx"
git commit -m "feat(auth): protège home/matches/leaderboard/profile via requireSession"
```

---

## Task 6 : Vérification finale

**Files:** aucun (gates qualité).

- [ ] **Step 1 : Suite complète**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tout vert.

- [ ] **Step 2 : Parcours manuel complet (déconnecté)**

`npm run dev`, fenêtre privée :
- `/`, `/matches`, `/leaderboard`, `/profile/<un_login_existant>` → tous redirigent vers `/login`.
- `/login` s'affiche, sans boucle.
- `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/sync-results` → `401`.

- [ ] **Step 3 : Parcours manuel complet (connecté)**

Se connecter via `/login` → flux 42 → `/`. Vérifier l'accès normal à `/`, `/matches` (poser un prono), `/leaderboard`, `/profile/<son_login>`. Visiter `/login` une fois connecté → redirige vers `/`.

Expected: comportement nominal, aucune régression.

---

## Couverture spec (auto-review)

- §2 « non connecté → /login, reste redirige » → Task 2 (proxy) + Task 5.
- §2 routes exclues (`/login`, `/api/auth`, `/api/cron`, assets) → matcher Task 2.
- §3 architecture défense en profondeur → Task 2 (proxy) + Task 3/5 (requireSession).
- §4.1 page login → Task 4.
- §4.2 proxy + `hasSessionCookie` pur → Task 1 + Task 2.
- §4.3 `requireSession` → Task 3.
- §4.4 pages protégées + suppression branche anonyme home → Task 5.
- §4.5 layout inchangé, `placeBet` garde `"unauth"` → non modifiés (intentionnel).
- §5 gestion d'erreur (cookie périmé, cron 401, connecté sur /login) → Task 5 step 6, Task 6 step 2-3, Task 4.
- §6 tests (unit `hasSessionCookie` + manuels) → Task 1, Task 2/4/5/6.
