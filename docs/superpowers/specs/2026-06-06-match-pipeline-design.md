# Feature A — Pipeline matchs (ingestion + simulation scoring) — Design

> Spec validée le 2026-06-06. Phase pré-déploiement (workflow assoupli, cf.
> AGENTS.md §8). Feature B (pipeline coalitions / photos) fera l'objet d'un spec
> séparé ultérieur.

## 1. Contexte & problème

L'API football-data.org fonctionne (clé OK) : la Coupe du Monde 2026 (`WC`)
expose **104 matchs réels** (11 juin → 19 juillet 2026), avec équipes, crests,
stage/groupe et `utcDate`. Vérifié en direct le 2026-06-06.

**Le chaînon manquant** : aucune brique n'insère ces matchs dans la table
`matches`. Les seuls matchs présents viennent du seed de dev
(`0008_seed_matches.sql`, 7 fixtures factices `football_data_id` 900001–900007).
Le cron `sync-results` **n'insère jamais** de match : il ne fait que *mettre à
jour le score* d'un match déjà présent dont le `football_data_id` correspond à
un match `FINISHED` renvoyé par l'API. Les ids du seed étant bidons, le scoring
ne peut pas se déclencher sur des données réelles.

Conséquence : on ne voit pas les vrais matchs, et on ne peut pas tester
l'attribution de points de bout en bout avant le déploiement.

## 2. Objectif

Avant déploiement, pouvoir :
1. **Voir les vrais matchs CM** dans l'app (ingestion depuis l'API).
2. **Simuler l'attribution de points** de bout en bout (pari → résultat →
   points → classement/profil), sans attendre le 11 juin.

Hors périmètre (Feature B, spec séparé) : peuplement des coalitions depuis
l'intra 42 et assignation de la coalition d'un joueur. Aujourd'hui la table
`coalitions` est vide et `upsert-player` n'écrit pas de coalition — donc les
badges/photos de coalition restent vides. Ce n'est **pas** traité ici.

## 3. Faits de schéma (vérifiés)

- `matches` possède déjà `home_crest_url` / `away_crest_url` (nullable) → **pas
  de migration de colonne** pour les crests.
- Enum `match_status` : `scheduled | live | finished | postponed | cancelled`.
- `score_match(p_fd_id int, p_home int, p_away int, p_scored jsonb)` : met le
  match à `finished` + applique les points aux paris `points_awarded IS NULL` +
  incrémente `users.total_points`. Idempotent. `grant execute … to service_role`.
- `bets.match_id … on delete cascade` (supprimer un match supprime ses paris).
- `matches` : RLS lecture publique ; écritures server-only (service_role).

## 4. Architecture

Suit les patterns existants : **logique pure isolée + I/O injecté/serveur +
fonction Postgres pour l'écriture atomique** (comme `sync.ts` / `score_match`).

### 4.1 Ingestion

- **`src/lib/match-sync.ts`** (pur, sans `server-only`, testable) :
  - `type FdFixture` — sous-ensemble du payload API utile à l'ingestion :
    `id`, `utcDate`, `status`, `stage`, `group`, `homeTeam{name,crest}`,
    `awayTeam{name,crest}`.
  - `type MatchUpsertRow` — ligne destinée à la DB : `football_data_id`,
    `home_team`, `away_team`, `home_crest_url`, `away_crest_url`, `stage`,
    `kickoff_at`, `status`.
  - `mapStatus(apiStatus: string): MatchStatus` — table de correspondance :
    - `SCHEDULED`, `TIMED` → `scheduled`
    - `IN_PLAY`, `PAUSED`, `SUSPENDED` → `live`
    - `FINISHED` → `finished`
    - `POSTPONED` → `postponed`
    - `CANCELLED` (et inconnu/`AWARDED`) → `cancelled`
  - `formatStage(stage, group): string | null` — ex. `GROUP_STAGE` + `GROUP_A`
    → `"Groupe A"` ; sinon libellé lisible du stage (`LAST_16` → `"8es"`, etc.),
    `null` si absent.
  - `parseMatchesForUpsert(res): MatchUpsertRow[]` — mappe tous les matchs.

- **`src/lib/football-data.ts`** : enrichir le type de réponse pour exposer les
  champs fixture (sans casser `sync.ts` qui n'en lit qu'un sous-ensemble). Le
  `fetchWorldCupMatches()` existant est réutilisé (même endpoint, une requête).

- **Migration `0009_upsert_matches.sql`** : fonction
  `upsert_matches(p_matches jsonb) returns jsonb` (plpgsql, `service_role`) :
  `insert into matches (…) select … from jsonb_to_recordset(p_matches)`
  `on conflict (football_data_id) do update set` — met à jour **uniquement** les
  champs fixture (équipes, crests, stage, kickoff_at, status) et **jamais**
  `home_score`/`away_score`. Statut `finished` **collant** :
  `status = case when matches.status = 'finished' then matches.status else excluded.status end`.
  Renvoie `{ upserted: <count> }`. `revoke … from public; grant execute … to service_role`.

