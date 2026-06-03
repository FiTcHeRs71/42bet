---
name: football-data-sync
description: Pattern pour le cron Vercel qui synchronise les matchs depuis football-data.org, met à jour la DB et déclenche le calcul des points. Idempotent, sécurisé, respectueux du rate limit.
---

# Skill : sync des résultats foot

## Quand utiliser

À l'implémentation et à toute modification du endpoint cron `src/app/api/cron/sync-results/route.ts`.

## Règles non-négociables

1. **Idempotence** : exécuter le cron 100 fois doit produire le même résultat qu'une fois. Pas de double-attribution de points.
2. **Sécurité** : endpoint protégé par `CRON_SECRET` (header `Authorization: Bearer ...`). Vérifié en premier dans le handler.
3. **Rate limit** : 10 req/min côté football-data.org. Une seule passe = un seul `GET` par cron pour la liste des matchs. Lire les headers de réponse `x-requests-available-minute` (requêtes restantes sur la minute) et `x-requestcounter-reset` (secondes avant reset) et back-off si la réserve est basse — recommandation explicite de l'API.
4. **Gate temporel (économie d'appels)** : avant tout appel réseau, vérifier en DB qu'au moins un match est dans sa **fenêtre de résultat** (`status != 'finished' AND kickoff <= now() AND kickoff >= now() - 4h`). Si aucun → return `200 {skipped:true}` **sans appeler l'API**. La marge de 4h couvre prolongations + tirs au but en phase finale. On ne sait jamais qu'un match est fini sans demander : on requête donc seulement quand un match *peut* être en train de finir, pas à vide.
5. **Transaction** : la mise à jour du match + calcul des points sur ses paris doit être atomique. Sinon : risque d'avoir le score à jour sans les points calculés.
6. **Cron unique** : tier gratuit Vercel = 2 crons max. Tout passe par `/api/cron/sync-results`, déclenché toutes les **5 minutes**.

## Flow

> **Prérequis** : le calendrier WC doit déjà être en DB (table `matches`, matchs en `scheduled`) pour que le gate de l'étape 2 ait quelque chose à interroger. Seedé une fois + rafraîchi 1×/jour (horaires susceptibles de changer).

```
1. Auth cron (header Bearer == CRON_SECRET) — sinon 401
2. GATE : SELECT en DB → un match avec status!='finished' ET kickoff <= now() ET kickoff >= now()-4h ?
   → NON  : return 200 {skipped:true}  (AUCUN appel API)
   → OUI  : continuer
3. GET football-data.org → matchs Coupe du Monde (compétition code `WC`) — 1 seul appel
4. Pour chaque match dont status = FINISHED :
   a. SELECT en DB → si déjà status='finished' avec scores : skip (idempotent)
   b. UPDATE match (home_score, away_score, status='finished')
   c. SELECT tous les bets liés à ce match
   d. Pour chaque bet : calcBetPoints() → UPDATE bet.points_awarded + UPDATE user.total_points
   e. (étapes b-d dans une seule transaction SQL)
5. Log : nombre de matchs traités, nombre de paris scorés
6. Return 200 avec résumé
```

## Structure réalisée

Implémenté via un orchestrateur en **injection de dépendances** : toute la logique
(gate, throttle, idempotence par match, isolation d'erreurs) vit dans `runSync`
— pur, testé avec des fakes, zéro mock de Supabase/`fetch`. La route est un
adaptateur mince qui câble les vraies I/O.

| Couche | Fichier | Rôle |
|---|---|---|
| Route (adaptateur) | `src/app/api/cron/sync-results/route.ts` | Auth → build `SyncDeps` → `runSync` → JSON |
| Orchestrateur (pur, DI) | `src/lib/sync.ts` | `runSync`, `parseFinishedMatches`, `scoreBets`, `ThrottledError` |
| Fetch foot (server-only) | `src/lib/football-data.ts` | 1 `GET` global WC, 429 → `ThrottledError` |
| Persistance atomique | `supabase/migrations/0006_score_match.sql` | RPC `score_match` — 1 transaction, garde d'idempotence SQL (`points_awarded IS NULL`) |
| Calcul des points | `src/lib/points.ts` (`calcBetPoints`) | règle pure, jamais réimplémentée |

```ts
// src/app/api/cron/sync-results/route.ts (squelette)
export const dynamic = "force-dynamic"; // pas de cache

export async function GET(req: Request) {
  // 1. Auth — vérifiée en premier.
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Câbler les vraies I/O (Supabase + football-data) dans l'orchestrateur pur.
  const deps: SyncDeps = { hasMatchInResultWindow, fetchFinished, loadMatchWithUnscoredBets, persistScore };

  // 3. Exécuter et reporter.
  const summary = await runSync(deps);
  return Response.json({ ok: true, ...summary });
}
```

## Config `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/sync-results", "schedule": "*/5 * * * *" }
  ]
}
```

## Anti-patterns à refuser

- ❌ Recalculer les points pour un match déjà finalisé (double attribution)
- ❌ UPDATE match sans vérifier que le résultat a vraiment changé
- ❌ Boucle qui appelle football-data.org par match (1 seul appel global)
- ❌ Appeler l'API alors qu'aucun match n'est dans sa fenêtre de résultat (gaspille la réserve de rate limit — voir gate temporel, règle 4)
- ❌ Ignorer les headers de throttling `x-requests-available-minute` / `x-requestcounter-reset`
- ❌ Endpoint cron sans vérif de `CRON_SECRET` (n'importe qui pourrait le déclencher)
- ❌ Calcul des points hors de [[bet-points-calc]] (réimplémente la règle)
- ❌ Cron qui prend > 10s (timeout Vercel sur free tier)

## Liens

- [[bet-points-calc]] — fonction pure utilisée à l'étape 3.d
