# Runbook — Matchs amicaux (alpha)

Les amicaux ne sont pas couverts par le sync football-data (cron World Cup
uniquement). On les gère **à la main** pendant l'alpha. Procédure par match.

## 1. Créer le match (SQL editor Supabase prod)

```sql
insert into public.matches
  (football_data_id, home_team, away_team, kickoff_at, status)
values
  (<fd_id_unique>, '<Domicile>', '<Extérieur>', '<YYYY-MM-DDTHH:MM:SSZ>', 'scheduled');
```

- `football_data_id` : id réel football-data si dispo, sinon une valeur convenue
  et unique (sert de clé pour `simulate-score`).
- `kickoff_at` en UTC : les paris se ferment automatiquement à cette heure.

## 2. Phase de paris

Les testeurs parient via l'UI. Aucun geste côté admin.

## 3. Scoring après le résultat réel

Depuis une machine de dev, avec `.env.local` **pointé sur la DB prod**
(`SUPABASE_SERVICE_ROLE_KEY` de prod) :

```bash
npm run simulate-score -- <football_data_id> <home> <away>
```

`score_match` passe le match en `finished`, note les paris non scorés et met à
jour `users.total_points`. Idempotent : relancer ne double pas les points.

> ⚠️ Sécurité : le `service_role` prod ne vit que dans `.env.local` (gitignoré),
> réservé aux deux contributeurs. Ne jamais le committer ni l'exposer côté client.
