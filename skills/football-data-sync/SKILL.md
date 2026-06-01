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
3. **Rate limit** : 10 req/min côté football-data.org. Une seule passe = un seul `GET` par cron pour la liste des matchs.
4. **Transaction** : la mise à jour du match + calcul des points sur ses paris doit être atomique. Sinon : risque d'avoir le score à jour sans les points calculés.
5. **Cron unique** : tier gratuit Vercel = 2 crons max. Tout passe par `/api/cron/sync-results`, déclenché toutes les **5 minutes**.

## Flow

```
1. Auth cron (header Bearer == CRON_SECRET) — sinon 401
2. GET football-data.org → matchs Coupe du Monde
3. Pour chaque match dont status = FINISHED :
   a. SELECT en DB → si déjà status='finished' avec scores : skip (idempotent)
   b. UPDATE match (home_score, away_score, status='finished')
   c. SELECT tous les bets liés à ce match
   d. Pour chaque bet : calcBetPoints() → UPDATE bet.points_awarded + UPDATE user.total_points
   e. (étapes b-d dans une seule transaction SQL)
4. Log : nombre de matchs traités, nombre de paris scorés
5. Return 200 avec résumé
```

## Structure attendue

```ts
// src/app/api/cron/sync-results/route.ts
export const dynamic = "force-dynamic"; // pas de cache

export async function GET(req: Request) {
  // 1. Auth
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Fetch + sync
  const matches = await fetchFinishedMatches();
  const results = await syncMatches(matches);

  return Response.json({ ok: true, ...results });
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
- ❌ Endpoint cron sans vérif de `CRON_SECRET` (n'importe qui pourrait le déclencher)
- ❌ Calcul des points hors de [[bet-points-calc]] (réimplémente la règle)
- ❌ Cron qui prend > 10s (timeout Vercel sur free tier)

## Liens

- [[bet-points-calc]] — fonction pure utilisée à l'étape 3.d
