# Schéma de base de données — 42Bet

> Source de vérité : les migrations dans `supabase/migrations/`. Ce document est
> un résumé lisible. En cas de divergence, les migrations font foi.
> Design validé : `docs/superpowers/specs/2026-06-02-database-schema-design.md`.

## Modèle d'autorisation

- **Auth** : NextAuth.js + OAuth 42 custom → `auth.uid()` est toujours `NULL`.
- **Écritures** (paris, sync, scoring) : serveur Next.js avec la clé **secret**
  (`service_role`, bypass RLS), après vérif de la session NextAuth.
- **Lectures publiques** (classement, matchs, coalitions) : clé **publishable**
  côté navigateur, en lecture seule.
- **RLS** : défense en profondeur. `bets` n'a aucune policy → deny par défaut.
- **GRANT** : une policy RLS ne suffit pas — PostgREST vérifie les privilèges SQL
  avant la RLS. `coalitions`/`users`/`matches` ont `grant select … to anon`
  (migration `0005`). `bets` n'a aucun grant → l'API anon renvoie 42501.

## Helpers (`0000_helpers.sql`)

- `set_updated_at()` : trigger qui met `updated_at = now()` à chaque UPDATE.
- `match_status` : enum `scheduled · live · finished · postponed · cancelled`.
  Le vocabulaire football-data est mappé vers cet enum au moment du sync.

## Tables

### `coalitions`
Référentiel des coalitions 42 (synchro API 42). `ft_id` UNIQUE = clé naturelle.
Lecture publique. Colonnes : `id`, `ft_id`, `name`, `color` (hex), `image_url`,
timestamps.

### `users`
Profil joueur + `total_points` dénormalisé (perf classement). Keyé par l'intra 42
(`ft_id`, `login` UNIQUE). **Pas** de FK vers `auth.users`. `coalition_id` →
`coalitions(id)` `ON DELETE SET NULL`. Lecture publique (classement). Index :
`total_points DESC`, `coalition_id`.

### `matches`
Source football-data.org. `football_data_id` UNIQUE = clé d'idempotence du sync.
`kickoff_at` = **source unique du verrou des paris** (pas de `locked_at`).
`status` = enum `match_status`. `home_score`/`away_score` = score fin 90', NULL
tant que le match n'est pas fini. Lecture publique. Index : `kickoff_at`,
`status`.

### `bets`
Un pari = un user × un match (`UNIQUE (user_id, match_id)`). FK vers `users` et
`matches` en `ON DELETE CASCADE`. `points_awarded` NULL tant que pas scoré
(0/1/3 ensuite, via `calcBetPoints()`). **Aucune policy** → table jamais exposée
au client ; tout passe par le serveur. Index : `match_id`.

## Verrou des paris (dérivé)

Un pari est verrouillé **ssi** `now() >= matches.kickoff_at`. Le serveur refuse
tout insert/update de pari après le coup d'envoi. Aucune colonne ne stocke cet
état.

## Scoring & idempotence

`bets.points_awarded` est rempli par le cron via `calcBetPoints()`, dans la même
transaction qui passe le match en `finished` et incrémente `users.total_points`.
Le cron **skip un match déjà `finished`** → points jamais doublés.

## Validation

Pas de stack local (ni Docker ni Postgres dans l'env de dev). Les migrations
sont appliquées au projet Supabase réel :

```bash
npx supabase login                                   # token d'accès perso
npx supabase link --project-ref yrfstssxuhkdtiuugvgf # mot de passe DB
npx supabase db push                                 # applique les migrations
```

Quand un environnement Docker est disponible, `npx supabase db reset` rejoue
toutes les migrations depuis zéro en local (préférable pour le dev courant).
