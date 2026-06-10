# Spec — Exception coalition pour les chefs de piscine

> **Correction post-implémentation (2026-06-10)** : la map en dur `login → ft_id`
> décrite ci-dessous était fragile (ft_id devinés faux pour 2 chefs sur 3) et le
> script `resync-coalition` ne pouvait pas fonctionner (les coalitions de piscine
> n'existent en base qu'après le 1er login d'un membre). L'implémentation retenue
> remplace la map par un **Set de logins** ; `pickUserCoalition` retient la
> coalition de **groupe « piscine »** réellement renvoyée par l'API pour ce chef.
> Le script de resync a été retiré : la **reconnexion** crée la coalition et lie
> le joueur. Cf. branche `fix/coalition-chefs-piscine-group`.

> Date : 2026-06-10 · Branche : `feat/coalition-piscine-chefs` · Statut : design validé

## Contexte & problème

L'École 42 Lausanne a attribué à **3 testeurs** une **double affectation** de
coalition : leur coalition de cursus habituelle (cursus 21, priorité 3) **plus**
une coalition de **piscine** (cursus 9, priorité 2), car ils sont **chefs** de ces
coalitions pour la prochaine piscine.

`pickUserCoalition` (`src/lib/coalitions.ts`) sélectionne aujourd'hui la coalition
de **priorité cursus la plus haute** (21 > 9 > 1). Conséquence pour ces 3 chefs :
ils sont classés dans leur coalition de **cursus**, et le segment **Piscine** du
leaderboard n'est jamais peuplé ni testé en conditions réelles.

**But du chantier** : faire en sorte que ces 3 chefs comptent dans leur coalition
de **piscine**, puis **vérifier que la coalition de piscine s'affiche et fonctionne**
de bout en bout (leaderboard segment Piscine + profils + badge).

## Décisions actées (brainstorming)

| Décision | Choix |
|---|---|
| Où apparaissent les 3 chefs | **Piscine uniquement** (un seul `coalition_id`/user) |
| Identification des exceptions | **En dur dans le code**, keyé par **login** |
| Déclenchement immédiat | **Script de re-sync manuel** (pas d'attente de re-login) |
| Obtention de la coalition piscine | **Map en dur `login → ft_id piscine`** (pas d'appel API 42) |
| Type de PR | `feat(leaderboard)` (nouveau comportement de classement) |

## Les 3 chefs

| Login | Piscine dirigée | ft_id coalition |
|---|---|---|
| `ludebarn` | 🦈 The Sharks | 168 |
| `jturrel` | 🐸 The Frogs | 167 |
| `sweinber` | 🐧 The Penguins | 166 |

Ces 3 logins **existent déjà** dans `public.users` (testeurs déjà connectés au
moins une fois ; leur `coalition_id` pointe actuellement sur leur cursus). Les 3
coalitions piscine (166/167/168) sont **déjà seedées** dans `public.coalitions`.

## Architecture

### Source de vérité unique — map en dur

Dans `src/lib/coalitions.ts` :

```ts
/** Chefs de piscine : classés dans leur coalition de piscine, pas leur cursus.
 *  login → ft_id de la coalition piscine dirigée. Exception TEMPORAIRE
 *  (piscine 2026). Retirer quand l'école retire la double affectation. */
export const PISCINE_CHEFS: Record<string, number> = {
  ludebarn: 168, // The Sharks
  jturrel:  167, // The Frogs
  sweinber: 166, // The Penguins
};
```

Cette map est l'**unique** endroit qui encode l'exception. Elle sert :
- au **login** via `pickUserCoalition` (règle durable) ;
- au **re-sync offline** via le script (déclencheur immédiat).

### `pickUserCoalition` — signature étendue

Signature : `pickUserCoalition(raw: Ft42Coalition[], login?: string): CoalitionRef | null`.

Logique ajoutée, **avant** la sélection par priorité :
- Si `login` est défini **et** présent dans `PISCINE_CHEFS`, chercher dans `raw`
  la coalition dont `id === PISCINE_CHEFS[login]`.
  - Trouvée → la retourner (normalisée comme aujourd'hui : couleur fallback,
    `imageUrl`).
  - **Absente de `raw`** (l'API 42 n'a pas renvoyé la piscine) → **repli** sur la
    logique de priorité actuelle (ne jamais crasher, ne jamais inventer une
    coalition non retournée par l'API).
- Si `login` non chef ou absent → comportement **strictement inchangé**.

La fonction reste **pure** (aucun I/O ; `PISCINE_CHEFS` est une const de module).

### Appelant à mettre à jour

`src/lib/auth/upsert-player.ts` appelle déjà `pickUserCoalition(raw)` et dispose
de `profile.login`. Changement : `pickUserCoalition(raw, profile.login)`. Aucune
autre modification (le reste du best-effort upsert/link est inchangé).

### Re-sync immédiat — `scripts/resync-coalition.ts`

Outil **dev-only**, calqué sur `scripts/simulate-score.ts` :
- crée son **propre** client `service_role` (n'importe **pas** `@/lib/supabase/server`
  ni `@/lib/api-42`, qui chargent `server-only`) ;
- **aucun appel API 42** : la cible piscine vient de `PISCINE_CHEFS` ;
- pour chaque `login → ftIdPiscine` :
  1. résoudre l'uuid interne : `select id from coalitions where ft_id = ftIdPiscine` ;
  2. lire l'état courant : `select coalition_id from users where login = …` (pour
     logguer l'avant/après) ;
  3. `update users set coalition_id = <uuid> where login = …`.
- **idempotent** : ré-exécuter laisse le même état. Log clair par chef
  (login, coalition avant → après, ou « déjà à jour »).
- avertit si un login est introuvable dans `users` (ne crashe pas les autres).

Ajout dans `package.json` :
```json
"resync-coalition": "node --env-file=.env.local --import tsx scripts/resync-coalition.ts"
```

## Tests (`tests/coalitions.test.ts`)

Cas ajoutés (fonction pure, faciles à fixer) :
1. **Chef → piscine** : `raw` contient cursus 21 (prio 3) + piscine (prio 2) ;
   avec `login` chef → retourne la **piscine**, pas le cursus.
2. **Chef sans piscine dans `raw`** : `raw` ne contient que le cursus → **repli**
   sur le cursus (pas de crash, pas de coalition inventée).
3. **Non-régression** : même `raw` sans `login` (ou login non-chef) → sélection
   par priorité **inchangée** (les cas existants restent verts).

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `src/lib/coalitions.ts` | + `PISCINE_CHEFS` ; signature `pickUserCoalition(raw, login?)` |
| `src/lib/auth/upsert-player.ts` | passe `profile.login` à `pickUserCoalition` |
| `scripts/resync-coalition.ts` | **nouveau** script de re-sync |
| `package.json` | + script npm `resync-coalition` |
| `tests/coalitions.test.ts` | + 3 cas |
| `skills/coalition-badge/SKILL.md` | note la règle d'exception si pertinent |

## Plan de vérification

1. `npm test` + `npm run typecheck` + `npm run lint` → verts.
2. `npm run resync-coalition` → les 3 chefs passent sur leur piscine en DB
   (le script log l'avant/après par chef).
3. `/leaderboard`, segment **Piscine** → les 3 chefs apparaissent avec le bon
   `CoalitionBadge` (Sharks / Frogs / Penguins) ; ils ne sont **plus** dans le
   segment **Cursus**.
4. `/profile/ludebarn`, `/profile/jturrel`, `/profile/sweinber` → coalition de
   piscine affichée.
5. **Durabilité** : un des 3 se relogue → reste sur la piscine (preuve que la
   règle de `pickUserCoalition` tient au-delà du script).

## Hors périmètre (YAGNI)

- ❌ Support multi-coalition (un user → plusieurs coalitions / plusieurs segments).
- ❌ Règle générale « tout chef de piscine » : on traite **uniquement** ces 3 cas
  connus, en dur. Une généralisation viendra si le besoin se confirme.
- ❌ Table/flag DB ou variable d'environnement pour les exceptions.
- ❌ Re-fetch API 42 dans le script.

## Risques & réserves

- Si l'API 42 ne renvoie pas la coalition piscine au login d'un chef, le login le
  reclasserait sur son cursus. Le repli est volontaire (ne jamais inventer une
  coalition). Le script de re-sync, lui, force l'état correct indépendamment de
  l'API. En pratique l'école a fait la double affectation → l'API doit renvoyer
  les deux.
- Exception **temporaire** : prévoir de retirer `PISCINE_CHEFS` (et de laisser le
  login reclasser naturellement) quand la double affectation prend fin.
