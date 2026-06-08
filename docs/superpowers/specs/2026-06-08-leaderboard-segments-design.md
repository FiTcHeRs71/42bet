# Spec — Refonte du Classement (segments coalitions + camps)

> Statut : validé (brainstorming, 2026-06-08). Branche : `feat/leaderboard-segments`.

## 1. Contexte & objectif

Pendant l'alpha (campus 47, Coupe du Monde + Piscine 42), les joueurs sont à la
fois des **students** (en cursus) et des **piscineux**. La page Classement
actuelle n'offre que deux vues : classement des coalitions (à la moyenne) et
classement individuel global.

On veut enrichir la page pour permettre de comparer :

1. les **3 coalitions cursus** entre elles ;
2. les **3 coalitions piscine** entre elles ;
3. les **6 coalitions** ensemble ;
4. les deux **camps** : Students vs Piscineux ;
5. le **classement individuel général**, filtrable par camp.

## 2. Contrainte clé : aucune migration DB

Chaque joueur est déjà rattaché à **une** coalition (`users.coalition_id`),
choisie par `pickUserCoalition` qui priorise le cursus (21 > 9 > 1). Le cursus
d'une coalition se déduit de son `ft_id` via `COALITION_CURSUS_PRIORITY`
(`src/lib/coalitions.ts`) :

| Groupe | Coalitions | ft_id | priorité |
|---|---|---|---|
| **Cursus** (students) | House of Cores / Threads / Processes | 191 / 192 / 193 | 3 |
| **Piscine** (piscineux) | The Penguins / Frogs / Sharks | 166 / 167 / 168 | 2 |
| Cursus legacy (students) | (House of …) | 188 / 189 / 190 | 1 |

Conséquence métier : un joueur du cursus ayant fait une piscine reste classé
« student » (sa coalition assignée est celle du cursus) ; un piscineux pur
(coalition piscine uniquement) est classé « piscineux ». La distinction
**student / piscineux se déduit donc entièrement de la coalition assignée** —
pas de nouvelle colonne.

## 3. Métrique : classement à la moyenne, total affiché

