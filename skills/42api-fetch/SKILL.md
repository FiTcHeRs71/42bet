---
name: 42api-fetch
description: Wrapper standard pour appeler l'API 42 (intra.42.fr) avec respect de la limite 2 req/sec et 1200 req/h, gestion automatique du token OAuth2 et typage des réponses
---

# Skill : appel API 42

## Quand utiliser

À **chaque** appel à `https://api.intra.42.fr/v2/...` côté server (App Router server actions, route handlers, cron). **Jamais** depuis le client (la clé secret OAuth ne doit pas fuiter).

## Règles non-négociables

1. **Rate limit** : 2 req/sec, 1200 req/h. Toujours passer par le wrapper `fetch42()` qui implémente le throttling.
2. **Token** : ne jamais hardcoder. Utiliser `getApi42Token()` qui cache le token applicatif (valide ~2h) en mémoire.
3. **Erreurs** : toute erreur de l'API 42 doit lever une exception typée `Api42Error` avec le code HTTP, jamais retourner `null` silencieusement.
4. **Endpoint** : toujours préfixer par `/v2/`, jamais d'URL complète en dur.
5. **Pagination** : utiliser `fetch42Paginated()` pour les endpoints paginés (`page[number]`, `page[size]=100`).

## Endpoints utilisés par le projet

| Endpoint | Usage |
|---|---|
| `GET /v2/me` | Profil de l'utilisateur connecté (auth OAuth) |
| `GET /v2/users/:user_id/coalitions` | Coalition d'un user |
| `GET /v2/campus/33/users` | Lister les users du campus Lausanne (paginé) |
| `GET /v2/coalitions` | Toutes les coalitions du campus |

## Structure attendue

Code dans `src/lib/api-42.ts` :

```ts
const BASE = "https://api.intra.42.fr";

export class Api42Error extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API 42 error ${status}`);
  }
}

// Token applicatif (client_credentials) caché en mémoire avec expiration
async function getApi42Token(): Promise<string> { /* ... */ }

// Wrapper bas niveau : applique rate limit + auth + typage erreurs
export async function fetch42<T>(
  path: string,
  init?: RequestInit
): Promise<T> { /* ... */ }

// Helper pour endpoints paginés
export async function fetch42Paginated<T>(
  path: string,
  pageSize = 100
): Promise<T[]> { /* ... */ }
```

## Rate limiting

Utiliser une queue simple (token bucket) côté server. Implémentation suggérée : un module singleton avec `setTimeout` qui assure ≤ 2 req/sec. Pas de dépendance externe nécessaire pour le MVP.

## Étapes pour ajouter un nouvel endpoint

1. Vérifier si l'endpoint est déjà listé ci-dessus. Si oui : juste l'utiliser.
2. Sinon : ajouter le endpoint dans le tableau "Endpoints utilisés" de cette skill.
3. Définir le type de la réponse dans `src/lib/types.ts` (préfixe `Api42`).
4. Appeler `fetch42<Api42TonType>(path)`.

## Anti-patterns à refuser

- ❌ `fetch('https://api.intra.42.fr/...')` direct
- ❌ Appel API 42 depuis un composant client / `'use client'`
- ❌ Stockage du token dans une cookie ou localStorage
- ❌ Boucle `for` qui hammerise l'API sans rate limit
- ❌ `catch` qui swallow l'erreur sans rethrow
