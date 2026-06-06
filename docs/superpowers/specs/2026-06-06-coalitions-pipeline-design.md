# Spec — Pipeline coalitions (assignation juste-à-temps au sign-in)

> Statut : **validé**, prêt pour plan d'implémentation.
> Date : 2026-06-06 · Branche : `feat/coalitions-pipeline`
> Contexte : [`docs/architecture.md`](../../architecture.md) · API : [`docs/api-42.md`](../../api-42.md) §4 · Skill : [`42api-fetch`](../../../skills/42api-fetch/SKILL.md)

## 1. Problème

Le schéma et l'UI coalition sont **déjà en place mais sans données** :

- Table `public.coalitions` (`ft_id`, `name`, `color`, `image_url`) — **vide**.
- `public.users.coalition_id` (FK `on delete set null`) — **jamais renseigné**.
- `CoalitionBadge` et le classement par coalition (`buildCoalitionLeaderboard`)
  consomment déjà cette donnée → aujourd'hui ils rendent « — » / section vide.

Cause : `auth/upsert-player.ts` n'écrit pas de coalition, et **aucun** code
n'appelle l'API 42 hors du `/v2/me` d'auth (le wrapper `fetch42()` n'existe pas).

## 2. Objectif

À chaque connexion 42, renseigner la coalition du joueur **et** remplir la table
de référence `coalitions`, en un seul appel API, sans infrastructure ajoutée
(pas de cron, pas de batch). Décisions tranchées au brainstorm :

- **Assignation à la connexion** (option A) — auto-réparante, faible volume.
- **Remplissage juste-à-temps** (option A2) — la table `coalitions` se remplit
  depuis la réponse `/v2/users/:id/coalitions`, pas via `/v2/coalitions`.
- **`fetch42` minimal** — pas de pagination pour l'instant (YAGNI).
- **Multi-coalition → on prend la première** retournée par l'API.
- **Best-effort** — un échec coalition ne casse **jamais** le login.

Hors périmètre (backlog) : sync des coalitions sans joueur (`/v2/coalitions`),
helper `fetch42Paginated`, batch sur `/v2/campus/33/users`.

## 3. Composants

### 3.1 `src/lib/api-42.ts` (neuf, `server-only`)

Wrapper conforme à la skill `42api-fetch`. On n'implémente que le nécessaire :

```ts
const BASE = "https://api.intra.42.fr";

export class Api42Error extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API 42 error ${status}`);
  }
}

// Token applicatif client_credentials, caché en mémoire avec expiration (~2h).
async function getApi42Token(): Promise<string>;

// Bas niveau : applique throttle (≤ 2 req/s) + auth + typage d'erreur.
export async function fetch42<T>(path: string, init?: RequestInit): Promise<T>;
```

- **Token** : `POST /oauth/token` (grant `client_credentials`) avec `FT_API_UID` /
  `FT_API_SECRET`. Caché en module singleton avec `expires_at` (marge de sécurité,
  re-fetch avant expiration). Jamais loggé.
- **Throttle** : queue token-bucket simple (singleton, `setTimeout`) garantissant
  ≤ 2 req/s. Pas de dépendance externe.
- **Erreurs** : tout statut non-2xx → `throw new Api42Error(status, body)`. Jamais
  de `null` silencieux. `path` doit commencer par `/v2/` (sauf l'appel token interne).

### 3.2 `src/lib/coalitions.ts` (neuf, **pur**)

```ts
/** Sous-ensemble utile d'un élément de GET /v2/users/:id/coalitions. */
export interface Ft42Coalition {
  id: number;
  name: string;
  color?: string | null;
  image_url?: string | null;
}

/** Coalition normalisée, prête à upserter. */
export interface CoalitionRef {
  ftId: number;
  name: string;
  color: string;        // fallback gris neutre si l'API ne fournit rien
  imageUrl: string | null;
}

/** Prend la première coalition (ou null si l'user n'en a aucune). */
export function pickUserCoalition(raw: Ft42Coalition[]): CoalitionRef | null;
```

- 0 élément → `null`.
- ≥ 1 → premier élément normalisé. `color` absent/vide → fallback
  `#64748b` (slate-500, neutre, lisible par `CoalitionBadge`). `image_url`
  absent → `null`.
- Aucune I/O, aucun import `server-only` → entièrement testable.

### 3.3 Intégration auth (`upsert-player.ts` + `config.ts`)

On étend le contrat `UpsertDeps` (DIP — la logique reste testable avec des fakes) :

