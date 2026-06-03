---
name: supabase-table-create
description: Pattern uniforme pour créer une nouvelle table Supabase (colonnes standard, timestamps, RLS activée par défaut, migration versionnée)
---

# Skill : créer une table Supabase

## Quand utiliser

À chaque nouvelle table dans la base 42Bet. Garantit que toutes les tables suivent la même convention (id, timestamps, RLS).

## Règles non-négociables

1. **Migration versionnée** : créer un fichier SQL dans `supabase/migrations/NNNN_<description>.sql`. Numéro incrémenté à 4 chiffres. **Pas de modif via l'UI Supabase**.
2. **RLS activée** par défaut, même si la table semble "publique". Tu ajoutes ensuite les policies explicites.
3. **Colonnes standard** : `id`, `created_at`, `updated_at` sur toute table.
4. **Naming** : tables au pluriel snake_case (`bets`, `matches`, `users`), colonnes snake_case.
5. **Foreign keys** : toujours `ON DELETE CASCADE` ou `ON DELETE SET NULL` explicite — jamais le défaut.

## Template SQL

```sql
-- supabase/migrations/NNNN_create_<table>.sql

create table public.<table_name> (
  id uuid primary key default gen_random_uuid(),
  -- ... colonnes métier ...
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger pour auto-update du updated_at
create trigger <table_name>_set_updated_at
  before update on public.<table_name>
  for each row execute function public.set_updated_at();

-- RLS obligatoire
alter table public.<table_name> enable row level security;

-- Policies explicites (à adapter)
-- ⚠️ 42Bet utilise NextAuth, pas Supabase Auth → auth.uid() est toujours NULL.
-- Les policies ci-dessous (auth.uid() = user_id) ne s'appliquent donc PAS ici.
-- Modèle réel : SELECT public (using (true)) sur les tables publiques ;
-- écritures server-only via la clé service_role (bypass RLS). Voir la spec
-- docs/superpowers/specs/2026-06-02-database-schema-design.md.
create policy "<table_name>_select_own"
  on public.<table_name> for select
  using (auth.uid() = user_id);

create policy "<table_name>_insert_own"
  on public.<table_name> for insert
  with check (auth.uid() = user_id);

-- ⚠️ INDISPENSABLE : une policy RLS ne suffit PAS. PostgREST vérifie les
-- privilèges SQL AVANT la RLS → sans GRANT, l'API renvoie 42501 « permission
-- denied » (même avec une policy `using (true)`). Les tables créées via
-- migration n'ont PAS les grants auto que donne le dashboard Supabase.
-- Pour une table en lecture publique :
grant select on public.<table_name> to anon, authenticated;
-- (Une table server-only — ex. `bets` — ne reçoit AUCUN grant → deny total.)

-- Index sur les colonnes filtrées fréquemment
create index <table_name>_user_id_idx on public.<table_name>(user_id);
```

## Fonction `set_updated_at` (à créer une fois)

Dans `supabase/migrations/0000_helpers.sql` :

```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
```

## Tables prévues pour 42Bet

| Table | Colonnes clés | Notes |
|---|---|---|
| `users` | `ft_id`, `login`, `coalition_id`, `total_points` | Synchro avec API 42 |
| `coalitions` | `ft_id`, `name`, `color`, `image_url` | Référentiel statique |
| `matches` | `football_data_id`, `home_team`, `away_team`, `kickoff_at`, `home_score`, `away_score`, `status` | Source : football-data.org. `status` = enum `match_status` (`scheduled · live · finished · postponed · cancelled`), défini dans `0000_helpers.sql`. |
| `bets` | `user_id`, `match_id`, `home_score`, `away_score`, `points_awarded` | UNIQUE (user_id, match_id). Bet lock is derived (`now() >= matches.kickoff_at`), not stored. |

## Anti-patterns à refuser

- ❌ Modifier une table via l'UI Supabase (pas reproductible, pas reviewable)
- ❌ Désactiver RLS "temporairement" (ça reste permanent)
- ❌ Activer RLS + policy SELECT **sans** `grant select … to anon` → PostgREST renvoie 42501 « permission denied »
- ❌ Foreign key sans `on delete` explicite
- ❌ Colonnes nommées en camelCase (Postgres = snake_case)
- ❌ Stocker du JSON dans une colonne quand 2-3 colonnes suffisent
- ❌ Oublier l'index sur les FK ou colonnes de filtre

## Étapes pour ajouter une table

1. Vérifier qu'elle n'existe pas déjà dans le tableau ci-dessus
2. Créer `supabase/migrations/NNNN_create_<nom>.sql` en partant du template
3. Documenter la table dans `docs/database-schema.md`
4. Ajouter le type TS dans `src/lib/types.ts`
5. Tester localement : `supabase db reset` (recrée tout depuis les migrations)
6. Commit : `feat(db): add <table> table`
