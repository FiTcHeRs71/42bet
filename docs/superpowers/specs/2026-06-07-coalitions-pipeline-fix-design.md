# Design — Correction du pipeline coalitions + tests multi-joueurs

**Date** : 2026-06-07
**Branche** : `feat/coalitions-pipeline`
**Statut** : design validé, en attente de plan d'implémentation

## Contexte

Une review de cohérence du pipeline coalitions (login → API 42 → upsert → badge →
leaderboard) a révélé un **bug racine de configuration** et plusieurs incohérences
secondaires. La vérification live de l'API 42 a montré que `FT_API_CAMPUS_ID=33`
pointe sur **Bangkok**, pas Lausanne. Lausanne est le **campus 47** (Renens, Suisse).

### Données réelles de l'API (campus 47, Lausanne)

Récupérées via `GET /v2/blocs?filter[campus_id]=47` :

| Bloc | Cursus | Coalitions (ft_id · nom · couleur) |
|------|--------|-----|
| #53 | 21 (42cursus actuel) | 193 House of Processes `#70AF85` · 192 House of Threads `#599ac2` · 191 House of Cores `#B23256` |
| #52 | 1 (42 legacy) | 190 House of Processes `#70AF85` · 189 House of Threads `#528AAE` · 188 House of Cores `#B23256` |
| #47 | 9 (Piscine) | 168 The Sharks `#82CCE0` · 167 The Frogs `#6c8946` · 166 The Penguins `#EAB77F` |

Toutes ont un `image_url`. **6 équipes logiques** (3 Houses + 3 animaux) réparties
sur **9 lignes coalitions** : les Houses existent en double (cursus 1 + cursus 21),
même nom, ft_id différents, **couleur légèrement différente** pour House of Threads.

## Problèmes identifiés (review de cohérence)

1. **🔴 Config campus erronée** — `FT_API_CAMPUS_ID=33` = Bangkok, doit être `47`.
   Le commentaire `# 33 = Lausanne` dans `.env.local.example` est faux.
2. **🔴 `pickUserCoalition` non déterministe** — prend `raw[0]` de
   `/v2/users/:id/coalitions`. Un joueur multi-cursus (Piscine + cursus) a
   plusieurs coalitions dans un ordre non garanti → assignation aléatoire.
3. **🟡 Double source de vérité des points** — `users.total_points` est maintenu
   par `score_match` mais le leaderboard resomme `bets.points_awarded` et n'utilise
   jamais la colonne dénormalisée (ni son index).
4. **🟡 Regroupement coalition par nom** — `buildCoalitionLeaderboard` groupe par
   `name` ; couleur affichée non déterministe quand deux ft_id partagent un nom.
5. **🟡 `signIn` bloquant** — `upsertPlayer` throw si l'upsert user échoue,
   awaité sans catch dans le callback `signIn` → un hoquet DB bloque le login.

## Décisions

- **Public** : étudiants et piscineux comptent à même hauteur.
- **Pick (probl. 2)** : « la plus récente » = priorité statique de cursus
  **21 > 9 > 1**, sans appel API supplémentaire.
- **Doublons Houses (probl. 4)** : **fusion par nom** (6 équipes logiques).
- **Points (probl. 3)** : le classement individuel **lit `total_points`** ;
  les bets restent chargés uniquement pour `accuracy` et le nombre de pronos.
- **signIn (probl. 5)** : **reste bloquant** (pas de session sans fiche user),
  comportement assumé et documenté — pas de changement de code.

## Architecture de la solution

### 1. Config campus
- `FT_API_CAMPUS_ID` : `33` → `47` dans `.env.local` et `.env.local.example`,
  commentaire corrigé (`# 47 = Lausanne (Renens)`).
- Vérifier qu'aucun autre fichier ne hardcode `33`.

### 2. `pickUserCoalition` déterministe (`src/lib/coalitions.ts`, pur)
- Constante exportée `COALITION_CURSUS_PRIORITY` : mapping `ft_id → priorité`
  dérivé des blocs Lausanne (21→3, 9→2, 1→1), avec commentaire sur sa provenance.
- Algo :
  1. Parmi les coalitions du joueur présentes dans le mapping, prendre la
     **priorité maximale** (départage déterministe si égalité improbable).
  2. Si aucune n'est dans le mapping mais `raw` non vide → fallback `raw[0]`.
  3. Si `raw` vide → `null`.
- La fonction reste pure (aucun I/O), testée dans `tests/coalitions.test.ts`.

### 3. Leaderboard (`src/lib/leaderboard.ts` + `src/lib/users.ts`)
- `listPlayers` sélectionne `total_points`.
- `LeaderboardPlayer` porte `total_points`.
- `buildLeaderboard` : le total de points provient de `total_points` ;
  `bets`/`accuracy` continuent de dériver des `points_awarded`.
- `buildCoalitionLeaderboard` : fusion par nom **documentée comme intentionnelle** ;
  couleur canonique déterministe = celle de la coalition de plus haute priorité
  de cursus (cursus 21 pour les Houses).

### 4. Tests
- **Fixtures unitaires** :
  - `coalitions.test.ts` : multi-cursus (House+animal→House), piscineux pur,
    legacy pur, hors mapping (fallback), vide (null).
  - `leaderboard.test.ts` : 6+ joueurs multi-coalitions ; tri sur `total_points` ;
    fusion Houses cursus1/cursus21 ; couleur canonique ; classement coalition.
- **Seed local** : `supabase/seed.sql` (ou script TS jetable hors migrations
  versionnées) insérant les 6 coalitions réelles + ~9-12 joueurs fictifs
  (`test_*`) répartis sur les coalitions, avec bets/points_awarded variés.
  Données fictives clairement marquées, **jamais** dans une migration de prod.

### 5. Documentation impactée
- `.env.local.example` (campus 47).
- `docs/api-42.md` / `docs/database-schema.md` : noter les vraies coalitions
  Lausanne, le mapping cursus→priorité, la fusion par nom.
- AGENTS.md si une référence campus existe.
- Mémoire claude-mem : enregistrer la découverte campus 33≠Lausanne et le mapping.
- Note Obsidian projet (vault perso) si à jour souhaité.

## Hors scope
- Pas de changement du comportement bloquant de `signIn` (documenté seulement).
- Pas d'appel API live pour déterminer la recency (priorité statique assumée).
- Pas de refonte du calcul des points (`calcBetPoints` reste la règle unique).

## Risques
- **Mapping d'IDs figé** : si l'intra renumérote les coalitions à une nouvelle
  saison, `COALITION_CURSUS_PRIORITY` doit être mis à jour. Acceptable pour un
  projet événementiel ; provenance documentée dans le code.
- **Cohérence `total_points` ↔ somme des bets** : `score_match` reste l'unique
  writer ; un test de non-régression garde l'invariant côté agrégation.