```ts
export interface UpsertDeps {
  upsertUser(row: PlayerRow): Promise<{ error: unknown }>;
  // neuf :
  fetchUserCoalitions(ftId: number): Promise<Ft42Coalition[]>;
  // upsert la coalition (on conflict ft_id) et renvoie son uuid interne
  upsertCoalition(ref: CoalitionRef): Promise<{ id: string | null; error: unknown }>;
  // lie la coalition au joueur (update users.coalition_id by ft_id)
  setCoalition(ftId: number, coalitionId: string): Promise<{ error: unknown }>;
}
```

`upsertPlayer(profile, deps)` :

1. `upsertUser` (inchangé — login doit marcher même si la suite échoue).
2. **Best-effort coalition** dans un `try/catch` qui ne propage rien :
   a. `raw = await deps.fetchUserCoalitions(profile.ftId)`
   b. `ref = pickUserCoalition(raw)` ; si `null` → fin (pas de coalition).
   c. `{ id } = await deps.upsertCoalition(ref)`
   d. si `id` → `deps.setCoalition(profile.ftId, id)` (update `users.coalition_id`).
   e. tout `throw`/erreur ici → `console.warn`, on continue.

`config.ts` câble les implémentations réelles via `supabaseAdmin` + `fetch42` :

- `fetchUserCoalitions` → `fetch42('/v2/users/{ftId}/coalitions')`
- `upsertCoalition` → `supabaseAdmin.from('coalitions').upsert(row, { onConflict: 'ft_id' }).select('id').single()`
- set `coalition_id` → `supabaseAdmin.from('users').update({ coalition_id }).eq('ft_id', ftId)`

> Aucune migration DB : le schéma existe déjà (`0001`, `0002`).

## 4. Flux de données (sign-in)

```
NextAuth signIn
  └─ mapFt42Profile(/v2/me)         → { ftId, login, avatarUrl }
  └─ upsertPlayer(profile, deps)
       ├─ upsertUser(row)            [users: ft_id/login/avatar]  ── toujours
       └─ try (best-effort) :
            fetch42(/v2/users/:id/coalitions)
            pickUserCoalition(raw)   → CoalitionRef | null
            upsertCoalition(ref)     [coalitions: on conflict ft_id] → uuid
            update users.coalition_id = uuid
         catch → console.warn, login OK
```

Chaque reconnexion ré-exécute le flux → données auto-rafraîchies (couleur/image
de coalition mises à jour si elles changent côté intra).

## 5. Gestion d'erreur

| Cas | Comportement |
|---|---|
| `fetch42` 429 / 5xx / token KO | `Api42Error` attrapée dans `upsertPlayer`, `console.warn`, **login réussit** |
| User sans coalition (array vide) | `coalition_id` reste `null`, badge « — » (déjà géré) |
| `upsertCoalition` renvoie une erreur DB | log, on n'écrase pas `coalition_id` |
| `color` absent de l'API | fallback `#64748b` |

**Invariant** : l'échec de la branche coalition n'altère jamais le succès de
l'authentification ni l'upsert du joueur.

## 6. Sécurité

- `api-42.ts` est `server-only` ; `FT_API_SECRET` jamais loggé, jamais côté client.
- Écritures `coalitions` / `users` via `supabaseAdmin` (service_role) côté serveur.
- RLS inchangée (lecture publique `coalitions`, écritures service_role).
- `fetch42` respecte 2 req/s (skill `42api-fetch`).

## 7. Tests (Vitest)

- **`pickUserCoalition`** (pur) : 0 coalition → null ; 1 → normalisé ; plusieurs →
  première ; `color`/`image_url` absents → fallback `#64748b` / `null`.
- **`upsertPlayer`** (fakes `UpsertDeps`) : coalition upsertée puis liée ;
  `fetchUserCoalitions` qui throw → `upsertUser` quand même appelé, pas d'exception
  propagée ; array vide → pas d'upsert coalition, pas de set `coalition_id`.
- **`fetch42`** (fetch mické) : non-2xx → `Api42Error(status)` ; token caché
  réutilisé (un seul `POST /oauth/token` pour 2 appels) ; throttle ≥ 500 ms
  entre deux requêtes.

## 8. Critères d'acceptation

1. Après connexion d'un joueur ayant une coalition : ligne `coalitions` créée,
   `users.coalition_id` renseigné, badge coloré sur `/leaderboard` et `/profile`.
2. Joueur sans coalition : login OK, badge « — ».
3. API 42 indisponible : login OK quand même (best-effort).
4. `npm test` + `npm run typecheck` + `npm run lint` verts ; `fetch42` respecte 2 req/s.
5. Skill `42api-fetch` : retirer la mention « wrapper inexistant » de `docs/api-42.md`
   §4 une fois livré.
