# AGENTS.md — 42Bet

> Ce fichier est lu automatiquement par les agents IA (Claude Code, Cursor, GitHub Copilot, OpenAI Codex, et 30+ autres outils). Il définit ce qu'est ce projet, ses conventions, et où chercher les règles détaillées.
>
> Le `CLAUDE.md` à la racine importe ce fichier via `@AGENTS.md` — pas besoin de dupliquer.

## 1. Contexte

**42Bet** — web app de pronostics foot **sans argent réel** pour les étudiants et piscineux de l'**École 42 Lausanne**, à l'occasion de la Coupe du Monde + nouvelle Piscine 42.

- Projet **en binôme** (full-stack) — deux contributeurs
- Statut : **MVP complet + bonus livrés**, pas encore déployé
- Source de vérité métier : [`brainstorming.md`](./brainstorming.md) *(spec d'origine, rédigée pour un duo)*

## 2. Stack (versions exactes)

| Couche | Techno | Version |
|---|---|---|
| Framework | Next.js | **16.2.7** (App Router) |
| UI | React | **19.2.4** |
| Styling | Tailwind CSS | **v4** (nouvelle syntaxe — voir §9) |
| DB + Auth | Supabase | dernière |
| Auth web | NextAuth.js (Auth.js) | **v5 (`5.0.0-beta.31`)**, provider `42-school` (id `"42"`) |
| Hosting | Vercel | + Cron Jobs |
| API foot | football-data.org | gratuit, 10 req/min |
| API 42 | intra.42.fr | OAuth2, 2 req/sec, 1200 req/h |
| Language | TypeScript | strict |
| Lint | ESLint v9 | flat config |
| Tests | Vitest | installé (`npm test`) |

<!-- BEGIN:nextjs-agent-rules -->
**⚠️ Next.js 16, React 19 et Tailwind v4 ont tous des breaking changes par rapport au training cutoff des modèles courants.** Toujours lire `node_modules/next/dist/docs/` avant d'écrire du code Next.js spécifique. Voir §9.
<!-- END:nextjs-agent-rules -->

## 3. Carte du projet

```
.
├── AGENTS.md / CLAUDE.md         tu es ici
├── README.md                     présentation publique
├── brainstorming.md              spec d'origine (archive vivante)
├── skills/                       conventions & patterns (LIRE AVANT DE CODER)
│   ├── 42api-fetch/              wrapper API 42 (rate limit obligatoire)
│   ├── bet-points-calc/          calcul des points (fonction pure testée)
│   ├── coalition-badge/          badge UI coalition 42
│   ├── conventional-commits/     format des messages de commit
│   ├── football-data-sync/       cron Vercel idempotent
│   ├── pr-template/              checklist PR
│   ├── solid-principles/         SOLID adapté TS/React (NON-NÉGOCIABLE)
│   └── supabase-table-create/    pattern de création de table (RLS)
├── docs/                         doc technique humaine
├── supabase/migrations/          schéma DB versionné (jamais l'UI Supabase)
├── src/
│   ├── app/                      App Router (pages + routes API)
│   │   └── api/
│   │       ├── auth/[...nextauth]/   NextAuth v5 (login OAuth 42)
│   │       └── cron/sync-results/    cron scoring (protégé CRON_SECRET)
│   ├── components/               composants React (site-header, auth-button)
│   └── lib/                      logique métier pure + wrappers
│       ├── auth/                 profile (pur), upsert-player (DI), config NextAuth
│       ├── supabase/             clients typés (browser + server service_role)
│       ├── points.ts             calcul des points (pur, centralisé)
│       ├── sync.ts               orchestrateur cron (DI pur)
│       └── football-data.ts      wrapper football-data.org
├── tests/                        tests unitaires
├── public/                       assets statiques
├── vercel.json                   cron sync-results
├── .env.local.example            template des secrets
└── .github/pull_request_template.md
```

## 4. Skills — règles courtes, lien vers détail

Chaque skill est une règle versionnée. **Avant d'écrire du code dans un domaine, lire la skill correspondante.**

| Skill | Règle-clé |
|---|---|
| [`solid-principles`](./skills/solid-principles/SKILL.md) | SOLID adapté TS/React (SRP, OCP, LSP, ISP, DIP) — applicable partout |
| [`42api-fetch`](./skills/42api-fetch/SKILL.md) | Tout appel API 42 passe par `fetch42()` server-only, rate limit 2 req/sec |
| [`bet-points-calc`](./skills/bet-points-calc/SKILL.md) | Calcul des points = fonction pure, 8 cas testés, +1/+3/0 uniquement |
| [`football-data-sync`](./skills/football-data-sync/SKILL.md) | Cron idempotent, transaction atomique, protégé par `CRON_SECRET` |
| [`supabase-table-create`](./skills/supabase-table-create/SKILL.md) | Migration SQL versionnée, RLS activée d'office, FK avec `on delete` explicite |
| [`coalition-badge`](./skills/coalition-badge/SKILL.md) | Composant unique pour afficher une coalition, couleur depuis DB |
| [`conventional-commits`](./skills/conventional-commits/SKILL.md) | `type(scope): description` impérative ≤ 72 char |
| [`pr-template`](./skills/pr-template/SKILL.md) | Une PR = un sujet, skills mises à jour si comportement change |

Skills externes utilisables (installées dans `~/.agents/skills/`) :
- `vercel-react-best-practices` · `vercel-composition-patterns` · `vercel-react-view-transitions`
- `deploy-to-vercel` · `vercel-cli-with-tokens` · `vercel-optimize`

## 5. Règles non-négociables (TL;DR des skills)

À respecter même sans lire les skills en détail :

1. **SOLID** — le code suit les principes SOLID adaptés à TS/React. Cf. [`solid-principles`](./skills/solid-principles/SKILL.md).
2. **Secrets jamais commités** — `.env.local` est dans `.gitignore`. Toute nouvelle variable doit apparaître dans `.env.local.example`.
3. **API 42 server-only** — `lib/api-42.ts` ne s'importe **jamais** dans un composant `"use client"`.
4. **Rate limit API 42** — utiliser exclusivement le wrapper `fetch42()`. Pas de `fetch` direct vers `api.intra.42.fr`.
5. **RLS Supabase systématique** — toute nouvelle table active RLS et a des policies explicites.
6. **Migrations versionnées** — schéma DB modifié uniquement via `supabase/migrations/NNNN_*.sql`. Pas l'UI Supabase.
7. **Calcul des points centralisé** — uniquement dans `src/lib/points.ts`. Réutilisé partout, jamais réimplémenté.
8. **Cron protégé** — l'endpoint cron vérifie `CRON_SECRET` en premier, sinon `401`.
9. **Idempotence du cron** — exécuter le cron deux fois ne double pas les points attribués.

## 6. Commandes

```bash
npm install               # install deps
npm run dev               # serveur dev sur http://localhost:3000
npm run build             # build production
npm start                 # serve le build
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit
```

Avant chaque commit (et avant chaque PR), un agent doit :
1. `npm run typecheck` → pas d'erreur
2. `npm run lint` → pas d'erreur
3. Tests qui existent → pas de régression

## 7. Variables d'environnement

Toutes listées dans [`.env.local.example`](./.env.local.example). Pour ajouter une variable :
1. L'ajouter dans `.env.local.example` (sans la valeur)
2. La documenter en commentaire dans ce même fichier
3. Si elle est utilisée côté client, préfixe `NEXT_PUBLIC_` (sinon elle reste server-only)

⚠️ `SUPABASE_SERVICE_ROLE_KEY` est **server-only**. Si elle apparaît dans un fichier `"use client"`, c'est un bug à corriger immédiatement.

## 8. Workflow git & PR

- Format des commits : voir [`conventional-commits`](./skills/conventional-commits/SKILL.md)
- Branche par feature : `git checkout -b feat/<slug>`

**Phase actuelle — binôme : flux PR obligatoire.** Le projet est repassé à
**deux contributeurs** : toute modif de `main` passe par une **Pull Request
relue**. Plus de `merge --no-ff` direct en local sur `main`.

Cycle de travail :
1. Brancher par feature : `git checkout -b feat/<slug>` (ou `fix/`, `docs/`…).
2. Avant d'ouvrir la PR, vérifs **vertes** : `npm test` + `npm run typecheck` +
   `npm run lint`.
3. Ouvrir la PR en suivant le template [`pr-template`](./skills/pr-template/SKILL.md)
   + `.github/pull_request_template.md` (une PR = un sujet).
4. **Relecture par l'autre contributeur** (review GitHub), puis merge **squash**.
5. `main` doit rester **vert** en permanence (protection de branche).

But : qualité et traçabilité à deux. Aucun commit direct sur `main`.

> Historique : le projet a connu une phase **solo / pré-déploiement** où les PR
> étaient assouplies (merge `--no-ff` local). On en sort : **PR systématiques**.

## 9. Pièges Next.js 16 / Tailwind v4 / React 19

Le training des agents IA précède en général ces versions. **Avant d'écrire**, lire :

- **Next.js 16** : `node_modules/next/dist/docs/01-app/` (App Router, server actions, caching) et `02-guides/`
- **Tailwind v4** : nouvelle syntaxe `@theme`, plus de `tailwind.config.js` par défaut (config inline dans `globals.css`). Lire `node_modules/tailwindcss/README.md` ou la doc en ligne.
- **React 19** : nouveaux hooks (`use()`, `useFormStatus`, `useOptimistic`), Actions, refs comme props. Préférer ces API plutôt que les workarounds des versions précédentes.

Si tu n'es pas sûr·e qu'une API est encore valide → vérifier dans `node_modules/`.

## 10. Anti-patterns globaux à refuser

- ❌ Pages Router (`src/pages/`) — on utilise App Router uniquement
- ❌ `getServerSideProps` / `getStaticProps` — server components ou route handlers
- ❌ `fetch` direct vers `api.intra.42.fr` — passer par `fetch42()`
- ❌ Appel Supabase ou API 42 depuis un composant `"use client"`
- ❌ `useState`/`useEffect` pour faire un fetch initial — server component ou `use()`
- ❌ `tailwind.config.js` créé "par habitude" — Tailwind v4 utilise `@theme` dans le CSS
- ❌ `JSON.stringify` de credentials, tokens, ou secrets dans les logs
- ❌ Composant React qui prend > 5 props booléens (cf. [`solid-principles`](./skills/solid-principles/SKILL.md) §OCP/ISP)
- ❌ Fonction qui mélange calcul métier + I/O (cf. SOLID §SRP)
- ❌ Modification de schéma DB via l'UI Supabase

## 11. Documentation détaillée

Pour aller plus loin (point d'entrée onboarding : [`docs/README.md`](./docs/README.md)) :
- Architecture et flux de données → `docs/architecture.md` ✅
- Intégration API 42 (OAuth) → `docs/api-42.md` ✅
- Intégration football-data.org → `docs/football-data.md` ✅
- Schéma DB complet → `docs/database-schema.md` ✅
- Setup machine + déploiement → `docs/deploy.md` ✅
- Reprise de session / état courant → `docs/handoff.md` ✅
