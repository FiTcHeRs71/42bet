# Design — Schéma de base de données 42Bet

> Statut : **design validé** (sections tables + RLS/migrations validées par l'utilisateur le 2026-06-02).
> Étapes restantes du process brainstorming : relecture finale de cette spec par l'utilisateur → `writing-plans` (plan d'implémentation) → migrations.
> Issu de la session du 2026-06-02 (skill `superpowers:brainstorming`).

## Contexte

Première brique « données » du MVP 42Bet. Toutes les autres features (paris, classement, sync, points) dépendent de ce schéma. Conçu en suivant les skills `supabase-table-create`, `bet-points-calc`, `football-data-sync`, `coalition-badge`.

## Décisions structurantes (tranchées en session)

1. **Modèle d'autorisation = server-only + service_role.**
   L'auth passe par **NextAuth.js + provider OAuth 42 custom**, *pas* Supabase Auth → `auth.uid()` est `NULL` dans les policies, donc inutilisable.
   - Toutes les **écritures** (poser un pari, sync, scoring) passent par le **serveur Next.js** avec la **clé secret** (`service_role`, bypass RLS), après vérif de la session NextAuth.
   - La **clé publishable** (navigateur) ne fait que **lire le public** (classement, matchs, coalitions). Aucune écriture client, nulle part.
   - RLS = défense en profondeur.

2. **Pari sur le temps réglementaire 90'.**
   Pour les matchs à élimination directe (prolongations / tirs au but possibles), le pronostic porte sur le score **fin des 90 min** (`score.fullTime` côté football-data). Un nul après 90' reste un nul pour les points. Une seule paire `home_score/away_score`. `calcBetPoints()` (skill `bet-points-calc`) marche tel quel.

3. **Enum `match_status` simplifié.**
   `scheduled · live · finished · postponed · cancelled`. Le vocabulaire football-data (SCHEDULED/TIMED/IN_PLAY/PAUSED/FINISHED/SUSPENDED/POSTPONED/CANCELLED/AWARDED) est **mappé** vers cet enum au moment du sync → notre logique (gate temporel, points) ne dépend pas de leur vocabulaire.

4. **Verrou des paris dérivé, pas stocké.**
   Pas de colonne `locked_at`. Source de vérité unique : un pari est verrouillé ssi `now() >= matches.kickoff_at`. Le serveur refuse insert/update de pari après le coup d'envoi.
   → **TODO implémentation** : mettre à jour la skill `supabase-table-create` (son tableau liste encore `locked_at`).

## Conventions (skills)

- Tables pluriel snake_case ; colonnes snake_case.
- `id uuid` + `created_at` + `updated_at` partout ; trigger `set_updated_at`.
- FK toujours avec `on delete` explicite.
- RLS activée partout ; policies explicites.

## Tables

### `coalitions` (référentiel, synchro API 42)
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `ft_id` | integer UNIQUE NOT NULL | id coalition intra 42 |
| `name` | text NOT NULL | |
| `color` | text NOT NULL | hex, badge (skill `coalition-badge`) |
| `image_url` | text NULL | |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now() | |

### `users` (profil + points, keyé par l'intra 42)
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | **pas** de FK vers `auth.users` |
| `ft_id` | integer UNIQUE NOT NULL | clé naturelle 42 |
| `login` | text UNIQUE NOT NULL | |
| `avatar_url` | text NULL | photo 42 |
| `coalition_id` | uuid NULL → `coalitions(id)` **ON DELETE SET NULL** | |
| `total_points` | integer NOT NULL DEFAULT 0 | dénormalisé (perf classement) |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now() | |

> Pas d'email ni de champ sensible → table lisible publiquement (classement). « piscineux vs cursus » : reporté (YAGNI MVP).

### `matches` (source football-data.org)
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `football_data_id` | integer UNIQUE NOT NULL | **clé d'idempotence** du sync |
| `home_team` / `away_team` | text NOT NULL | |
| `home_crest_url` / `away_crest_url` | text NULL | logos (UI) |
| `stage` | text NULL | groupe / 8e / quart… (affichage) |
| `kickoff_at` | timestamptz NOT NULL | **source du verrou des paris** |
| `status` | `match_status` NOT NULL DEFAULT `'scheduled'` | enum simplifié |
| `home_score` / `away_score` | integer NULL | score fin 90', NULL tant que pas fini |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now() | |

### `bets` (un pari = un user × un match)
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `users(id)` **ON DELETE CASCADE** | |
| `match_id` | uuid NOT NULL → `matches(id)` **ON DELETE CASCADE** | |
| `home_score` / `away_score` | integer NOT NULL | la prédiction |
| `points_awarded` | integer NULL | NULL = pas encore scoré ; rempli par le cron |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now() | |
| | | **UNIQUE (user_id, match_id)** |

## RLS (modèle server-only + service_role)

Rôles : `anon` (publishable, navigateur) · `service_role` (secret, serveur, bypass RLS) · `authenticated` (inutilisé). On n'écrit que des policies `anon`.

| Table | Policy `anon` | Écriture |
|---|---|---|
| `coalitions` | SELECT public (`using (true)`) | aucune (serveur via service_role) |
| `matches` | SELECT public | aucune |
| `users` | SELECT public | aucune |
| `bets` | **aucune policy** → deny par défaut | aucune |

- Classement + liste matchs : lisibles côté client (lecture seule, clé publishable).
- Paris : jamais exposés au client ; lus/écrits **uniquement** côté serveur (clé secret) après vérif session NextAuth.
- `bets` sans policy = protection clé (un user ne peut pas lire/copier les paris des autres avant le coup d'envoi).

## Index

| Table | Index |
|---|---|
| `coalitions` | `ft_id` UNIQUE |
| `users` | `ft_id` UNIQUE · `login` UNIQUE · `(total_points DESC)` · `coalition_id` |
| `matches` | `football_data_id` UNIQUE · `kickoff_at` · `status` |
| `bets` | `(user_id, match_id)` UNIQUE · `user_id` · `match_id` |

## Plan de migrations (versionnées, ordre = FK)

```
supabase/migrations/
├── 0000_helpers.sql        -- fn set_updated_at() + CREATE TYPE match_status
├── 0001_create_coalitions.sql
├── 0002_create_users.sql   -- FK → coalitions (set null)
├── 0003_create_matches.sql
└── 0004_create_bets.sql    -- FK → users, matches (cascade) + UNIQUE(user_id,match_id)
```

Chaque fichier : `create table` + trigger `set_updated_at` + `enable row level security` + policies + index. Pas de seed (coalitions/matchs viennent des syncs API). Test local : `supabase db reset`.

## Intégration points & idempotence

- `bets.points_awarded` (NULL → 0/1/3) rempli par le cron via `calcBetPoints()`, dans la **transaction** qui passe le match en `finished`.
- Idempotence : le cron **skip un match déjà `finished`** → `points_awarded` et `users.total_points` jamais recalculés/doublés.
- `users.total_points` incrémenté dans cette même transaction.

## Étapes restantes (post-design)

1. Relecture de cette spec par l'utilisateur.
2. `superpowers:writing-plans` → plan d'implémentation détaillé.
3. Écriture des 5 migrations (skill `supabase-table-create`).
4. Mise à jour skill `supabase-table-create` (retrait `locked_at`, ajout enum `match_status`).
5. `docs/database-schema.md` + types TS dans `src/lib/types.ts`.
6. `supabase db reset` pour valider localement.
