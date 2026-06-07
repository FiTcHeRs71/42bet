# Spec — Enrichissement de la page profil `/profile/[login]`

> Statut : validé en brainstorming le 2026-06-07. Cible : branche `feat/coalitions-pipeline` (travail UI empilé pour une PR groupée).

## 1. Objectif

Enrichir la page profil joueur en exploitant des données **déjà disponibles** dans
le view model `ProfileHistoryEntry`, sans nouvelle requête DB ni recalcul de points
(règle AGENTS.md #7). Trois enrichissements validés visuellement :

1. **Lignes d'historique enrichies** (variante B+) : écussons des deux équipes +
   date du match, en **conservant le libellé texte d'issue** (« Score exact », « Bon
   résultat », « Raté », « En attente ») — pas de badge chiffré.
2. **Ventilation de la réussite** : 3 chips colorés (scores exacts / bons résultats /
   ratés) sous la grille des 4 stats.
3. **Timeline scindée** en deux sections : **En attente** (matchs à venir) puis
   **Joués**.

## 2. Périmètre

**Dans le périmètre :**
- `src/lib/profile.ts` — deux helpers purs supplémentaires.
- `src/app/profile/[login]/page.tsx` — présentation enrichie.
- `tests/profile.test.ts` — couverture des nouveaux helpers.

**Hors périmètre :**
- Aucune modification de schéma DB, de requête Supabase, ni des wrappers `lib/users`,
  `lib/bets`, `lib/leaderboard`.
- Aucun recalcul de points : on continue d'**étiqueter** `points_awarded`.
- Pas de graphe d'évolution, pas de badges/achievements, pas de comparaison coalition
  (réservés à une éventuelle passe « Nouvelles sections »).

## 3. Logique pure — `src/lib/profile.ts`

`buildProfileHistory` reste **inchangé** (il fait déjà tri + normalisation). On ajoute
deux fonctions pures, chacune une seule responsabilité, testables isolément.

### 3.1 `countOutcomes`

```ts
export type OutcomeCounts = { exact: number; good: number; miss: number };

export function countOutcomes(entries: ProfileHistoryEntry[]): OutcomeCounts;
```

- Compte les `entries` par `outcome`, en **ignorant** `pending`.
- Retourne `{ exact, good, miss }` (clés toujours présentes, défaut `0`).

### 3.2 `partitionHistory`

```ts
export function partitionHistory(entries: ProfileHistoryEntry[]): {
  pending: ProfileHistoryEntry[];
  played: ProfileHistoryEntry[];
};
```

- `pending` = entries dont `outcome === "pending"`.
- `played` = les autres.
- **Ordre préservé** dans chaque groupe (l'entrée arrive déjà triée par kickoff
  décroissant via `buildProfileHistory` ; `partitionHistory` ne re-trie pas).
- Cas vides gérés naturellement (tableaux vides).

> Note de cohérence : `outcome === "pending"` ⇔ `points_awarded === null`
> (cf. `outcomeFromPoints`). On se base sur `outcome` pour rester aligné avec le reste
> du module et éviter de raisonner à nouveau sur `points_awarded`.

## 4. Présentation — `src/app/profile/[login]/page.tsx`

Le serveur component reste `force-dynamic`. Flux de données inchangé
(`listPlayers` + `listAllBets` + `listBetsWithMatchByUser`). On ajoute après la
construction de `history` :

```ts
const counts = countOutcomes(history);
const { pending, played } = partitionHistory(history);
```

### 4.1 Formatage de date

Constante au niveau module, à côté de `PCT_FMT` :

```ts
const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
```

Usage : `DATE_FMT.format(new Date(entry.kickoffAt))` → ex. « 14 juin ».

### 4.2 Composant local `HistoryRow`

Extrait le rendu d'une ligne (SRP — la page ne ré-imbrique pas la même structure deux
fois pour pending/played). Signature :

```ts
function HistoryRow({ entry }: { entry: ProfileHistoryEntry }): JSX.Element;
```

