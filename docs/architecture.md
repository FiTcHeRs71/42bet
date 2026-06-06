# Architecture & flux de données — 42Bet

> Vue d'ensemble pour quelqu'un qui s'insère dans le projet. Lire d'abord
> [`AGENTS.md`](../AGENTS.md) (conventions) puis cette page (comment l'app
> fonctionne réellement). Détails DB : [`database-schema.md`](./database-schema.md).

## 1. Vue d'ensemble

42Bet est une app **Next.js 16 (App Router)** déployée sur **Vercel**, adossée à
**Supabase (Postgres + RLS)**. Deux sources de données externes :

- **API 42** (`intra.42.fr`) — uniquement pour l'**authentification OAuth** des
  joueurs (login intra). Voir [`api-42.md`](./api-42.md).
- **football-data.org** — fixtures et résultats de la Coupe du Monde. Voir
  [`football-data.md`](./football-data.md).

```
                 ┌──────────────────────────────────────────────┐
   navigateur ──▶│  Next.js (Vercel)                            │
   (joueur 42)   │                                              │
                 │  Server Components ── lecture Supabase        │
                 │  Server Actions ───── écriture des paris      │
                 │  /api/auth/[...nextauth] ── OAuth 42          │
                 │  /api/cron/sync-matches ── ingestion fixtures │
                 │  /api/cron/sync-results ── scoring            │
                 └───────┬───────────────────────┬──────────────┘
                         │                       │
            service_role │                       │ X-Auth-Token / token user
                         ▼                       ▼
                 ┌───────────────┐      ┌──────────────────────┐
                 │  Supabase     │      │  football-data.org    │
                 │  Postgres+RLS │      │  API 42 (OAuth)       │
                 └───────────────┘      └──────────────────────┘
```

## 2. Principe transverse : logique pure vs I/O (SOLID/SRP)

Le découpage le plus important du projet. **Le calcul métier ne fait jamais
d'I/O** ; l'I/O est injecté (DIP) pour rester testable sans réseau ni DB.

| Logique pure (testée, sans I/O) | I/O / adaptateurs |
|---|---|
| `lib/points.ts` — calcul des points (`0 \| 1 \| 3`) | `lib/supabase/*` — clients Supabase |
| `lib/sync.ts` — `parseFinishedMatches`, `scoreBets`, `runSync(deps)` | routes `api/cron/*` — câblent les `SyncDeps` réels |
| `lib/match-sync.ts` — `parseMatchesForUpsert`, `mapStatus` | `lib/football-data.ts` — fetch HTTP (`server-only`) |
| `lib/bet-rules.ts` — verrou au coup d'envoi | `lib/auth/config.ts` — plomberie NextAuth |
| `lib/leaderboard.ts`, `lib/profile.ts`, `lib/match-view.ts` | `lib/bets.ts`, `lib/matches.ts`, `lib/users.ts` (requêtes) |
| `lib/auth/profile.ts` — normalise `/v2/me` | `lib/auth/upsert-player.ts` — upsert via `UpsertDeps` injecté |

Règle pratique : si un module importe `server-only`, Supabase ou `fetch`, ce
n'est **pas** un module pur — sa logique métier doit en être extraite.

## 3. Les trois flux de données

### a) Authentification (login joueur)

1. L'utilisateur clique « se connecter » → `signIn("42")` (NextAuth v5).
2. Redirection OAuth vers l'intra 42, retour sur
   `/api/auth/callback/42` (provider built-in `42-school`, id forcé à `"42"`).
3. NextAuth récupère `/v2/me` **avec le token utilisateur** et le normalise via
   `mapFt42Profile` (pur).
4. Callback `signIn` → `upsertPlayer` (DI) → `upsert` dans `public.users`
   (`onConflict: ft_id`) via `supabaseAdmin` (service_role).
5. Le JWT / la session portent `ftId`, `login`, `avatarUrl`.

Détail complet : [`api-42.md`](./api-42.md).

### b) Ingestion des matchs (cron quotidien)

`GET /api/cron/sync-matches` (Vercel cron `0 4 * * *`) :

1. Vérifie `CRON_SECRET` (sinon 401).
2. `fetchWorldCupMatches()` — **un seul** appel `GET /v4/competitions/WC/matches`.
3. `parseMatchesForUpsert` (pur) → lignes normalisées (statut mappé, stage formaté).
4. RPC Postgres `upsert_matches` — **upsert idempotent** : `finished` est
   « collant » (jamais rétrogradé) et les scores existants ne sont jamais écrasés.

### c) Scoring des paris (cron toutes les 5 min)

`GET /api/cron/sync-results` (Vercel cron `*/5 * * * *`) :

1. Vérifie `CRON_SECRET` (sinon 401).
2. **Gate** `hasMatchInResultWindow` : ne touche au réseau que si un match peut
   être en train de se terminer (kickoff → +4 h). Sinon `skipped: true`.
3. `fetchFinished` → `parseFinishedMatches` (garde `FINISHED` **et** `AWARDED`).
4. Pour chaque match terminé : charge les paris **non scorés**
   (`points_awarded IS NULL`), calcule les points avec `scoreBets`/`calcBetPoints`.
5. **Idempotence** : si le match est déjà `finished` au même score et qu'il ne
   reste aucun pari à scorer → no-op.
6. `persistScore` → RPC `score_match` : écrit le résultat + les points **de façon
   atomique** et incrémente `users.total_points`.

> Les deux crons partagent `fetchWorldCupMatches()` et la classe `ThrottledError`
> (abandon propre du tick si l'API foot rate-limit).

## 4. Rendu des pages (App Router)

Tout le fetch initial se fait en **Server Components** (jamais
`useEffect`/`useState` pour un fetch initial — cf. anti-patterns AGENTS §10).
L'écriture (poser un pari) passe par une **Server Action** (`matches/actions.ts`).

| Route | Rôle | Logique pure derrière |
|---|---|---|
| `/` | Home (hero + prochains matchs + top 3) | — |
| `/matches` | Liste des matchs + formulaire de pari | `match-view.ts`, `bet-rules.ts` |
| `/leaderboard` | Classement général + par coalition | `leaderboard.ts` |
| `/profile/[login]` | Profil + stats + timeline | `profile.ts` |

Composants : `site-header` + `nav-link` (desktop), `bottom-nav` (mobile),
`app-background` (halos), `match-row` (+ écussons), `bet-form`, `auth-button`,
`coalition-badge`. UI = thème **glassy** (Tailwind v4, `@theme` dans `globals.css`,
dark forcé).

## 5. Sécurité & frontières

- **service_role server-only** : `SUPABASE_SERVICE_ROLE_KEY` n'apparaît jamais
  dans un composant `"use client"`. Les écritures (`upsert_matches`, `score_match`,
  upsert joueur) passent par `supabaseAdmin` côté serveur uniquement.
- **RLS systématique** : lecture publique des données non sensibles, chaque
  joueur ne peut écrire que ses propres paris. Écritures cron = service_role.
- **Crons protégés** : `CRON_SECRET` vérifié **en premier**, sinon 401.
- **API 42 / football-data** : tokens en variables d'env, jamais loggés.

## 6. Où regarder en premier (onboarding express)

1. `src/lib/sync.ts` — comprendre le pattern pur + `SyncDeps` (cœur du projet).
2. `src/app/api/cron/*/route.ts` — comment l'I/O réel est câblé.
3. `src/lib/points.ts` + skill `bet-points-calc` — la règle métier centrale.
4. `supabase/migrations/` — le schéma, dans l'ordre `0000` → `0010`.
5. `docs/database-schema.md` puis `api-42.md` / `football-data.md`.