- **Route `src/app/api/cron/sync-matches/route.ts`** (`export const dynamic =
  "force-dynamic"`) :
  1. Auth : `authorization` doit valoir `Bearer ${CRON_SECRET}`, sinon `401`.
  2. `fetchWorldCupMatches()` → `parseMatchesForUpsert()` →
     `supabaseAdmin.rpc("upsert_matches", { p_matches })`.
  3. Renvoie `{ ok: true, upserted }`. Gère `ThrottledError` (abandon propre,
     `{ ok: true, throttled: true }`).

- **`vercel.json`** : ajouter un cron `sync-matches`, **1×/jour** (`0 4 * * *`).
  Le cron `sync-results` (toutes les 5 min) reste inchangé.

### 4.2 Nettoyage du seed factice

- **Migration `0010_remove_dev_seed_matches.sql`** :
  `delete from public.matches where football_data_id between 900001 and 900007;`
  ⚠️ cascade sur d'éventuels `bets` de dev (sans risque).

### 4.3 Affichage des crests (UI)

- **`src/components/match-row.tsx`** : petit `<img>` écusson (~18–20px, `ring-1
  ring-white/15`, `// eslint-disable-next-line @next/next/no-img-element`) à
  côté de chaque nom d'équipe. Fallback : rien (ou pastille neutre) si null.
  Crests **uniquement sur `/matches`** pour l'instant (home inchangée).

### 4.4 Simulation de scoring (outil dev)

- **`scripts/simulate-score.ts`** (dev-only, jamais importé par l'app runtime) :
  - Args CLI : `footballDataId homeScore awayScore`.
  - Charge les paris non scorés du match via `supabaseAdmin`
    (même requête que le dep `loadMatchWithUnscoredBets` du cron).
  - Calcule les points avec `scoreBets`/`calcBetPoints` (réutilise la logique
    centralisée — pas de réimplémentation, AGENTS.md §7).
  - Appelle le **vrai** `score_match` RPC avec le résultat choisi.
  - Affiche un résumé (`scored`, total par joueur).
  - Lancé via `npx tsx scripts/simulate-score.ts <id> <h> <a>`.

## 5. Flux de données

```
[Vercel cron 1×/j] ─▶ GET /api/cron/sync-matches (CRON_SECRET)
                         └▶ fetchWorldCupMatches() ─▶ parseMatchesForUpsert()
                              └▶ rpc upsert_matches(jsonb) ─▶ table matches
                                   (fixtures + crests, scores intacts)

/matches (server) ─▶ listMatches() ─▶ MatchRow (affiche crests)

[dev] place bets ─▶ scripts/simulate-score id h a
        └▶ load unscored bets ─▶ scoreBets() ─▶ rpc score_match()
             └▶ bets.points_awarded + users.total_points
                  └▶ /leaderboard, /profile reflètent les points
```

## 6. Gestion des erreurs

- **Auth cron** : header absent/incorrect → `401` (vérifié en premier).
- **Throttle API** (`429`) : `ThrottledError` → la route renvoie
  `{ ok: true, throttled: true }` sans écrire.
- **Autre HTTP / erreur DB** : propagée (la route renvoie 500 par défaut Next).
- **Upsert** : `upsert_matches` est atomique (une transaction de fonction).
- **Script** : si match introuvable ou 0 pari non scoré → message clair, exit 1.

## 7. Stratégie de test

- **Unitaires (nouveaux)** : `mapStatus` (tous les cas), `formatStage`,
  `parseMatchesForUpsert` (mapping complet, crests null, etc.). Fichier
  `tests/match-sync.test.ts`. Logique pure, pas d'I/O.
- **Non-régression** : les 75 tests existants restent verts.
- **Manuel local** (procédure §8) : ingestion via curl + revue `/matches` ;
  scoring via `simulate-score` + revue `/leaderboard`/`/profile` + relance
  (idempotence).
- `score_match` (déjà en prod) est exercé en vrai par le script.

## 8. Procédure de validation (local, sans déploiement)

1. Appliquer les migrations 0009 + 0010 au Supabase lié.
2. `npm run dev`.
3. **Ingestion** :
   `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-matches`
   → `{ ok, upserted: 104 }` → ouvrir `/matches` : vrais matchs CM + crests.
4. **Pari** : se connecter (42), parier sur 2-3 matchs à venir.
5. **Scoring** : `npx tsx scripts/simulate-score.ts <id> 2 1`
   → vérifier `/leaderboard` + `/profile` (points attendus selon `calcBetPoints`).
6. **Idempotence** : relancer la même commande → `scored: 0`, totaux inchangés.
7. (Optionnel) **Déploiement Vercel** en dernier : env vars + 2 crons,
   smoke test du cron réel + env prod.

## 9. Décisions tranchées

- **A.** Seed factice supprimé via migration (0010). ✅
- **B.** Cron `sync-matches` quotidien dans `vercel.json`. ✅
- **C.** Crests affichés sur `/matches` uniquement (home inchangée). ✅
- Déclencheur ingestion = endpoint cron protégé (manuel + planifié). ✅
- Simulation scoring = script dev → vrai `score_match` RPC. ✅

## 10. Hors périmètre (rappel)

- Feature B : coalitions (fetch intra 42 + assignation joueur + photos).
- Pas de refonte de `sync-results` ni de la logique de points (déjà testées).
- Pas d'odds, pas de scores live minute par minute (90' fullTime uniquement).
