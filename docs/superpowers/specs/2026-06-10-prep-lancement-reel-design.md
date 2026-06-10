# Spec — Préparation du lancement réel (reset données + retrait exception coalition)

> Contexte : l'alpha se termine ce soir (derniers matchs amicaux simulés). On
> prépare le vrai lancement Coupe du Monde. Ce spec couvre **deux volets** : (1)
> retirer l'exception coalition des 3 chefs de piscine (feature alpha-only), et
> (2) un script de reset « ardoise vierge » des données de jeu.
>
> **Hors scope** (→ futur spec (B) déploiement) : repopulation des matchs WC,
> configuration de l'env prod Vercel, crons. Le reset **vide** les matchs ; il ne
> les repeuple pas.

## Objectif

Repartir d'une base propre pour le lancement réel :
- plus aucun match simulé / amical en base (les vrais matchs WC seront resynchronisés au déploiement, hors scope) ;
- aucun pari, tous les scores joueurs à 0 ;
- les 3 testeurs (`ludebarn`, `jturrel`, `sweinber`) reviennent sur leur coalition de **cursus** (House of…), l'exception piscine étant retirée.

## État courant (vérifié le 2026-06-10)

- `users` : 11. Avec points : `fducrot` 7, `sweinber` 1, `aalvarad` 1, `lpittet` 1, `lgranger` 1, `ageoffro` 1.
- `bets` : 39. `matches` : 107 (103 `scheduled`, 4 `finished` simulés).
- Coalitions des 3 testeurs : `ludebarn`→The Frogs (167), `jturrel`→The Frogs (167), `sweinber`→House of Processes (193, = son cursus, déjà correct).
- Coalitions vérifiées via l'API 42 (`/v2/users/:id/coalitions`, token applicatif) :
  - `ludebarn` (238248) : House of Cores (191) + The Frogs (167) → cursus = **191**.
  - `jturrel` (238213) : House of Cores (191) + The Frogs (167) → cursus = **191**.
  - `sweinber` (238163) : House of Processes (193) + The Sharks (168) → cursus = **193**.

## Volet 1 — Retrait de l'exception coalition (code, PR)

Revert de la feature livrée par les PR #13/#14. L'exception était **temporaire (piscine 2026)**.

**Fichiers :**
- `src/lib/coalitions.ts` :
  - supprimer la constante `PISCINE_CHEFS` (le `Set` de logins) ;
  - supprimer la branche chef dans `pickUserCoalition` ;
  - retirer le paramètre `login` (devenu inutile) → signature `pickUserCoalition(raw: Ft42Coalition[]): CoalitionRef | null`.
- `src/lib/auth/upsert-player.ts` : ne plus transmettre `profile.login` à `pickUserCoalition` (revenir à `pickUserCoalition(coalitionsRaw)`).
- Tests :
  - `tests/coalitions.test.ts` : retirer le `describe("pickUserCoalition — exception chefs de piscine")` et l'import `PISCINE_CHEFS`. Le reste (priorité cursus, piscineux pur, mapping) reste vert.
  - `tests/auth-upsert-player.test.ts` : retirer le test « chef » login-aware ; les autres cas restent verts.

**Effet :** `pickUserCoalition` reclasse par priorité de cursus normale (21 > 9 > 1). À la prochaine connexion, `ludebarn`/`jturrel` → House of Cores (191), `sweinber` → House of Processes (193).

**Gate :** `npm test` + `npm run typecheck` + `npm run lint` verts. PR séparée, merge squash, **déployée AVANT** de lancer le Volet 2 (sinon un re-login post-reset re-classerait un chef sur sa piscine).

## Volet 2 — Script de reset des données de jeu

**Livrable :** `scripts/reset-play-data.ts` + entrée npm `reset-play-data`, sur le
modèle de `scripts/simulate-score.ts` :
- crée son **propre client `service_role`** (n'importe **pas** `@/lib/supabase/server`
  ni rien de `server-only`) ; transport `ws` pour supabase-js sous Node 20 ;
- jamais importé par l'app.

**Comportement :**
1. **Dry-run par défaut.** Sans `--yes`, le script affiche les compteurs courants
   (`matches`, `bets`, users avec `total_points > 0`) et ce qui *serait* fait,
   puis sort sans rien modifier.
2. **Backup d'abord** (avant toute écriture, y compris en `--yes`) : dump JSON
   horodaté de `matches`, `bets`, `users` dans `backups/reset-<ISO>.json`.
   Le dossier `backups/` est ajouté au `.gitignore`.
3. **Avec `-- --yes`** : exécute dans cet ordre
   1. `delete from matches` → supprime les 107 matchs ; les 39 bets tombent en
      **cascade** (`bets.match_id … on delete cascade`).
   2. `update users set total_points = 0` (tous les users).
   3. **Reclassement cursus** des testeurs encore sur une piscine, valeurs
      vérifiées : `update users set coalition_id = (select id from coalitions
      where ft_id = 191) where login in ('ludebarn','jturrel')`. `sweinber` est
      déjà sur 193 → laissé tel quel (l'update est idempotent : ne touche que
      ceux dont le `coalition_id` diffère). Les lignes `coalitions` 191/193
      existent déjà en base.
4. Affiche les compteurs après (attendu : `matches` 0, `bets` 0, users avec
   points 0 ; les 3 testeurs sur leur House).

**Sécurité / réversibilité :** garde-fou `--yes` + backup JSON. La suppression des
matchs est volontaire (repopulation WC hors scope). Le backup permet de restaurer
en cas d'erreur.

## Ordre d'exécution global

1. Volet 1 mergé **et déployé**.
2. Alpha terminée (derniers matchs amicaux ce soir).
3. Volet 2 : `npm run reset-play-data` (dry-run) → vérifier → `npm run reset-play-data -- --yes`.
4. (Plus tard, spec B) repopulation WC + finalisation déploiement.

## Tests

Comme `simulate-score`, pas de test unitaire pour un script dev one-shot : la
vérification se fait via les compteurs avant/après et le backup. Le Volet 1, lui,
est couvert par la suite Vitest existante (qui doit rester verte après retrait des
cas exception).

## Anti-patterns évités

- Pas de migration SQL pour de la **donnée** (AGENTS §5.6 : migrations = schéma).
- Script dev : `service_role` propre, jamais importé par l'app, pas de `server-only`.
- Pas de hardcode d'ft_id fragile dans le code applicatif : les valeurs cursus
  (191/193) ne vivent que dans le script de reset one-shot, vérifiées via l'API.
