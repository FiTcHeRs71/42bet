# 42Bet en conteneur Docker (vitrine auto-hébergée)

Image légère du front Next.js qui se connecte à un **Supabase cloud**. Pas de
base de données embarquée : la VM a besoin d'un accès internet et des clés.

## Prérequis

- Docker + docker compose
- Un projet Supabase (idéalement **dédié à la démo**, pas la prod — voir plus bas)
- Une app OAuth 42 (`profile.intra.42.fr/oauth/applications`)
- Une clé football-data.org

## 1. Configurer

```bash
cp .env.docker.example .env.docker
# éditer .env.docker et remplir toutes les valeurs
```

⚠️ **Deux moments de lecture des variables :**

- `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont **inlinées
  au build** (bundle client Next.js). Si vous changez une de ces valeurs, il
  faut **rebuilder** l'image.
- Toutes les autres variables (`AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
  `FT_API_*`, `FOOTBALL_DATA_API_KEY`, `CRON_SECRET`, `AUTH_URL`) sont lues au
  **runtime**, au démarrage du conteneur.

## 2. Builder et lancer

```bash
docker compose --env-file .env.docker build
docker compose --env-file .env.docker up -d
```

L'app écoute sur `http://<vm>:3000`.

## 3. OAuth 42 (callback lié au domaine)

Le login 42 redirige vers une URL fixe. Pour un domaine autre que
`localhost:3000` :

1. Sur l'app OAuth de l'intra, ajouter le redirect URI
   `http://<domaine>/api/auth/callback/42`.
2. Mettre `AUTH_URL=http://<domaine>` dans `.env.docker`.

## 4. Supabase : projet démo recommandé

Plutôt que de partager la base de **production**, créez un projet Supabase dédié
et rejouez le schéma :

```bash
supabase link --project-ref <ref-du-projet-demo>
supabase db push   # applique supabase/migrations/
```

Renseignez ensuite l'URL + les clés (publishable / secret) de ce projet dans
`.env.docker`.

## 5. Cron de scoring (hors conteneur)

Le calcul des points est déclenché par un **workflow GitHub Actions** externe
(plan Hobby Vercel oblige), pas depuis ce conteneur. Dans une démo isolée, le
scoring n'avancera donc pas tout seul. Pour le déclencher manuellement :

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://<vm>:3000/api/cron/sync-results
```

(ou pointer un planificateur externe vers cet endpoint).
