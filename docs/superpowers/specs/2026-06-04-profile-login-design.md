# Design — page `/profile/[login]` (profil joueur public)

> Statut : **spec validée**, prête pour le plan d'implémentation.
> Date : 2026-06-04 · Branche cible : `feat/profile`
> Feature bonus (hors MVP). MVP 5/5 déjà livré.

## 1. But

Page publique d'un joueur, accessible par `/profile/:login`, affichant :

- **En-tête** : avatar, login, badge coalition.
- **Stats** : rang au classement, total points, taux de réussite, nombre de pronos.
- **Timeline** : historique des pronos du joueur, chacun joint à son match
  (équipes, score réel, statut) avec le score pronostiqué et l'issue (exact /
  bon résultat / raté / en attente).

Chaque login du classement `/leaderboard` devient un lien vers ce profil.

## 2. Décisions de design (trade-offs tranchés)

| Décision | Choix | Raison |
|---|---|---|
| Source du rang + stats | **Réutiliser `buildLeaderboard`** | DRY, 100 % cohérent avec `/leaderboard`, respecte la règle #7 (jamais de recalcul de points). Surcoût data négligeable à l'échelle d'une piscine 42. |
| Confidentialité de l'historique | **Transparence totale** : on montre **tous** les pronos, scores prédits inclus, même pour les matchs **à venir** | Projet sans argent, piscine entre potes. Trade-off accepté : un joueur peut voir le prono d'un autre avant le coup d'envoi. |
| Tri de la timeline | `kickoff_at` **décroissant** (à venir en haut, puis passés) | Le plus récent / imminent d'abord. |

## 3. Architecture — unités

| Unité | Fichier | Rôle | I/O ? |
|---|---|---|---|
| `listBetsWithMatchByUser` | `src/lib/bets.ts` (ajout) | Pronos d'un joueur **joints au match** (équipes, crests, score réel, statut, kickoff). Server-only via `service_role` (bets = RLS default-deny). | oui |
| `buildProfileHistory` | `src/lib/profile.ts` (nouveau) | **Pure** : transforme les pronos-avec-match en view models triés (récent→ancien), dérive l'issue de chaque prono. Aucune I/O, aucun recalcul de points. | non |
| `ProfilePage` | `src/app/profile/[login]/page.tsx` (nouveau) | Server component `force-dynamic` : orchestre les fetchs, `notFound()` si login inconnu, rend en-tête + stats + timeline. | — |
| lien classement | `src/app/leaderboard/page.tsx` (édit) | `login` enveloppé dans un `<Link>` vers `/profile/:login`. | — |
| tests | `tests/profile.test.ts` (nouveau) | couvre `buildProfileHistory` (tri, issues, scoré vs en attente, liste vide). | — |

**Réutilisé tel quel** (aucune modification) : `listPlayers()`, `listAllBets()`,
`buildLeaderboard()`, `CoalitionBadge`. Le type `LeaderboardPlayer` retourné par
`listPlayers()` fournit déjà `{ id, login, avatar_url, coalition }` — pas besoin
d'une requête joueur dédiée.

## 4. Flux de données (dans `ProfilePage`)

1. `const { login } = await params;` (Next 16 : `params` est une `Promise`).
2. Fetchs (parallélisables en `Promise.all` tant qu'indépendants) :
   - `listPlayers()` → chercher le joueur par `login`.
     **Introuvable ⇒ `notFound()`** (404). Fournit avatar + coalition + `id`.
   - `listAllBets()`.
3. `buildLeaderboard(players, bets)` → entrée du joueur par `login` :
   **rang, points, taux, nb pronos**. Si le joueur a **0 prono noté**, il est
   filtré par `buildLeaderboard` → pas d'entrée ⇒ rang affiché `—`, 0 pt, taux
   `—`, 0 prono.
4. `listBetsWithMatchByUser(player.id)` → `buildProfileHistory(rows, now)` → timeline.

Note : `listBetsWithMatchByUser` dépend de `player.id` (résolu à l'étape 2), donc
cette requête vient **après** la résolution du joueur, pas dans le premier
`Promise.all`.

## 5. View model d'un prono (sortie de `buildProfileHistory`)

```ts
type ProfileHistoryEntry = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeCrestUrl: string | null;
  awayCrestUrl: string | null;
  kickoffAt: string;          // ISO
  predictedHome: number;
  predictedAway: number;
  actualHome: number | null;  // null si match non terminé
  actualAway: number | null;
  status: MatchStatus;
  pointsAwarded: number | null;
  outcome: "exact" | "good" | "miss" | "pending";
};
```

`outcome` dérivé **uniquement** de `points_awarded` (on étiquette, on ne
recalcule pas — règle #7) :

| `points_awarded` | `outcome` | Libellé UI |
|---|---|---|
| `3` | `exact` | Score exact |
| `1` | `good` | Bon résultat |
| `0` | `miss` | Raté |
| `null` | `pending` | En attente |

> Le barème 3 / 1 / 0 est défini dans `src/lib/points.ts` (skill
> `bet-points-calc`). À confirmer au moment du plan ; aucun recalcul ici.

Tri : `kickoff_at` décroissant. Départage déterministe par `matchId` si kickoff
identique.

## 6. UI

Réutilise les patterns visuels de `/leaderboard` :

- **En-tête** : avatar rond (fallback gris si `avatar_url` null, comme le
  classement), login, `CoalitionBadge` (taille `sm` ou `md`).
- **Bloc stats** : rang · total points · taux de réussite · nb pronos, en
  `tabular-nums`. Taux formaté avec `Intl.NumberFormat("fr-FR", {style:"percent"})`
  (même formateur que `/leaderboard`).
- **Timeline** : une carte par prono — match (crests + noms), prono `x–y`,
  score réel `a–b` (ou `—` si non terminé), pastille colorée selon `outcome`.

Conteneur : `<main>` cohérent avec les autres pages (`mx-auto max-w-2xl p-6`).

## 7. Gestion d'erreurs

- Login inconnu → `notFound()` (Next 16 rend la 404 / `not-found`).
- Erreurs DB → levées par les fonctions I/O (`throw new Error(...)`), convention
  existante (`listPlayers`, `listAllBets`, etc.).

## 8. Tests (`tests/profile.test.ts`)

`buildProfileHistory` (fonction pure) :

1. Liste vide → `[]`.
2. Tri `kickoff_at` décroissant respecté.
3. `outcome` correct pour chaque cas : `3→exact`, `1→good`, `0→miss`, `null→pending`.
4. `actualHome/Away` = `null` quand le match n'est pas terminé ; valeurs réelles
   quand terminé.
5. Départage déterministe à kickoff identique (par `matchId`).

Conformément au workflow : `npm test` + `npm run typecheck` + `npm run lint`
verts avant merge.

## 9. Hors scope (YAGNI)

- Pagination / infinite scroll de l'historique.
- Graphiques, courbes de progression.
- Édition de profil, paramètres.
- Classement par coalition (feature bonus **séparée**, spec dédiée).
- Filtres / recherche dans l'historique.

Une seule nouvelle requête DB ajoutée (`listBetsWithMatchByUser`).

## 10. Workflow

Phase pré-déploiement (AGENTS.md §8) : branche `feat/profile`, TDD pour la
fonction pure, `merge --no-ff` local dans `main` après vérifs vertes. Pas de PR
obligatoire tant que non déployé.
