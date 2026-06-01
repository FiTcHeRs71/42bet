# Supabase — 42Bet

Schéma de base de données versionné via migrations SQL.

## Règles

- **Toute modif passe par une migration** dans `migrations/`
- **Jamais de modif via l'UI Supabase** (pas reproductible, pas reviewable)
- Voir [`skills/supabase-table-create`](../skills/supabase-table-create/SKILL.md) pour le pattern de création de table

## Convention de nommage

`NNNN_<description>.sql` — 4 chiffres incrémentés.

Ex : `0001_create_users.sql`, `0002_create_matches.sql`.

## Premier reset local

```bash
supabase db reset
```

(Nécessite l'install Supabase CLI : https://supabase.com/docs/guides/cli)

## Migrations à venir

- `0000_helpers.sql` — fonction `set_updated_at()` (cf. skill)
- `0001_create_coalitions.sql`
- `0002_create_users.sql`
- `0003_create_matches.sql`
- `0004_create_bets.sql`
