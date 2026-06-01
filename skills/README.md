
# Skills — 42Bet

Ce dossier contient les **skills** du projet, au format [vercel-labs/skills](https://github.com/vercel-labs/skills).

Une skill = un dossier avec un `SKILL.md` qui décrit un workflow ou un pattern de code que l'agent IA doit suivre. Les skills sont versionnées avec le code pour que **les deux personnes de l'équipe produisent du code cohérent**, peu importe l'agent IA utilisé (Claude Code, Cursor, Copilot…).

## Skills du projet

### Logique métier / intégrations
| Skill | Quand l'utiliser |
|---|---|
| [`42api-fetch`](./42api-fetch/SKILL.md) | À chaque appel à l'API 42 (rate limit obligatoire) |
| [`bet-points-calc`](./bet-points-calc/SKILL.md) | Pour calculer les points d'un pari |
| [`football-data-sync`](./football-data-sync/SKILL.md) | Pour le cron de sync des résultats |
| [`supabase-table-create`](./supabase-table-create/SKILL.md) | Pour créer une nouvelle table Supabase |

### UI
| Skill | Quand l'utiliser |
|---|---|
| [`coalition-badge`](./coalition-badge/SKILL.md) | Pour afficher l'appartenance coalition d'un user |

### Process / collaboration
| Skill | Quand l'utiliser |
|---|---|
| [`conventional-commits`](./conventional-commits/SKILL.md) | Pour chaque commit |
| [`pr-template`](./pr-template/SKILL.md) | Pour chaque pull request |

## Skills externes utilisées

Installées globalement (cf. `~/.agents/skills/`) — pas dupliquées dans le projet :

- `vercel-react-best-practices` — patterns React/Next.js performants
- `vercel-composition-patterns` — composition de composants
- `vercel-cli-with-tokens` — déploiement Vercel scripté
- `deploy-to-vercel` — déploiement direct
- `vercel-optimize` — optimisation coûts/perf
- `vercel-react-view-transitions` — animations de transition (bonus UI)

## Lister / utiliser localement

```bash
npx skills list      # voir les skills installées
npx skills find      # chercher des skills externes
```

## Ajouter une nouvelle skill

1. Créer un dossier `skills/<nom-skill>/`
2. Y écrire un `SKILL.md` avec frontmatter `name` + `description`
3. Référencer la skill dans ce README
4. Commit avec message `skills: add <nom-skill>`
