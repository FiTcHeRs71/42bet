<div align="center">

# ⚽ 42Bet

**Pronostics foot — sans argent réel — pour les étudiants de l'École 42 Lausanne.**

Parie sur les matchs de la Coupe du Monde avec ton login intra, marque des points,
et grimpe au classement de ta coalition. Zéro pari d'argent : juste de la fierté.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca?logo=react)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ecf8e?logo=supabase)](https://supabase.com/)
[![Deployed on Vercel](https://img.shields.io/badge/Vercel-deployed-black?logo=vercel)](https://42bet.vercel.app)

[Démo](https://42bet.vercel.app) · [Documentation](./docs/README.md) · [Contribuer](#-contribuer)

</div>

---

## ✨ Le concept

42Bet est une web app de pronostics sportifs **sans aucune mise d'argent**, pensée
pour animer une promo de l'[École 42](https://42lausanne.ch/) pendant la Coupe du
Monde. Chaque joueur se connecte avec son **compte intra 42**, pronostique le
**vainqueur et le score exact** de chaque match avant le coup d'envoi, puis gagne
des points selon la justesse de sa prédiction. Les classements se déclinent par
joueur, par **camp** (étudiants du cursus vs piscineux) et par **coalition 42**.

> 🟢 **En production** sur [42bet.vercel.app](https://42bet.vercel.app). L'accès est
> volontairement restreint au campus de Lausanne (gate configurable, voir plus bas) —
> mais le projet est **open source** et entièrement *forkable* pour un autre campus.

## 🎮 Fonctionnalités

- **Connexion via l'API 42** (OAuth2) — pas de mot de passe à gérer, tu joues avec ton login intra, ta photo et ta coalition.
- **Paris vainqueur + score** avec **verrou automatique au coup d'envoi** (impossible de parier une fois le match commencé).
- **Scoring automatique** après chaque match, idempotent et centralisé — avec un **verrou de score** pour corriger à la main un résultat erroné renvoyé par l'API sans qu'il soit réécrasé.
- **Classement segmenté** : général, par camp (Students / Piscineux), par coalition.
- **Page profil** `/profile/:login` — rangs (général/camp/coalition), stats, taux de réussite et historique.
- **Badge coalition 42** aux vraies couleurs, vue des matchs groupée par journée.

### Barème des points

| Prédiction | Points |
|---|:---:|
| Score exact | **+3** |
| Bon vainqueur (ou bon nul) | **+1** |
| Mauvais résultat | **0** |

Le calcul est une **fonction pure** centralisée dans [`src/lib/points.ts`](./src/lib/points.ts) (jamais réimplémentée ailleurs) et couverte par des tests.

## 🧱 Stack

| Couche | Techno |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) |
| UI | **React 19** + **Tailwind CSS v4** (syntaxe `@theme`) |
| Langage | **TypeScript** (strict) |
| Base de données + Auth | **Supabase** (PostgreSQL + RLS) |
| Auth web | **NextAuth.js v5** — provider OAuth **42** custom |
| Données foot | **football-data.org** (gratuit, 10 req/min) |
| Hébergement | **Vercel** (+ Cron Jobs) |
| Tests | **Vitest** · Lint **ESLint v9** (flat config) |

## 🏗️ Architecture en bref

```
Navigateur ─┬─► Server Components (lecture publique via clé anon, RLS)
            └─► Routes API /api/cron/* (écriture privée via service_role)

intra.42.fr ──(OAuth2, wrapper fetch42 rate-limité)──► profil + coalitions
football-data.org ──► fixtures & scores

Deux déclencheurs périodiques :
  • sync-matches  → Cron Vercel quotidien (ingestion des matchs CM)
  • sync-results  → pinger externe toutes les 2 min (scoring), protégé par CRON_SECRET
```

La logique métier (calcul des points, sélection de coalition, règles de pari,
orchestration du cron) est écrite en **fonctions pures testées**, séparées des
I/O (Supabase / API 42) injectés par dépendance. Détails complets dans
[`docs/architecture.md`](./docs/architecture.md).

## 🚀 Démarrer en local

**Prérequis :** Node.js 20+, un projet [Supabase](https://supabase.com), une app
OAuth sur l'[intra 42](https://profile.intra.42.fr/oauth/applications), une clé
[football-data.org](https://www.football-data.org/client/register).

```bash
git clone https://github.com/FiTcHeRs71/42bet.git
cd 42bet
npm install
cp .env.local.example .env.local   # puis renseigner les variables (voir ci-dessous)
npm run dev                        # http://localhost:3000
```

### Variables d'environnement

Toutes décrites dans [`.env.local.example`](./.env.local.example). Aucune n'est
commitée (les fichiers `.env*` sont gitignorés).

| Variable | Portée | Source |
|---|---|---|
| `AUTH_SECRET` | server | `openssl rand -base64 32` |
| `AUTH_URL` | server | `http://localhost:3000` en dev, URL de prod sinon |
| `FT_API_UID` / `FT_API_SECRET` | server | App OAuth intra 42 |
| `FT_API_CAMPUS_ID` | server | ID de campus 42 (`47` = Lausanne) |
| `FOOTBALL_DATA_API_KEY` | server | football-data.org |
| `NEXT_PUBLIC_SUPABASE_URL` | client | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Supabase → clé *publishable* |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Supabase → clé *secret* (jamais côté client) |
| `CRON_SECRET` | server | `openssl rand -base64 32` |

> 🔒 Seules les variables `NEXT_PUBLIC_*` sont exposées au navigateur.
> `SUPABASE_SERVICE_ROLE_KEY` et `FT_API_SECRET` restent strictement server-only.

### Base de données

Le schéma est **versionné** dans [`supabase/migrations/`](./supabase/migrations)
(jamais modifié via l'UI Supabase) :

```bash
npx supabase link --project-ref <ton-project-ref>
npx supabase db push        # applique les migrations
```

### Commandes utiles

```bash
npm run dev          # serveur de dev
npm run build        # build production
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm test             # Vitest
```

## ☁️ Déploiement

Pensé pour **Vercel** (la prod déploie automatiquement depuis `main`). Le plan
Hobby ne permettant que des crons quotidiens, le scoring fréquent (`sync-results`)
est déclenché par un **pinger HTTP externe** toutes les 2 minutes, qui appelle
l'endpoint avec l'en-tête `Authorization: Bearer <CRON_SECRET>`. Runbook complet,
configuration OAuth de prod et topologie des crons dans
[`docs/deploy.md`](./docs/deploy.md).

### Restriction d'accès

Le login est filtré sur un campus 42 précis (gate appliquée **avant** toute
écriture en base). Pour adapter 42Bet à un autre campus, change l'ID de campus
dans la configuration d'auth — aucune autre modification n'est nécessaire.

## 📁 Structure du projet

```
.
├── src/
│   ├── app/               Pages App Router + routes API (auth, cron)
│   ├── components/        Composants React
│   └── lib/               Logique métier pure + wrappers (points, sync, API 42…)
├── supabase/migrations/   Schéma DB versionné (RLS systématique)
├── tests/                 Tests unitaires (Vitest)
├── skills/                Conventions & patterns (à lire avant de coder)
├── docs/                  Documentation technique
└── brainstorming.md       Spec d'origine
```

## 🤝 Contribuer

Les contributions sont bienvenues ! Le projet suit un **flux Pull Request** :
une PR = un sujet, relue puis mergée en *squash*. Avant d'ouvrir une PR, assure-toi
que tout est vert :

```bash
npm test && npm run typecheck && npm run lint
```

- **Conventions de code et d'architecture** : [`AGENTS.md`](./AGENTS.md) (lu aussi
  par les agents IA) et les [`skills/`](./skills/README.md) — notamment SOLID,
  le wrapper API 42 rate-limité, et la RLS Supabase systématique.
- **Format des commits** : [`conventional-commits`](./skills/conventional-commits/SKILL.md).
- **Checklist PR** : [`pr-template`](./skills/pr-template/SKILL.md) +
  [`.github/pull_request_template.md`](./.github/pull_request_template.md).

Tu rejoins le projet ? Commence par [`docs/README.md`](./docs/README.md), qui donne
l'ordre de lecture.

## 📄 Licence

Distribué sous licence **MIT** — voir [`LICENSE`](./LICENSE). Tu peux réutiliser,
forker et adapter 42Bet librement, y compris pour un autre campus 42.

## 🙌 Remerciements

- L'**[API 42](https://api.intra.42.fr/apidoc)** pour l'auth et les coalitions.
- **[football-data.org](https://www.football-data.org/)** pour les fixtures et scores.
- Construit avec [Next.js](https://nextjs.org/), [Supabase](https://supabase.com/)
  et [Vercel](https://vercel.com/).

---

<div align="center">
Fait avec ❤️ à l'École 42 Lausanne — sans argent réel, juste pour le fun.
</div>
