# 42Bet

Web app de pronostics foot **sans argent réel** pour les étudiants et piscineux de l'École 42 Lausanne, à l'occasion de la Coupe du Monde + nouvelle Piscine 42.

> 🚧 En cours de développement — **MVP complet** (auth 42, liste des matchs, paris, scoring, classement), phase **pré-déploiement**.

## Concept

- Auth via l'API 42 (OAuth2) — chaque joueur joue avec son login intra
- Pronostics vainqueur + score avant chaque match
- Verrou automatique au coup d'envoi
- Calcul auto des points : **+1** bon vainqueur (ou nul), **+3** score exact
- Classement avec photo et badge coalition

## Stack

- **Next.js** (App Router, TypeScript, Tailwind CSS)
- **Supabase** (PostgreSQL + Auth + RLS)
- **Vercel** (hosting + Cron Jobs)
- **NextAuth.js** avec provider OAuth 42 custom
- **football-data.org** pour les matchs et résultats

## Démarrer en local

```bash
npm install
cp .env.local.example .env.local
# remplir les variables d'environnement
npm run dev
```

Puis ouvrir http://localhost:3000.

## Structure

```
.
├── brainstorming.md       Spec initiale du projet
├── skills/                Skills agent IA (cf. vercel-labs/skills)
├── docs/                  Documentation technique
├── supabase/migrations/   Schéma DB versionné
├── src/
│   ├── app/               Pages App Router + routes API
│   ├── components/        Composants React
│   └── lib/               Logique métier (points, wrappers API)
└── tests/                 Tests unitaires
```

## Skills

Le dossier [`skills/`](./skills/README.md) contient les conventions et patterns du projet au format [vercel-labs/skills](https://github.com/vercel-labs/skills). Toute personne (ou agent IA) qui code sur le projet doit les respecter.

Skills critiques :
- [`bet-points-calc`](./skills/bet-points-calc/SKILL.md) — règles de calcul des points
- [`42api-fetch`](./skills/42api-fetch/SKILL.md) — appels API 42 avec rate limit
- [`supabase-table-create`](./skills/supabase-table-create/SKILL.md) — création de tables (RLS systématique)

## License

Non défini pour l'instant — usage interne 42 Lausanne.