Structure (de gauche à droite) :
1. **Écusson home** — `<img src={entry.homeCrestUrl}>` si non `null`, sinon fallback
   carré gris (`<span>` arrondi `bg-white/10`), même pattern que l'avatar. Taille ~20px.
   Inclure `eslint-disable-next-line @next/next/no-img-element`.
2. **Équipes** — `homeTeam <span>vs</span> awayTeam`, `flex-1 truncate`.
3. **Écusson away** — même logique de fallback.
4. **Date** — `DATE_FMT.format(new Date(entry.kickoffAt))`, `text-zinc-400`.
5. **Prono** — `prono {predictedHome}–{predictedAway}`, `tabular-nums`.
6. **Score réel** — `{actualHome}–{actualAway}` si match terminé (les deux non `null`),
   sinon `—`. `tabular-nums`.
7. **Libellé d'issue** — pastille reprenant `OUTCOME[entry.outcome]` (label + classes
   existantes). Inchangé par rapport à l'actuel.

Réutilise les classes `glass`, espacements et couleurs déjà en place.

### 4.3 Ventilation de la réussite (chips)

Juste après le `<dl>` des 4 stats, une rangée de 3 chips réutilisant les couleurs de
`OUTCOME` :

- exacts → couleur `exact` (emerald), valeur `counts.exact`, label « scores exacts »
- bons → couleur `good` (sky), valeur `counts.good`, label « bons résultats »
- ratés → couleur `miss` (zinc), valeur `counts.miss`, label « ratés »

Affichée même si certains compteurs sont à 0 (cohérence visuelle). Peut être masquée
si `history` est vide (optionnel — voir §4.5).

### 4.4 Sections de la timeline

Remplace la liste unique par :

- **« En attente »** — titre + liste de `HistoryRow` sur `pending`. **Rendu seulement
  si `pending.length > 0`.**
- **« Joués »** — titre + liste de `HistoryRow` sur `played`. Rendu seulement si
  `played.length > 0`.

Les titres de section reprennent le style actuel du `<h2>` historique
(`text-sm font-medium uppercase tracking-wide text-zinc-400`).

### 4.5 Cas vide

Si `history.length === 0` : conserver le message actuel « Aucun pronostic pour
l'instant. » et ne pas afficher les sections ni (au choix) les chips de ventilation.

## 5. Tests — `tests/profile.test.ts`

Ajouts (les tests existants de `buildProfileHistory` restent verts) :

**`countOutcomes` :**
- mix exact/good/miss/pending → compte correct, `pending` ignoré.
- tableau vide → `{ exact: 0, good: 0, miss: 0 }`.
- uniquement des `pending` → tous à 0.

**`partitionHistory` :**
- mix → `pending` et `played` correctement répartis.
- **ordre préservé** dans chaque groupe (vérifier la séquence des `matchId`).
- tableau vide → deux tableaux vides.
- que des `played` / que des `pending` → l'autre groupe vide.

## 6. Critères d'acceptation

1. `npm test` vert (anciens + nouveaux cas).
2. `npm run typecheck` sans erreur.
3. `npm run lint` sans erreur (commentaire `no-img-element` présent sur chaque `<img>`).
4. La page affiche : écussons (ou fallback), dates, chips de ventilation, et deux
   sections En attente / Joués cohérentes avec les données.
5. Aucun recalcul de points ; aucune nouvelle I/O.

## 7. Pièges connus

- **`<img>` Next.js** : ESLint `@next/next/no-img-element` — réutiliser le pattern
  `eslint-disable-next-line` déjà présent pour l'avatar.
- **Écussons `null`** : football-data ne fournit pas toujours `crest_url` → toujours
  prévoir le fallback.
- **Tri** : ne pas re-trier dans `partitionHistory` ; le tri vient de
  `buildProfileHistory`.
- **`force-dynamic`** : conservé (points/rang évoluent après chaque match).
