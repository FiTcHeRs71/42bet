# Design — brique `sync-results` (cron football-data)

> Date : 2026-06-03 · Statut : validé, prêt pour plan d'implémentation
> Skill de référence : [`football-data-sync`](../../../skills/football-data-sync/SKILL.md)

## 1. But

Endpoint cron Vercel `/api/cron/sync-results`, déclenché toutes les 5 min, qui :
synchronise les scores des matchs Coupe du Monde finis depuis football-data.org,
score les paris associés, et met à jour les totaux des joueurs — de façon
**idempotente**, **sécurisée**, et **respectueuse du rate limit**.

Périmètre : **sync des résultats uniquement**. Le seed/refresh du calendrier WC
(insertion des matchs en `scheduled`) est une brique séparée. Pour tester cette
brique, on insère quelques matchs à la main.

## 2. Contrainte de design centrale

La règle non-négociable #7 (AGENTS.md) impose que le calcul des points vive
**uniquement** dans `src/lib/points.ts` (`calcBetPoints`), jamais réimplémenté.
La skill `football-data-sync` impose que le scoring soit **atomique** (une
transaction Postgres).

Conséquence : **on ne calcule pas les points en SQL**. Résolution :
**TS calcule (`calcBetPoints`), la RPC persiste atomiquement**. La fonction SQL
reçoit les points déjà calculés et se contente de les écrire dans une seule
transaction.

## 3. Architecture — 4 unités à responsabilité isolée

### 3.1 `src/lib/football-data.ts` — wrapper I/O (server-only)
- `import "server-only"`.
- header `X-Auth-Token: FOOTBALL_DATA_API_KEY` (via `requireEnv`).
- lit les headers de throttle `x-requests-available-minute` et
  `x-requestcounter-reset` ; si la réserve est basse, signale au caller de
  back-off (ne pas insister).
- expose `fetchWorldCupMatches()` → réponse brute typée de l'API (compétition `WC`).
- **jamais** de calcul métier ici. Pas de leak de la clé dans les logs.

### 3.2 `src/lib/sync.ts` — logique pure (testable, zéro I/O)
- `parseFinishedMatches(apiResponse)` →
  `{ footballDataId: number; homeScore: number; awayScore: number }[]`
  - filtre `match.status === 'FINISHED'`
  - mappe `score.fullTime.home` / `score.fullTime.away` (90' uniquement)
  - ignore les matchs FINISHED sans `fullTime` exploitable (défensif)
- `scoreBets(bets, result)` → `{ betId; userId; points }[]`
  - réutilise `calcBetPoints()` pour chaque bet
  - n'opère que sur les bets fournis (le caller ne passe que ceux `points_awarded IS NULL`)

### 3.3 Migration `supabase/migrations/0006_score_match.sql` — transaction atomique
Fonction `public.score_match(p_fd_id int, p_home int, p_away int, p_scored jsonb)`
`returns jsonb` (résumé : nb bets scorés), `language plpgsql`, `security definer` :
1. `UPDATE matches SET home_score=p_home, away_score=p_away, status='finished'
    WHERE football_data_id = p_fd_id` (récupère l'`id` du match).
2. `UPDATE bets SET points_awarded = (élément).points
    FROM jsonb_to_recordset(p_scored) WHERE bets.id = (élément).bet_id
    AND bets.points_awarded IS NULL` ← **garde d'idempotence en SQL**.
3. `UPDATE users SET total_points = total_points + (somme des points)
    WHERE id IN (...)` — uniquement pour les bets **réellement** mis à jour à
    l'étape 2 (sinon double comptage au replay).
- Tout le corps = une seule transaction implicite (rollback complet si erreur).
- `GRANT EXECUTE` au rôle `service_role` uniquement (appelée via `supabaseAdmin`).

### 3.4 `src/app/api/cron/sync-results/route.ts` — orchestration mince
- `export const dynamic = "force-dynamic"` (pas de cache).
- `GET(req)` : auth → gate → fetch → score → résumé. Aucune logique métier
  inline (déléguée aux unités ci-dessus).

## 4. Flow d'idempotence

```
1. Auth : header Authorization == `Bearer ${CRON_SECRET}` ? sinon 401
2. GATE (1 SELECT) : existe-t-il un match
      status != 'finished' AND kickoff_at <= now() AND kickoff_at >= now() - interval '4h' ?
   → NON : return 200 { skipped: true }   (AUCUN appel réseau)
   → OUI : continuer
3. fetchWorldCupMatches() — 1 seul GET global (jamais une boucle par match)
4. parseFinishedMatches() → matchs FINISHED avec score.fullTime
5. Pour chaque match fini :
   a. SELECT match + ses bets WHERE points_awarded IS NULL
      → 0 bet non scoré ET match déjà 'finished' avec mêmes scores ? skip (no-op)
   b. scoreBets() → calcBetPoints() pour chaque bet non scoré (TS pur, règle #7)
   c. rpc('score_match', { p_fd_id, p_home, p_away, p_scored })
6. return 200 { processed: N, scored: M, skipped?: false }
```

**Double garde d'idempotence** : TS ne calcule que les bets `points_awarded IS NULL`,
**et** la RPC ne met à jour que `WHERE points_awarded IS NULL`. Rejouer le cron
100× ne double jamais les points, même en cas de course.

La marge de 4h du gate couvre prolongations + tirs au but (on stocke malgré tout
le score 90' = `fullTime`, conformément au schéma `matches`).

## 5. Gestion d'erreurs

- **football-data 429 / réserve basse** : log + `return 200 { throttled: true }`
  sans crash. Le tick suivant (5 min) reprendra.
- **RPC en échec sur un match** : `try/catch` par match ; un match qui plante
  n'empêche pas les autres. Le nombre d'erreurs figure dans le résumé. La
  transaction d'un match reste tout-ou-rien (corps de la fonction SQL).
- **Budget temps** : le handler doit rester < ~10s (timeout Vercel free tier).
- **Pas de secret dans les logs** (clé API, CRON_SECRET).

## 6. Stratégie de tests (Vitest, TDD)

- **`src/lib/sync.ts` (pur)** — testé à fond :
  - `parseFinishedMatches` : FINISHED filtré, `score.fullTime` mappé, `fullTime`
    null/absent ignoré, statuts non finis exclus.
  - `scoreBets` : délègue bien à `calcBetPoints`, mappe `betId`/`userId`/`points`.
- **`score_match` (SQL)** — l'idempotence est la propriété critique. Testée si
  un accès DB local est disponible en test ; sinon documentée + vérifiée
  manuellement (procédure décrite dans le plan d'impl).
- **Route handler** — test léger, `supabaseAdmin` + `fetchWorldCupMatches`
  mockés :
  - 401 si header absent/incorrect,
  - `skipped: true` si gate vide (et **aucun** appel réseau),
  - scoring déclenché si un match fini est présent.
- **`football-data.ts`** — pas de test réseau ; la logique de throttle, si
  extraite, peut faire l'objet d'un petit test pur.

## 7. Variables d'environnement

Toutes déjà présentes dans `.env.local.example` :
- `FOOTBALL_DATA_API_KEY` (server-only)
- `CRON_SECRET` (server-only)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (via `supabaseAdmin`)

Aucune nouvelle variable.

## 8. Hors périmètre (YAGNI)

- Seed / refresh du calendrier WC (brique séparée).
- Gestion des prolongations stockée séparément (on garde `fullTime` 90').
- Notifications / temps réel.
- Retry/backoff sophistiqué au-delà du simple skip sur throttle.
