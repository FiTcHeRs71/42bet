# Dockerfile Vitrine 42Bet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fournir une image conteneur Docker légère et reproductible de 42Bet, auto-hébergeable par l'École 42, qui se connecte à un Supabase cloud.

**Architecture:** Image Docker multi-stage (deps → builder → runner) basée sur Node 24 Alpine, exploitant la sortie `output: "standalone"` de Next.js. Les variables `NEXT_PUBLIC_*` sont injectées en build-args (inlinées au build), les secrets server-only sont lus au runtime. Aucun secret n'est commité ni embarqué dans l'image.

**Tech Stack:** Docker, docker compose, Next.js 16 (standalone output), Node 24 Alpine.

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `next.config.ts` | Active la sortie standalone | Modifier |
| `.dockerignore` | Exclut sources lourdes + tout secret du contexte de build | Créer |
| `Dockerfile` | Build multi-stage + runtime non-root | Créer |
| `docker-compose.yml` | Lancement une-commande, build-args + env runtime | Créer |
| `.env.docker.example` | Template d'env sans valeurs | Créer |
| `docs/docker.md` | Mode d'emploi build/run + OAuth + Supabase + cron | Créer |

Pas de tests automatisés Vitest pertinents ici (infra Docker) : la vérification se fait par build + run réels et par `typecheck`/`lint` après la modif de `next.config.ts`.

---

### Task 1: Activer la sortie standalone Next.js

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Ajouter `output: "standalone"`**

Remplacer le contenu de `next.config.ts` par :

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Génère un serveur Node auto-contenu dans .next/standalone (image Docker légère).
  // Sans effet sur le déploiement Vercel, qui ignore cette option.
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 2: Vérifier typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: aucune erreur.

- [ ] **Step 3: Vérifier que le build produit bien standalone**

Run: `npm run build && ls .next/standalone/server.js`
Expected: le fichier `.next/standalone/server.js` existe.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "build(next): active output standalone pour l'image Docker"
```

---

### Task 2: `.dockerignore` (garantie zéro secret + build rapide)

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Créer `.dockerignore`**

```
# Dépendances et artefacts reconstruits dans l'image
node_modules
.next
out
dist

# Secrets — JAMAIS dans le contexte de build
.env
.env.*
*.env

# Git & CI
.git
.github
.gitignore

# Dev / éditeur / docs non nécessaires au runtime
.vscode
.idea
*.log
coverage
.superpowers
README.md
docs
brainstorming.md
skills
tests
supabase
scripts
```

- [ ] **Step 2: Vérifier qu'aucun fichier d'env n'est exclu par erreur du dépôt mais présent**

Run: `git check-ignore -v .env.local 2>/dev/null; echo "ok"`
Expected: affiche `ok` (le `.dockerignore` n'affecte pas git ; cette étape confirme juste qu'on n'a pas cassé l'environnement).

- [ ] **Step 3: Commit**

```bash
git add .dockerignore
git commit -m "build(docker): .dockerignore exclut secrets et sources lourdes"
```

---

### Task 3: `Dockerfile` multi-stage

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Créer `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

# ---- Stage 1: deps ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: builder ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Les variables NEXT_PUBLIC_* sont inlinées dans le bundle AU BUILD.
# Elles doivent donc être fournies ici en build-args, pas au runtime.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---- Stage 3: runner ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# User non-root
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Sortie standalone : serveur minimal + assets statiques + public
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Build l'image avec des valeurs publiques de test**

Run :
```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://demo.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_demo \
  -t 42bet:test .
```
Expected: build réussit jusqu'à `naming to docker.io/library/42bet:test`.

- [ ] **Step 3: Confirmer qu'aucun secret n'est dans l'image**

Run: `docker history --no-trunc 42bet:test | grep -iE "service_role|AUTH_SECRET|FT_API_SECRET|FOOTBALL_DATA_API_KEY|CRON_SECRET" || echo "AUCUN SECRET TROUVE"`
Expected: affiche `AUCUN SECRET TROUVE`.

- [ ] **Step 4: Commit**

```bash
git add Dockerfile
git commit -m "build(docker): Dockerfile multi-stage Next.js standalone non-root"
```

---

### Task 4: `.env.docker.example`

**Files:**
- Create: `.env.docker.example`

