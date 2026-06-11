# Déploiement & environnement — 42Bet

Ce document couvre deux choses :

1. **Setup d'une nouvelle machine** — reprendre le dev sur un autre ordinateur. ✅ vérifié
2. **Déploiement Vercel** — mise en production. ⏳ *pas encore effectué — checklist à valider au premier déploiement.*

> Source de vérité des variables : [`../.env.local.example`](../.env.local.example).
> Conventions projet : [`../AGENTS.md`](../AGENTS.md).

---

## 1. Setup d'une nouvelle machine

`git pull` ne suffit **pas** : tout ce qui est dans `.gitignore` (dépendances,
secrets, état local Supabase) est absent d'un clone frais. Rituel complet :

```bash
git clone git@github.com:FiTcHeRs71/42bet.git
cd 42bet
npm install                 # node_modules/ est gitignoré — indispensable
cp .env.local.example .env.local   # puis remplir les valeurs (voir §3)
npm run dev                 # http://localhost:3000 — vérifier que ça tourne
```

Ensuite seulement, lancer Claude Code (`claude`) dans le dossier.

### Le point qui bloque : `.env.local`

`.env.local` n'est **jamais** sur GitHub (`.gitignore` : `.env*`, sauf
`!.env*.example`). C'est volontaire (règle sécurité, AGENTS §5.2). Deux options
pour le recréer sur la nouvelle machine :

- **Le recopier** depuis une machine où il existe déjà (gestionnaire de mots de
  passe, clé USB chiffrée…). Le plus rapide.
- **Le reconstruire** depuis `.env.local.example` en récupérant chaque valeur à
  sa source (Supabase, intra 42, football-data) — voir §3.

### Lien Supabase (optionnel)

