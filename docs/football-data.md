# Intégration football-data.org — 42Bet

> Comment 42Bet récupère les fixtures et résultats de la Coupe du Monde.
> Conventions cron : skill [`football-data-sync`](../skills/football-data-sync/SKILL.md).
> Vue d'ensemble des flux : [`architecture.md`](./architecture.md) §3.

## 1. L'API

- Base : `https://api.football-data.org/v4`
- Auth : header **`X-Auth-Token: <clé>`** (env `FOOTBALL_DATA_API_KEY`).
- Tier gratuit : **~10 requêtes / minute**.
- Compétition utilisée : **Coupe du Monde**, code **`WC`**.

Endpoint unique consommé :

```
GET /v4/competitions/WC/matches
```

> **Règle d'or** (skill `football-data-sync` #3 + AGENTS §10) : **un seul appel
> global par tick de cron**. Jamais de boucle « une requête par match ».

Wrapper : `src/lib/football-data.ts` — `fetchWorldCupMatches()`, `server-only`,
`cache: "no-store"`. Sur HTTP 429 il lit `x-requests-available-minute`, loggue un
warning et lève **`ThrottledError`** (le tick s'abandonne proprement, sans planter
le cron).

## 2. Deux crons, deux usages de la même réponse

Les deux routes lisent le **même endpoint** mais en extraient des choses
différentes (toute la logique d'extraction est **pure et testée**).

### a) Ingestion — `GET /api/cron/sync-matches` (`0 4 * * *`)

Remplit / met à jour la table `matches`.

1. Auth `CRON_SECRET` (sinon 401).
2. `fetchWorldCupMatches()`.
3. `parseMatchesForUpsert` (`lib/match-sync.ts`, **pur**) → lignes normalisées :
   - `mapStatus` : statut football-data → statut interne
     (`SCHEDULED/TIMED → scheduled`, `IN_PLAY/PAUSED → live`,
     **`FINISHED` et `AWARDED` → `finished`**).
   - `formatStage` : libellé de phase lisible.
4. RPC Postgres **`upsert_matches`** (migration `0009`) — **upsert idempotent** :
   - `football_data_id` est la clé de dédup ;
   - `finished` est **collant** (un match terminé n'est jamais rétrogradé) ;
   - un **score déjà enregistré n'est jamais écrasé**.
5. Réponse : `{ ok: true, upserted: N }` (ou `{ ok: true, throttled: true }`).

### b) Scoring — `GET /api/cron/sync-results` (`*/5 * * * *`)

Attribue les points des paris des matchs terminés.

1. Auth `CRON_SECRET` (sinon 401).
2. **Gate** `hasMatchInResultWindow` : ne fetch **que** si un match non terminé a
   son `kickoff_at` dans la fenêtre [now − 4 h ; now]. Sinon `skipped: true`
   (économise le quota API).
3. `parseFinishedMatches` (`lib/sync.ts`, **pur**) — ne garde que `FINISHED` /
   `AWARDED` avec un score `fullTime` numérique :

   ```ts
   { id, status, score: { fullTime: { home, away } } }
   //              ▼ parseFinishedMatches (filtre FINISHED|AWARDED)
   { footballDataId, homeScore, awayScore }
   ```

4. Pour chaque match : charge les paris **non scorés** (`points_awarded IS NULL`),
   calcule via `scoreBets`/`calcBetPoints` (**+3** exact, **+1** bon vainqueur/nul,
   **0** sinon).
5. **Idempotence** : match déjà `finished` au même score + aucun pari à scorer → no-op.
6. RPC **`score_match`** (migration `0006`) : écrit le résultat + les points de
   façon **atomique** et incrémente `users.total_points`.
7. Réponse : `{ ok, skipped, throttled, processed, scored, errors }`.

## 3. Statuts football-data (rappel)

| football-data | interne | scoré ? |
|---|---|---|
| `SCHEDULED`, `TIMED` | `scheduled` | non |
| `IN_PLAY`, `PAUSED` | `live` | non |
| `FINISHED` | `finished` | **oui** |
| `AWARDED` (résultat sur tapis / forfait) | `finished` | **oui** |
| `POSTPONED`, `SUSPENDED`, `CANCELLED` | `scheduled` (selon mapping) | non |

> `AWARDED` est traité comme terminé **des deux côtés** (ingestion *et* scoring) :
> son score est définitif. Cohérence verrouillée par un test dédié.

## 4. Tester le scoring en local (sans attendre un vrai match)

Script de dev :

```bash
npm run simulate-score -- <footballDataId> <home> <away>
```

Il appelle le **vrai RPC `score_match`** sur la DB pour rejouer l'attribution des
points d'un match donné (`scripts/simulate-score.ts`).

> ⚠️ Workaround Node 20 : le script injecte un transport WebSocket (`ws` +
> `realtime.transport`) car `@supabase/supabase-js` lève sur Node 20 sans
> WebSocket natif. Supprimable en Node 22+. (`ws`/`@types/ws`/`tsx` sont en
> devDependencies uniquement.)

## 5. Variables d'env & ressources

- `FOOTBALL_DATA_API_KEY` (server-only) — cf. [`.env.local.example`](../.env.local.example).
- `CRON_SECRET` — protège les deux routes cron.
- Doc API : https://www.football-data.org/documentation/quickstart
- Skill projet : [`football-data-sync`](../skills/football-data-sync/SKILL.md)
