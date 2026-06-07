# Documentation technique — 42Bet

Ce dossier contient la doc technique du projet. Les **skills** (`../skills/`) cadrent le code à écrire ; **docs/** explique comment l'app fonctionne et comment opérer.

## Par où commencer (onboarding)

Quelqu'un qui rejoint le projet lit, dans l'ordre :

1. [`../AGENTS.md`](../AGENTS.md) — contexte, stack, conventions, **workflow PR** (§8).
2. [`architecture.md`](./architecture.md) — comment l'app fonctionne, flux de données.
3. [`database-schema.md`](./database-schema.md) — le schéma DB.
4. [`api-42.md`](./api-42.md) + [`football-data.md`](./football-data.md) — les intégrations externes.
5. [`deploy.md`](./deploy.md) — setup machine + déploiement.

## Sommaire

- `architecture.md` — vue d'ensemble, flux de données ✅
- `api-42.md` — intégration OAuth 42 (auth) + wrapper `fetch42()` à venir ✅
- `football-data.md` — API foot, crons ingestion + scoring ✅
- `database-schema.md` — tables, relations, RLS ✅
- `deploy.md` — setup nouvelle machine + procédure de déploiement Vercel ✅
- `alpha-amicaux.md` — runbook matchs amicaux (insertion SQL + simulate-score) ✅
- `handoff.md` — état courant du projet / reprise de session ✅

## docs/ vs skills/

| docs/ | skills/ |
|---|---|
| Pour humains | Pour agents IA (et humains) |
| Décrit l'app | Cadre le code à écrire |
| Diagrammes, exemples | Règles, anti-patterns |
| Mise à jour ponctuelle | Mise à jour à chaque PR concernée |
