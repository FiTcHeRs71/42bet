---
name: conventional-commits
description: Format des messages de commit pour 42Bet — Conventional Commits adapté au projet, scope projet-spécifique, body en français accepté
---

# Skill : messages de commit

## Quand utiliser

À **chaque** commit du repo 42Bet.

## Format

```
<type>(<scope>): <description courte impérative>

[corps optionnel — explique le POURQUOI, pas le QUOI]

[footer optionnel — refs issues, breaking changes]
```

### Règles

- Description ≤ 72 caractères, à l'impératif présent (`add` pas `added`, `fix` pas `fixed`)
- Pas de point final sur la 1ère ligne
- Corps : ligne vide après la 1ère ligne, lignes wrap à 72 caractères
- Français accepté dans le corps, **anglais préféré pour la 1ère ligne** (lisibilité internationale)

## Types autorisés

| Type | Quand |
|---|---|
| `feat` | Nouvelle feature visible utilisateur |
| `fix` | Correction de bug |
| `refactor` | Réécriture sans changement de comportement |
| `perf` | Optimisation perf |
| `docs` | Doc uniquement (README, docs/, SKILL.md) |
| `test` | Ajout/modif de tests uniquement |
| `chore` | Outillage, deps, config (ESLint, tsconfig…) |
| `skills` | Ajout/modif d'une skill dans `skills/` |
| `db` | Migration Supabase |
| `style` | Formatage uniquement (pas de logique) |

## Scopes courants

- `auth` — NextAuth, OAuth 42
- `bets` — système de paris
- `matches` — affichage / sync des matchs
- `leaderboard` — classement
- `points` — calcul des points
- `cron` — sync-results
- `ui` — composants génériques
- `api-42`, `football-data` — wrappers API externes
- `db` — schéma / migrations
- *(omettre le scope si vraiment transverse)*

## Exemples

✅ Bons commits :
```
feat(bets): add bet lock at match kickoff
fix(api-42): respect 2 req/sec rate limit
db: add bets table with RLS
skills: add football-data-sync
docs: clarify cron secret setup
refactor(points): extract winner() helper
```

❌ À refuser :
```
update stuff
fixed bug
WIP
[42bet] new feature
points calc done
```

## Body : quand l'écrire

Toujours pour :
- `fix` non-trivial → expliquer la cause racine
- `feat` avec décision d'archi → expliquer l'alternative écartée
- `refactor` → expliquer la motivation

Pas besoin pour :
- `chore` simple (bump deps)
- `docs` typo
- `style` formatage

### Exemple avec body

```
fix(cron): make sync-results idempotent

Le cron pouvait double-attribuer des points si Vercel le déclenchait
deux fois (réessai en cas de timeout). On vérifie maintenant si le
match est déjà status='finished' avant de recalculer.

Refs: discussion #12
```

## Travail à deux

- **Une feature = une PR = plusieurs commits OK**, mais chaque commit doit être atomique et lisible
- `WIP` interdit en main → squash si besoin avant merge
- Si tu touches au code de l'autre : commit séparé pour la modif, body qui explique pourquoi

## Anti-patterns à refuser

- ❌ Commits "fourre-tout" mélangeant feat + fix + refactor
- ❌ Type inventé (`update`, `change`, `new`)
- ❌ Description vague (`improve code`, `various fixes`)
- ❌ Commit sans message body alors qu'il modifie le calcul de points (cf. [[bet-points-calc]])
