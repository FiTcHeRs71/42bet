# Design — Clients Supabase 42Bet

> Statut : **design validé** par l'utilisateur le 2026-06-03.
> Issu de la session `superpowers:brainstorming`. Implémentation en TDD direct
> (brique petite, design complet — pas de doc `writing-plans` séparé).

## Contexte

Couche d'accès aux données. Toutes les features (sync cron, pages classement /
matchs / paris) en dépendent. La DB est déjà en place (migrations `0000`→`0005`
appliquées sur le projet `yrfstssxuhkdtiuugvgf`).

## Décisions (tranchées en session)

1. **Lib = `@supabase/supabase-js`** (client simple). Pas `@supabase/ssr` :
   l'auth passe par NextAuth, pas Supabase Auth → aucune gestion de
   session/cookies Supabase nécessaire.
2. **Typage = type `Database` généré** (`src/lib/database.types.ts`, via
   `supabase gen types typescript --linked`). Source de vérité unique, dérivée
   du vrai schéma. Pas de type écrit à la main.
3. **Deux clients, singletons au niveau module** (service_role et anon sont sans
   état par-utilisateur). Pas de factory — YAGNI.
4. **`types.ts` réconcilié** en ré-exports des types générés → zéro duplication.
5. **Pas de couche d'accès data** (repository) maintenant — elle viendra avec
   chaque feature qui la consomme (YAGNI).

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/lib/database.types.ts` | Types générés (déjà présent) → committé. |
| `src/lib/env.ts` | `requireEnv(name): string` — pure, throw explicite si la var manque. Unité testée en TDD. |
| `src/lib/supabase/server.ts` | `import "server-only"` + client **service_role** (bypass RLS). Écritures + lectures privées (`bets`). |
| `src/lib/supabase/browser.ts` | Client **anon** (clé publishable). Lectures publiques uniquement. |
| `src/lib/types.ts` | Ré-exports : `User = Tables<'users'>`, `Match = Tables<'matches'>`, `Coalition = Tables<'coalitions'>`, `Bet = Tables<'bets'>`, `MatchStatus = Enums<'match_status'>`. |

## Détails

- Les deux clients : `createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })`.
- `server.ts` : `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` via `requireEnv`.
- `browser.ts` : `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Garde-fous (AGENTS.md)

- `server-only` (package Vercel) dans `server.ts` → le build échoue si un
  composant `"use client"` l'importe (règle non-négociable #3 : `service_role`
  jamais exposée au client).
- `browser.ts` ne référence jamais `service_role`.

## Tests (TDD)

- `requireEnv` : renvoie la valeur si présente ; **throw** avec message clair si
  absente. ~3 cas. C'est le cœur testable.
- Les clients sont de la config (wrapper fin) → couverts par `typecheck` + import
  sans erreur. **Pas** de mock réseau (anti-pattern : tester le mock, pas le code).

## Dépendances à ajouter

- `@supabase/supabase-js`
- `server-only`

## Étapes restantes (post-design)

1. Implémentation TDD (`env.ts` d'abord), puis clients + réconciliation `types.ts`.
2. `typecheck` + `lint` + `test` verts.
3. Merge sur `main`.