- [ ] **Step 1: Créer `.env.docker.example`**

```bash
# Copier en .env.docker et remplir. NE JAMAIS committer .env.docker.
#
# /!\ DEUX MOMENTS DE LECTURE :
#   - NEXT_PUBLIC_*  -> lues AU BUILD (inlinées dans le bundle client).
#                       docker compose les passe en build-args.
#                       Changer une valeur => rebuild obligatoire.
#   - le reste       -> lues AU RUNTIME (au démarrage du conteneur).

# ---- Public (BUILD-TIME) ----
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# ---- NextAuth (runtime) ----
# openssl rand -base64 32
AUTH_SECRET=
# URL publique de la VM, ex: http://vitrine.42lausanne.ch
AUTH_URL=http://localhost:3000

# ---- API 42 OAuth (runtime) ----
# App créée sur https://profile.intra.42.fr/oauth/applications
# Redirect URI: <AUTH_URL>/api/auth/callback/42
FT_API_UID=
FT_API_SECRET=
FT_API_CAMPUS_ID=47

# ---- football-data.org (runtime) ----
FOOTBALL_DATA_API_KEY=

# ---- Supabase secret / service_role (runtime, server-only) ----
SUPABASE_SERVICE_ROLE_KEY=

# ---- Cron scoring (runtime) ----
# openssl rand -base64 32
CRON_SECRET=
```

- [ ] **Step 2: Commit**

```bash
git add .env.docker.example
git commit -m "build(docker): template .env.docker.example sans secrets"
```

---

### Task 5: `docker-compose.yml`

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Créer `docker-compose.yml`**

```yaml
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        # build-args lus depuis .env.docker (NEXT_PUBLIC_* inlinées au build)
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    image: 42bet:latest
    ports:
      - "3000:3000"
    env_file:
      - .env.docker
    restart: unless-stopped
```

- [ ] **Step 2: Valider la config compose**

Run: `docker compose --env-file .env.docker.example config >/dev/null && echo "COMPOSE OK"`
Expected: affiche `COMPOSE OK` (valide la syntaxe ; les valeurs vides du template suffisent à la validation).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "build(docker): docker-compose lancement une-commande"
```

---

### Task 6: Documentation `docs/docker.md`

**Files:**
- Create: `docs/docker.md`

- [ ] **Step 1: Créer `docs/docker.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/docker.md
git commit -m "docs(docker): mode d'emploi build/run image vitrine"
```

---

### Task 7: Vérification de bout en bout (run réel)

**Files:** aucun (vérification).

- [ ] **Step 1: Préparer un `.env.docker` local de test**

Copier `.env.docker.example` en `.env.docker` et remplir avec des clés Supabase
démo valides + `AUTH_SECRET` généré. (Fichier local, ignoré par git/docker.)

- [ ] **Step 2: Build + up**

Run:
```bash
docker compose --env-file .env.docker build
docker compose --env-file .env.docker up -d
```
Expected: conteneur `web` démarre sans crash.

- [ ] **Step 3: Vérifier la réponse HTTP**

Run: `sleep 3 && curl -so /dev/null -w "%{http_code}\n" http://localhost:3000`
Expected: `200` (page d'accueil servie).

- [ ] **Step 4: Nettoyer**

Run: `docker compose --env-file .env.docker down`
Expected: conteneur arrêté et supprimé.

- [ ] **Step 5: Ouvrir la PR**

Suivre `.github/pull_request_template.md` (une PR = un sujet). Vérifs vertes :
`npm run typecheck`, `npm run lint`, `npm test`.

```bash
git push -u origin feat/dockerfile-vitrine
gh pr create --fill
```

---

## Notes de couverture du spec

- §3 architecture multi-stage → Task 3
- §3.1 `output: "standalone"` → Task 1
- §4 `NEXT_PUBLIC_*` build-args → Task 3 (ARG/ENV) + Task 5 (compose args) + Task 6 (doc)
- §5 fichiers livrés → Tasks 1-6
- §5.1 zéro secret → Task 2 (.dockerignore) + Task 3 step 3 (vérif)
- §6 documentation → Task 6
- §7 hors scope → respecté (pas de DB locale, pas de cron embarqué)
- §8 vérification → Task 1 (typecheck/lint), Task 7 (run réel)
- §9 livraison PR → Task 7 step 5
