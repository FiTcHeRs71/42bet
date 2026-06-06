# Intégration API 42 — 42Bet

> Comment 42Bet parle à l'intra 42 (`api.intra.42.fr`). Aujourd'hui l'API 42 sert
> **uniquement à l'authentification** ; les appels « token applicatif » (coalitions)
> sont au **backlog**. Conventions : skill [`42api-fetch`](../skills/42api-fetch/SKILL.md).

## 1. Limites de l'API (à respecter absolument)

- **2 requêtes / seconde**
- **1200 requêtes / heure**
- OAuth2. Deux types de tokens :
  - **token utilisateur** (Authorization Code) — agit *au nom du joueur connecté* ;
  - **token applicatif** (Client Credentials) — agit *au nom de l'app* (lecture de
    données publiques : coalitions, users du campus…).

## 2. App OAuth enregistrée

| Champ | Valeur |
|---|---|
| Nom | `42Bet` |
| Scope | `public` |
| Redirect URI (dev) | `http://localhost:3000/api/auth/callback/42` |
| Campus | Lausanne (`FT_API_CAMPUS_ID=33`) |

Variables d'env (cf. [`.env.local.example`](../.env.local.example)) :
`FT_API_UID`, `FT_API_SECRET`, `FT_API_CAMPUS_ID`.

> ⚠️ **Au déploiement** : ajouter la redirect URI de prod
> (`https://<domaine>/api/auth/callback/42`) dans l'app intra.
> ⚠️ **Sécurité** : `FT_API_SECRET` doit être **régénéré** (il a été exposé en
> clair lors d'une session) — cf. backlog `handoff.md`.

## 3. Ce qui est implémenté aujourd'hui : auth seule

L'unique usage réel de l'API 42 passe par **NextAuth v5** (provider built-in
`42-school`, id forcé à `"42"` pour matcher la redirect URI). **Aucun appel
direct** à `api.intra.42.fr` n'est écrit dans le code applicatif : c'est NextAuth
qui récupère le profil.

Flux (voir `src/lib/auth/`) :

1. `signIn("42")` → redirection OAuth intra → retour `/api/auth/callback/42`.
2. NextAuth échange le code et appelle **`GET /v2/me`** avec le **token
   utilisateur**.
3. `mapFt42Profile` (`auth/profile.ts`, **pur**) normalise la réponse :

   ```ts
   // sous-ensemble utile de GET /v2/me
   { id: number, login: string, image?: { link?: string | null } }
   //                       ▼ mapFt42Profile
   { ftId: number, login: string, avatarUrl: string | null }
   ```

4. `upsertPlayer` (`auth/upsert-player.ts`, **DI** via `UpsertDeps`) écrit la
   ligne `public.users` (`ft_id`, `login`, `avatar_url`) en `upsert onConflict
   ft_id`, via `supabaseAdmin` (service_role) câblé dans `auth/config.ts`.
5. Le JWT et la session exposent `ftId`, `login`, `avatarUrl`
   (typage dans `auth/types.ts`).

Fichiers :

| Fichier | Rôle | Pur ? |
|---|---|---|
| `src/lib/auth/config.ts` | plomberie NextAuth, câblage service_role | non (`server-only`) |
| `src/lib/auth/profile.ts` | normalise `/v2/me` | **oui** |
| `src/lib/auth/upsert-player.ts` | persiste la fiche joueur (DI) | **oui** (logique) |
| `src/lib/auth/types.ts` | augmentation des types session/JWT | — |
| `src/app/api/auth/[...nextauth]/route.ts` | handlers NextAuth | — |

> Note : `GET /v2/me` ci-dessus est appelé **par NextAuth avec le token
> utilisateur**, pas par le wrapper `fetch42()` (qui, lui, utiliserait le token
> applicatif). C'est pour ça qu'il n'apparaît pas dans `lib/`.

## 4. Le wrapper `fetch42()` (token applicatif)

`src/lib/api-42.ts` implémente `fetch42<T>(path)` (server-only) conforme à la
skill [`42api-fetch`](../skills/42api-fetch/SKILL.md) : token applicatif
`client_credentials` caché en mémoire (~2h), throttle ≤ 2 req/s (`nextDelay`
pur + queue), erreurs typées `Api42Error`. Premier usage : le **pipeline
coalitions** (assignation au sign-in, cf. `auth/upsert-player.ts`).

Endpoint utilisé : `GET /v2/users/:id/coalitions` (récupère la coalition du
joueur connecté ; sert aussi à remplir la table `coalitions`).

Pas encore implémenté (YAGNI, backlog) : `fetch42Paginated`,
`GET /v2/coalitions` (coalitions sans joueur), batch `/v2/campus/33/users`.

| Endpoint visé (backlog) | Usage prévu |
|---|---|
| `GET /v2/coalitions` | nom / couleur / image des coalitions |
| `GET /v2/campus/:campus_id/users` | joueurs du campus Lausanne |

**Règle** : suivre la skill `42api-fetch` (server-only, throttle 2 req/s, token
jamais loggé). Anti-pattern à refuser : `fetch` direct vers `api.intra.42.fr`
(cf. AGENTS §10).

## 5. Ressources

- Doc API 42 : https://api.intra.42.fr/apidoc
- Skill projet : [`42api-fetch`](../skills/42api-fetch/SKILL.md)
- NextAuth v5 (Auth.js) : https://authjs.dev