- Coalitions et camps sont **classés à la moyenne pt/joueur actif** (équitable
  quel que soit l'effectif — les students sont plus nombreux que les piscineux).
- Le **total de points** et l'**effectif** sont affichés en colonnes
  secondaires (informatif, ne sert pas au tri).
- `buildCoalitionLeaderboard` produit déjà `average`, `totalPoints`, `players` :
  aucun changement de calcul, on affiche juste `totalPoints` en plus.

## 4. Logique métier (pure, `src/lib/leaderboard.ts`)

Aucun recalcul de points (règle projet #7) : la source de vérité reste
`users.total_points` (dénormalisé par `score_match`), agrégée par
`buildLeaderboard`.

### 4.1 `coalitionGroupOf(ftId): "cursus" | "piscine"`
Helper pur ajouté dans `src/lib/coalitions.ts`. Dérivé de
`COALITION_CURSUS_PRIORITY` : priorité `2` ⇒ `"piscine"`, sinon `"cursus"`
(couvre cursus 21 et legacy 1, et les `ft_id` hors mapping → `"cursus"` par
défaut, cas improbable hors campus 47).

### 4.2 Classements coalitions (3 vues)
On réutilise `buildCoalitionLeaderboard(entries)` **tel quel**. La page lui passe
le sous-ensemble d'`entries` voulu :
- **6 coalitions** : toutes les entries ;
- **Cursus** : entries dont `coalitionGroupOf(coalition.ft_id) === "cursus"` ;
- **Piscine** : entries dont `coalitionGroupOf(coalition.ft_id) === "piscine"`.

Le rang est donc naturellement recalculé (1,2,3) dans chaque sous-ensemble.

### 4.3 `buildCampStandings(entries): CampStanding[]`
Nouvelle fonction pure. Regroupe les entries par camp
(`coalitionGroupOf(coalition.ft_id)`, exclut `coalition === null`) et renvoie
**2 lignes max** :

```ts
type CampStanding = {
  rank: number;
  camp: "cursus" | "piscine";
  label: string;        // "Students" | "Piscineux"
  totalPoints: number;
  players: number;      // parieurs actifs du camp
  average: number;      // totalPoints / players
};
```

Tri : moyenne décroissante, départage total décroissant. Rang standard (1,1).
Un camp sans aucun parieur actif n'apparaît pas (length < 2 possible).

### 4.4 `assignRanks(entries): LeaderboardEntry[]`
Extraction de la logique de rang standard (1,1,3) aujourd'hui **inline** dans
`buildLeaderboard` (étape 4). Devient un helper pur réutilisable pour re-classer
un sous-ensemble de joueurs filtré par camp. Il **recalcule** le `rank` à partir
de l'ordre des points (déjà trié par `buildLeaderboard`), en ignorant tout rang
préexistant — on peut donc lui passer des `LeaderboardEntry` déjà classées sans
risque. `buildLeaderboard` l'utilise ensuite en interne (comportement inchangé,
simple refactor SRP).

### 4.5 Joueurs filtrés par camp
La page dérive 3 listes depuis `entries` (déjà classées) :
- **Tous** : `entries` tel quel ;
- **Students** : `assignRanks(entries.filter(cursus))` ;
- **Piscineux** : `assignRanks(entries.filter(piscine))`.

Rang recalculé 1,2,3 dans chaque camp.

## 5. UX — 2 onglets + filtres

`src/app/leaderboard/page.tsx` reste un **server component** : il fetch
(`listPlayers`, `listAllBets`), calcule **toutes** les vues (fonctions pures
ci-dessus) et passe le résultat en props à un nouveau composant **client**
`src/components/leaderboard-tabs.tsx`.

- **Aucun fetch côté client** (règle projet) — le client ne gère que l'état
  d'onglet/filtre (`useState`).
- `export const dynamic = "force-dynamic"` conservé (points évolutifs).

### Onglet « Coalitions »
- Sélecteur de filtre : `[6 coalitions] [Cursus] [Piscine]` — défaut **6 coalitions**.
- Colonnes : rang · `CoalitionBadge` · moyenne (pt/j) · total (pt) · joueurs.
- Mobile : la colonne « total » peut passer en secondaire (texte atténué), badge
  et moyenne prioritaires.

### Onglet « Joueurs »
- **Bandeau camps** en tête, **toujours visible** quel que soit le filtre :
  deux blocs `Students` / `Piscineux` avec moyenne + total + effectif (issus de
  `buildCampStandings`). Le camp en tête est marqué (rang 1).
- Sélecteur de filtre : `[Tous] [Students] [Piscineux]` — défaut **Tous**.
- Colonnes inchangées vs existant : rang · avatar · login (lien profil) ·
  `CoalitionBadge` · réussite · pronos · points.
- Rang **recalculé** dans les filtres Students/Piscineux.

### Onglet par défaut
**Coalitions** (cohérent avec l'esprit « classement coalition » du projet).

### États vides
- Aucun prono du tout : message global existant conservé.
- Sous-vue vide (ex. filtre Piscine sans parieur) : message local
  (« Aucun piscineux classé », « Aucune coalition piscine classée »).

## 6. Tests (`tests/leaderboard.test.ts` étendu)

- `coalitionGroupOf` : 191/192/193 → cursus, 166/167/168 → piscine, ft_id
  inconnu → cursus (fallback).
- `buildCampStandings` : équité à la moyenne (petit camp peut devancer un grand),
  ex æquo de moyenne, camp absent (length < 2), exclusion des `coalition === null`.
- `assignRanks` : rang standard 1,1,3 sur un sous-ensemble ; cohérence avec le
  comportement actuel de `buildLeaderboard` (non-régression).
- Filtres coalitions cursus/piscine : `buildCoalitionLeaderboard` sur sous-ensemble
  produit le bon classement et exclut l'autre groupe.

## 7. Hors périmètre (YAGNI)

- Pas de persistance de l'onglet/filtre sélectionné (URL/localStorage).
- Pas de classement historique / évolution dans le temps.
- Pas de nouvelle métrique (séries, régularité) — moyenne + total suffisent.
- Pas de changement au calcul des points ni au schéma DB.

## 8. Fichiers touchés

| Fichier | Nature |
|---|---|
| `src/lib/coalitions.ts` | + `coalitionGroupOf` |
| `src/lib/leaderboard.ts` | + `buildCampStandings`, extraction `assignRanks`, type `CampStanding` |
| `src/app/leaderboard/page.tsx` | calcule toutes les vues, délègue le rendu au client |
| `src/components/leaderboard-tabs.tsx` | **nouveau** — onglets/filtres (client) |
| `tests/leaderboard.test.ts` | tests étendus |
