---
name: pr-template
description: Template et checklist pour les pull requests 42Bet — uniformise la revue à deux et garantit que rien ne passe entre les mailles (skills à jour, tests, RLS, secrets)
---

# Skill : pull requests 42Bet

## Quand utiliser

À la création de chaque PR sur le repo 42Bet. Le template ci-dessous va dans `.github/pull_request_template.md`.

## Règles non-négociables

1. **Une PR = un sujet** : pas de mélange feat + refactor non lié.
2. **Au moins 1 review** de l'autre personne avant merge.
3. **CI verte** obligatoire (lint + typecheck + tests).
4. **Skills à jour** : si la PR change un comportement couvert par une skill (`bet-points-calc`, `42api-fetch`…), la skill doit être mise à jour dans la même PR.
5. **Pas de force-push** sur une PR sous review.

## Template (`.github/pull_request_template.md`)

```markdown
## Quoi

<!-- Description courte de la feature/fix. 1-3 phrases. -->

## Pourquoi

<!-- Contexte, lien avec brainstorming.md ou la note Obsidian. -->

## Comment tester

<!-- Étapes concrètes pour reproduire / valider en local. -->

1. 
2. 

## Checklist

- [ ] Tests ajoutés / mis à jour
- [ ] Skills mises à jour si comportement couvert change (cf. `skills/`)
- [ ] Pas de secret commité (`.env.local` jamais dans le diff)
- [ ] Si touche à la DB : migration SQL versionnée dans `supabase/migrations/`
- [ ] Si nouvelle route API : auth/RLS vérifiée
- [ ] Doc à jour si nécessaire (`docs/`, `README.md`)

## Captures (si UI)

<!-- Screenshot / GIF avant-après pour les changements visuels. -->
```

## Workflow attendu

1. Branche depuis `main` : `git checkout -b feat/<slug>` (slug = scope du commit principal)
2. Commits suivant [[conventional-commits]]
3. Push + ouverture PR
4. CI doit passer ; tag l'autre en review
5. Review : laisser des commentaires inline, pas juste "LGTM" si > 50 lignes changées
6. Merge en **squash** par défaut (historique main lisible)
7. Branche supprimée après merge

## Points de vigilance spécifiques au projet

| Si la PR touche… | Vérifier que… |
|---|---|
| `lib/points.ts` | Les 8 cas de test passent + [[bet-points-calc]] mis à jour |
| `lib/api-42.ts` | Rate limit toujours respecté + [[42api-fetch]] mis à jour |
| `app/api/cron/` | Endpoint protégé par `CRON_SECRET` + idempotent |
| `supabase/migrations/` | RLS activée + policies explicites |
| `components/CoalitionBadge.tsx` | Contraste accessibilité validé |
| `.env.local.example` | Toute nouvelle variable y figure (sans la valeur) |

## Anti-patterns à refuser

- ❌ PR géante (> 500 lignes hors lock files) — découper
- ❌ PR qui mélange feat + chore (deps) + style (formatage)
- ❌ Merge sans review parce que "c'est urgent"
- ❌ Modifier la skill et le code dans deux PRs séparées (la skill devient incohérente entre les deux)
- ❌ Description vide / "see commits"

## Liens

- [[conventional-commits]]
- [[42api-fetch]] · [[bet-points-calc]] · [[supabase-table-create]]
