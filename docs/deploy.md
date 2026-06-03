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
| `FT_API_CAMPUS_ID` | server | `33` (Lausanne) |
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

### 5.3 Cron de scoring

Le cron est déjà déclaré dans [`../vercel.json`](../vercel.json) :

```json
{ "crons": [{ "path": "/api/cron/sync-results", "schedule": "*/5 * * * *" }] }
```

- [ ] Vercel exécute ce cron toutes les 5 min une fois déployé.
- [ ] Vérifier que `CRON_SECRET` est bien présent dans les env vars Vercel —
      la route renvoie `401` sans lui (AGENTS §5.8).

### 5.4 Après déploiement

- [ ] Tester le login 42 de bout en bout sur l'URL de prod.
- [ ] Vérifier qu'une ligne apparaît dans `public.users` après login.
- [ ] Surveiller les logs du premier tick de cron `sync-results`.
- [ ] Repasser au workflow **PR + protection de `main`** (AGENTS §8 : assoupli
      tant que non déployé, à réactiver au déploiement).

---

## Références

- Variables : [`../.env.local.example`](../.env.local.example)
- Conventions & règles : [`../AGENTS.md`](../AGENTS.md)
- Schéma DB : [`./database-schema.md`](./database-schema.md)
- Cron : [`../vercel.json`](../vercel.json), skill [`football-data-sync`](../skills/football-data-sync/SKILL.md)
