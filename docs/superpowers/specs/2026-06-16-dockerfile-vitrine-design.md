# Design — Dockerfile « vitrine » 42Bet

> Spec d'origine : 2026-06-16. Objectif : fournir à l'École 42 Lausanne une
> **image conteneur auto-hébergeable** de 42Bet, destinée à figurer parmi les
> « vitrines » du campus. La VM exécute le front Next.js et se connecte à un
> **Supabase cloud** (pas de DB embarquée).

## 1. Contexte & contrainte

- App : Next.js 16.2.7 (App Router), React 19, déployée aujourd'hui sur Vercel.
- DB + Auth data : **Supabase cloud externe** (pas dans l'image).
- Auth web : NextAuth v5, provider 42 (OAuth vers `intra.42.fr`).
- API foot : football-data.org (externe).
- Cron scoring : déjà externalisé en **GitHub Actions** → **ne tourne pas dans
  la VM** (hors scope, simplement documenté).

Décision validée : **image légère** = seulement le serveur Next.js, qui pointe
vers Supabase cloud via variables d'environnement. La VM a donc besoin d'un accès
internet et des clés appropriées.

## 2. Objectif & critères de succès

Un tiers (42) doit pouvoir, à partir du dépôt :

1. Construire une image Docker reproductible en une commande.
2. La lancer en une commande (`docker compose up` ou `docker run`).
3. Obtenir 42Bet fonctionnel sur `http://<vm>:3000`, login 42 inclus.

Sans jamais qu'aucun secret réel ne soit embarqué dans l'image ni commité au
dépôt (règles non-négociables AGENTS.md §5.2 et §7).

## 3. Architecture — image multi-stage

Base : **Node 24 Alpine**. Sortie **`output: "standalone"`** de Next.js.

| Étage | Rôle | Sortie |
|---|---|---|
| `deps` | `npm ci` (cache deps) | `node_modules` |
| `builder` | `npm run build` | `.next/standalone`, `.next/static` |
| `runner` | runtime minimal, user non-root | `node server.js` |

L'étage `runner` copie uniquement `.next/standalone`, `.next/static` et
`public/`. Image finale attendue ~150 Mo (vs ~1 Go sans `standalone`).

### 3.1 Modification de `next.config.ts`

Ajout d'une seule option :

```ts
const nextConfig: NextConfig = {
  output: "standalone",
};
```

Sans effet sur le déploiement Vercel existant (Vercel ignore `standalone`).

## 4. Le piège central — variables `NEXT_PUBLIC_*`

Dans Next.js, les variables préfixées `NEXT_PUBLIC_` sont **inlinées dans le
bundle client au moment du `next build`**, PAS lues au runtime. Conséquence pour
une image distribuable :

| Variable | Préfixe | Quand elle est lue | Comment la passer |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | **build** | `--build-arg` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | **build** | `--build-arg` |
| `AUTH_SECRET` | — | runtime | `-e` / env-file |
| `AUTH_URL` | — | runtime | `-e` / env-file |
| `SUPABASE_SERVICE_ROLE_KEY` | — | runtime | `-e` / env-file |
| `FT_API_UID` / `FT_API_SECRET` / `FT_API_CAMPUS_ID` | — | runtime | `-e` / env-file |
| `FOOTBALL_DATA_API_KEY` | — | runtime | `-e` / env-file |
| `CRON_SECRET` | — | runtime | `-e` / env-file |

Le `Dockerfile` déclare donc deux `ARG NEXT_PUBLIC_*` consommés dans l'étage
`builder` (exposés en `ENV` juste avant `npm run build`). Tout le reste est lu au
démarrage du conteneur. La doc insiste sur ce point : **rebuild requis** si on
change une valeur `NEXT_PUBLIC_*`.

## 5. Fichiers livrés

| Fichier | Contenu |
|---|---|
| `next.config.ts` | + `output: "standalone"` |
| `Dockerfile` | multi-stage deps/builder/runner, user non-root |
| `.dockerignore` | exclut `node_modules`, `.next`, `.env*`, `.git`, etc. |
| `docker-compose.yml` | service `web`, port 3000, `env_file`, build args `NEXT_PUBLIC_*` |
| `.env.docker.example` | template sans valeurs (calqué sur `.env.local.example`) |
| `docs/docker.md` | build, run, OAuth 42, reco Supabase démo, note cron |

### 5.1 `.dockerignore` — garantie « zéro secret »

Exclut explicitement `.env`, `.env.local`, `.env.docker` et tout `*.env`. Couplé
au fait qu'aucun `COPY .env*` n'existe dans le `Dockerfile`, l'image ne peut pas
contenir de secret. Les secrets runtime ne vivent que dans le conteneur en cours
d'exécution, jamais dans une couche d'image.

## 6. Documentation (`docs/docker.md`)

Doit couvrir :

1. **Build** : `docker compose build` avec un `.env.docker` rempli (les
   `NEXT_PUBLIC_*` y sont lus comme build args par compose).
2. **Run** : `docker compose up`.
3. **OAuth 42** : le callback est lié au domaine. Pour une autre URL que
   `localhost:3000`, créer/ajuster l'app OAuth sur
   `profile.intra.42.fr/oauth/applications` (redirect
   `http://<domaine>/api/auth/callback/42`) et fixer `AUTH_URL` en conséquence.
4. **Supabase** : recommander un **projet Supabase dédié démo** (avec migrations
   `supabase/migrations/` rejouées) plutôt que de partager la base de prod.
5. **Cron scoring** : rappel qu'il est externalisé (GitHub Actions) et ne tourne
   pas dans la VM ; le scoring n'avancera donc pas tout seul dans une démo isolée
   sauf à pointer le workflow / un appel manuel vers l'endpoint protégé
   `CRON_SECRET`.

## 7. Hors scope (YAGNI)

- Postgres local / stack Supabase self-hosted.
- Orchestration du cron dans la VM.
- Healthcheck/observabilité avancée (peut venir plus tard).
- Publication de l'image sur un registry (laissé à 42).

## 8. Vérification

- `docker compose build` réussit.
- `docker compose up` sert l'app sur `:3000`.
- `npm run typecheck` + `npm run lint` verts après l'ajout `output: "standalone"`.
- `grep` de confirmation : aucun secret réel dans le contexte de build (image).

## 9. Livraison

Branche `feat/dockerfile-vitrine`, flux PR obligatoire (AGENTS.md §8), une PR =
un sujet, template PR respecté.