Nécessaire **uniquement** pour appliquer des migrations depuis cette machine
(pas pour coder ni lancer l'app) :

```bash
npx supabase link --project-ref yrfstssxuhkdtiuugvgf
```

L'état du lien vit dans `supabase/.temp/` (gitignoré), d'où la nécessité de
relinker sur chaque machine.

### Skills Claude Code (plugins)

Deux familles de skills, qui ne se synchronisent **pas** pareil :

1. **Skills du projet** (`skills/` à la racine : `42api-fetch`, `bet-points-calc`,
   `coalition-badge`, `solid-principles`, etc.) — **versionnés dans git**.
   `git pull` les récupère automatiquement. Rien à faire.

2. **Skills « superpowers » & co** (`brainstorming`, `writing-plans`,
   `subagent-driven-development`, `code-review`, `frontend-design`, `claude-mem`…)
   — ce sont des **plugins Claude Code** installés au niveau utilisateur
   (`~/.claude/plugins/`), **hors du repo**. `git pull` ne les amène pas : il faut
   les réinstaller. Dans Claude Code, sur la nouvelle machine :

   ```text
   /plugin marketplace add anthropics/claude-plugins-official
   /plugin marketplace add thedotmack/claude-mem

   /plugin install superpowers@claude-plugins-official
   /plugin install code-review@claude-plugins-official
   /plugin install frontend-design@claude-plugins-official
   /plugin install claude-mem@thedotmack
   ```

   Versions de référence à ce jour : superpowers `5.1.0`, claude-mem `13.4.0`
   (les `unknown` de `code-review`/`frontend-design` se résolvent à l'install).
   Les marketplaces ne s'ajoutent qu'une fois ; ensuite `/plugin` (interactif)
   suffit pour gérer/mettre à jour.

> Les skills externes éventuels dans `~/.agents/skills/` (`vercel-*`,
> `web-design-guidelines`…) sont aussi hors repo, mais accessoires pour le dev
> 42Bet — à recopier depuis leur source si besoin.

---

## 2. Vérifications avant tout commit / déploiement

```bash
npm run typecheck    # tsc --noEmit  → 0 erreur
npm run lint         # eslint        → 0 erreur
npm test             # vitest run    → tout vert
npm run build        # next build    → succès (vérifie les routes dynamiques)
```

`main` doit toujours rester vert (AGENTS §8).

---

## 3. Variables d'environnement

Toutes définies dans [`.env.local.example`](../.env.local.example). Récap des
sources et de la portée :

| Variable | Portée | Source |
|---|---|---|
| `AUTH_SECRET` | server | `openssl rand -base64 32` |
| `AUTH_URL` | server | `http://localhost:3000` en dev ; URL de prod en prod |
| `FT_API_UID` / `FT_API_SECRET` | server | App OAuth sur https://profile.intra.42.fr/oauth/applications |
| `FT_API_CAMPUS_ID` | server | `47` (Lausanne — Renens). 33 = Bangkok, ne pas confondre. |
| `FOOTBALL_DATA_API_KEY` | server | https://www.football-data.org/client/register |
| `NEXT_PUBLIC_SUPABASE_URL` | **client** | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **client** | Supabase → clé *publishable* (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Supabase → clé *secret* (`sb_secret_…`) — JAMAIS côté client |
| `CRON_SECRET` | server | `openssl rand -base64 32` |

⚠️ Seules les variables préfixées `NEXT_PUBLIC_` sont exposées au navigateur.
`SUPABASE_SERVICE_ROLE_KEY` et `FT_API_SECRET` restent server-only.

---

## 4. Base de données (migrations)

Le schéma est versionné dans `supabase/migrations/NNNN_*.sql` — **jamais** modifié
via l'UI Supabase (AGENTS §5.6). Pour pousser les migrations vers le projet lié :

```bash
npx supabase db push        # applique les migrations non encore appliquées
```

Régénérer les types TS après un changement de schéma :

```bash
npx supabase gen types typescript --linked > src/lib/database.types.ts
```

---

## 5. Déploiement Vercel ⏳ *non encore effectué*

> Cette section est une **checklist prospective**. Le projet n'a pas encore été
> déployé ; chaque étape est à valider lors du premier déploiement réel, puis ce
> document sera mis à jour avec les détails confirmés.

### 5.1 Préparation

- [ ] Importer le repo GitHub dans Vercel (framework détecté : Next.js).
- [ ] Renseigner **toutes** les variables de §3 dans Vercel → Project → Settings →
      Environment Variables (Production + Preview).
- [ ] `AUTH_URL` = l'URL de production (ex. `https://42bet.vercel.app`), pas
      `localhost`.

### 5.2 OAuth 42 en production

- [ ] Sur l'app OAuth intra 42, **ajouter la redirect URI de prod** :
      `https://<domaine-prod>/api/auth/callback/42` (en plus de celle de dev).
      Sans ça, le login 42 échoue en prod.

### 5.3 Crons

⚠️ **Plan Vercel Hobby = crons quotidiens seulement.** D'où la topologie à deux
déclencheurs (cf. `docs/architecture.md` §3) :

- **`sync-matches`** (ingestion fixtures CM) → cron **Vercel** quotidien, déclaré
  dans [`../vercel.json`](../vercel.json) (`0 4 * * *`).
- **`sync-results`** (scoring) → **pinger externe cron-job.org**, toutes les
  2 min. Le `schedule` GitHub Actions a été abandonné : son scheduler est trop
  throttlé (trous de plusieurs heures observés en prod → scoring en retard après
  la fin d'un match). Le tick est quasi-gratuit hors match (l'endpoint ne touche
  football-data.org que si un match est dans la fenêtre de résultat), donc un
  ping toutes les 2 min 24/7 est sans risque (free tier 10 req/min).

  > Le workflow `.github/workflows/cron-sync-results.yml` est conservé en
  > **filet manuel** (`workflow_dispatch`) : forcer un scoring immédiat depuis
  > l'onglet Actions. Le scoring est idempotent, le double-tick est sans danger.

- [ ] Vérifier que `CRON_SECRET` est bien présent dans les env vars Vercel —
      les routes renvoient `401` sans lui (AGENTS §5.8).
- [ ] **cron-job.org** : créer un cronjob → URL
      `https://<prod>/api/cron/sync-results`, intervalle **2 min**, onglet
      *Advanced* → header `Authorization` = `Bearer <CRON_SECRET>` (même valeur
      que la var Vercel Production). Activer « notify on failure ».
- [ ] (Filet manuel) Côté GitHub (Settings → Secrets and variables → Actions),
      garder les secrets repo **`PROD_URL`** (ex. `https://42bet.vercel.app`,
      sans slash final) et **`CRON_SECRET`** pour le `workflow_dispatch`.

### 5.4 Après déploiement

- [ ] Tester le login 42 de bout en bout sur l'URL de prod.
- [ ] Vérifier qu'une ligne apparaît dans `public.users` après login.
- [ ] Surveiller les logs du premier tick de cron `sync-results`.
- [ ] Repasser au workflow **PR + protection de `main`** (AGENTS §8 : assoupli
      tant que non déployé, à réactiver au déploiement).

---

---

## 4. Premier déploiement Vercel (alpha)

Prod = branche `main`. Toute modif passe par PR mergée avant de partir en prod.

### 4.1 Projet Vercel
1. Importer le repo `FiTcHeRs71/42bet` dans Vercel (framework détecté : Next.js).
2. Production Branch = `main`.

### 4.2 Variables d'environnement (scope **Production**)
Reprendre toutes les clés de `.env.local.example` :

| Variable | Valeur |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` (nouvelle valeur prod) |
| `AUTH_URL` | URL de prod, ex. `https://42bet.vercel.app` |
| `FT_API_UID` / `FT_API_SECRET` | App OAuth intra 42 |
| `FT_API_CAMPUS_ID` | `47` |
| `FOOTBALL_DATA_API_KEY` | clé football-data.org |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase prod |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé publishable Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | clé secret Supabase (server-only) |
| `CRON_SECRET` | `openssl rand -base64 32` |

### 4.3 OAuth intra 42
Sur https://profile.intra.42.fr/oauth/applications, ajouter la redirect URI :
`https://<prod>/api/auth/callback/42` (garder aussi celle de localhost pour le dev).

### 4.4 Crons (plan Hobby)
- **Vercel** : `vercel.json` déclare le cron quotidien `sync-matches`. Vercel
  envoie `Authorization: Bearer <CRON_SECRET>` — rien à configurer hormis la
  variable `CRON_SECRET` en Production.
- **cron-job.org** : le scoring (`sync-results`) est pingé toutes les 2 min par
  un cronjob externe (cf. §5.3 pour le setup : URL + header Bearer). Le scheduler
  GitHub Actions n'est plus utilisé pour le tick (trop throttlé).
- **GitHub Actions** : `.github/workflows/cron-sync-results.yml` reste en filet
  manuel (`workflow_dispatch`) — forcer un scoring depuis l'onglet **Actions**.
  Garder les secrets repo `PROD_URL` et `CRON_SECRET`.

### 4.5 Smoke test post-déploiement
- Login OAuth avec un compte campus 47 → accès accordé.
- Login avec un compte hors-47 → accès refusé (retour à la page de login).
- `/leaderboard` s'affiche.
- `curl -s -o /dev/null -w "%{http_code}" https://<prod>/api/cron/sync-results` → `401`.

---

## Références

- Variables : [`../.env.local.example`](../.env.local.example)
- Conventions & règles : [`../AGENTS.md`](../AGENTS.md)
- Schéma DB : [`./database-schema.md`](./database-schema.md)
- Cron : [`../vercel.json`](../vercel.json), skill [`football-data-sync`](../skills/football-data-sync/SKILL.md)
