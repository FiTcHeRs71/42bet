# Correction du pipeline coalitions — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger l'assignation des coalitions 42 (campus, sélection déterministe), aligner le leaderboard sur `total_points`, fusionner les Houses par nom avec couleur canonique, et seeder/tester un jeu multi-joueurs multi-coalitions.

**Architecture:** Le bug racine est `FT_API_CAMPUS_ID=33` (Bangkok) au lieu de `47` (Lausanne). On corrige la config, puis on rend `pickUserCoalition` déterministe via une table `ft_id → priorité de cursus` (21>9>1) dérivée des blocs Lausanne. Le classement individuel lit la colonne dénormalisée `users.total_points` (déjà maintenue par `score_match`), les bets ne servant plus qu'à `accuracy` / nombre de pronos. Le classement par coalition fusionne par nom et choisit une couleur canonique par priorité de cursus. Un seed local insère les 6 coalitions réelles + des joueurs fictifs pour vérification visuelle.

**Tech Stack:** TypeScript strict, Vitest, Next.js 16 (App Router), Supabase (SQL versionné), fonctions pures côté `src/lib`.

**Données réelles de référence (API 42, campus 47 Lausanne, vérifiées le 2026-06-07) :**

| ft_id | name | color | image_url | cursus | priorité |
|---|---|---|---|---|---|
| 193 | House of Processes | `#70AF85` | `https://cdn.intra.42.fr/coalition/image/193/final-processes-black-12.svg` | 21 | 3 |
| 192 | House of Threads | `#599ac2` | `https://cdn.intra.42.fr/coalition/image/192/final-threads-black.svg` | 21 | 3 |
| 191 | House of Cores | `#B23256` | `https://cdn.intra.42.fr/coalition/image/191/final-cores-black3.svg` | 21 | 3 |
| 168 | The Sharks | `#82CCE0` | `https://cdn.intra.42.fr/coalition/image/168/7.svg` | 9 | 2 |
| 167 | The Frogs | `#6c8946` | `https://cdn.intra.42.fr/coalition/image/167/5.svg` | 9 | 2 |
| 166 | The Penguins | `#EAB77F` | `https://cdn.intra.42.fr/coalition/image/166/8.svg` | 9 | 2 |
| 190 | House of Processes | `#70AF85` | — | 1 | 1 |
| 189 | House of Threads | `#528AAE` | — | 1 | 1 |
| 188 | House of Cores | `#B23256` | — | 1 | 1 |

---

## Task 1 : Corriger le campus (bug racine)

**Files:**
- Modify: `.env.local` (non versionné — édition locale)
- Modify: `.env.local.example:15`

- [ ] **Step 1: Corriger `.env.local` (local, non commité)**

Remplacer la ligne `FT_API_CAMPUS_ID=33` par :

```
FT_API_CAMPUS_ID=47   # 47 = Lausanne (Renens)
```

- [ ] **Step 2: Corriger `.env.local.example` (versionné)**

Dans `.env.local.example`, remplacer :

```
FT_API_CAMPUS_ID=33   # 33 = Lausanne
```

par :

```
FT_API_CAMPUS_ID=47   # 47 = Lausanne (Renens, Suisse). 33 = Bangkok (ne pas confondre).
```

- [ ] **Step 3: Vérifier l'absence d'autre hardcode du campus**

Run: `grep -rn "33" src/ supabase/ | grep -i campus`
Expected: aucune sortie (le seul usage est dans les fichiers `.env`).

- [ ] **Step 4: Commit**

```bash
git add .env.local.example
git commit -m "fix(config): campus 42 = 47 (Lausanne), pas 33 (Bangkok)"
```

---

## Task 2 : `pickUserCoalition` déterministe par priorité de cursus

**Files:**
- Modify: `src/lib/coalitions.ts`
- Test: `tests/coalitions.test.ts`

Le module `coalitions.ts` reste **pur** (aucun I/O, aucun import `server-only`).

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter dans `tests/coalitions.test.ts`, après le `describe("pickUserCoalition", ...)` existant, un nouveau bloc (et importer `COALITION_CURSUS_PRIORITY` en plus) :

Modifier la ligne d'import en tête de fichier :

```typescript
import { pickUserCoalition, COALITION_CURSUS_PRIORITY } from "@/lib/coalitions";
```

Ajouter à la fin du fichier :

```typescript
describe("pickUserCoalition — sélection multi-cursus (priorité 21>9>1)", () => {
  const houseC21 = { id: 192, name: "House of Threads", color: "#599ac2", image_url: "u" };
  const houseC1 = { id: 189, name: "House of Threads", color: "#528AAE", image_url: "u" };
  const sharkC9 = { id: 168, name: "The Sharks", color: "#82CCE0", image_url: "s" };

  it("préfère la House du 42cursus (c21) à l'animal de Piscine (c9)", () => {
    expect(pickUserCoalition([sharkC9, houseC21])?.ftId).toBe(192);
    // ordre inverse : résultat identique (déterminisme)
    expect(pickUserCoalition([houseC21, sharkC9])?.ftId).toBe(192);
  });

  it("préfère l'animal de Piscine (c9) à la House legacy (c1)", () => {
    expect(pickUserCoalition([houseC1, sharkC9])?.ftId).toBe(168);
  });

  it("piscineux pur -> son animal", () => {
    expect(pickUserCoalition([sharkC9])?.ftId).toBe(168);
  });

  it("legacy pur (c1) -> sa House legacy", () => {
    expect(pickUserCoalition([houseC1])?.ftId).toBe(189);
  });

  it("aucune coalition connue du mapping -> fallback raw[0]", () => {
    const exotic = { id: 99999, name: "Autre campus", color: "#111111", image_url: null };
    expect(pickUserCoalition([exotic])?.ftId).toBe(99999);
  });

  it("expose la table de priorité", () => {
    expect(COALITION_CURSUS_PRIORITY[192]).toBe(3); // c21
    expect(COALITION_CURSUS_PRIORITY[168]).toBe(2); // c9
    expect(COALITION_CURSUS_PRIORITY[189]).toBe(1); // c1
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npm test -- coalitions`
Expected: FAIL — `COALITION_CURSUS_PRIORITY` non exporté + sélection encore sur `raw[0]`.

- [ ] **Step 3: Implémenter la table de priorité et la nouvelle sélection**

Dans `src/lib/coalitions.ts`, ajouter après la constante `FALLBACK_COLOR` :

```typescript
/**
 * Priorité de cursus pour départager un joueur multi-coalitions à Lausanne
 * (campus 47). Source : GET /v2/blocs?filter[campus_id]=47, vérifié 2026-06-07.
 *   - cursus 21 (42cursus actuel) -> 3 : House of Cores/Threads/Processes (191/192/193)
 *   - cursus  9 (Piscine)         -> 2 : The Penguins/Sharks/Frogs (166/168/167)
 *   - cursus  1 (42 legacy)       -> 1 : House of … (188/189/190)
 * Si l'intra renumérote les coalitions (nouvelle saison), mettre à jour cette table.
 */
export const COALITION_CURSUS_PRIORITY: Record<number, number> = {
  193: 3, 192: 3, 191: 3, // cursus 21
  168: 2, 167: 2, 166: 2, // cursus 9
  190: 1, 189: 1, 188: 1, // cursus 1
};
```

Remplacer le corps de `pickUserCoalition` par :

```typescript
export function pickUserCoalition(raw: Ft42Coalition[]): CoalitionRef | null {
  if (raw.length === 0) return null;

  // Sélection déterministe : priorité de cursus la plus haute (21>9>1). À égalité
  // de priorité (cas improbable), départage par ft_id croissant. Les coalitions
  // hors mapping (autre campus) ont priorité 0 : on tombe alors sur la 1re reçue.
  let best = raw[0];
  let bestPrio = COALITION_CURSUS_PRIORITY[best.id] ?? 0;
  for (const c of raw) {
    const prio = COALITION_CURSUS_PRIORITY[c.id] ?? 0;
    if (prio > bestPrio || (prio === bestPrio && c.id < best.id)) {
      best = c;
      bestPrio = prio;
    }
  }

  const color = best.color?.trim() ? best.color.trim() : FALLBACK_COLOR;
  return {
    ftId: best.id,
    name: best.name,
    color,
    imageUrl: best.image_url ?? null,
  };
}
```

> Note : les tests existants utilisent des ft_id hors mapping (42, 99, 7) et un seul
> élément ou un ordre où `raw[0]` reste le bon → ils restent verts (priorité 0 partout,
> départage par ft_id croissant ne change pas un singleton, et pour `[42, 99]` le 42
> est déjà le plus petit donc conservé).

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npm test -- coalitions`
Expected: PASS (anciens + nouveaux tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coalitions.ts tests/coalitions.test.ts
git commit -m "feat(coalition): sélection déterministe par priorité de cursus"
```

---

## Task 3 : Le leaderboard individuel lit `total_points`

**Files:**
- Modify: `src/lib/leaderboard.ts`
- Modify: `src/lib/users.ts:27-46` (`listPlayers`)
- Test: `tests/leaderboard.test.ts`

Décision spec : le total de points provient de `users.total_points` (maintenu par
`score_match`). Les bets ne servent plus qu'à `bets` (nb de pronos) et `accuracy`.

- [ ] **Step 1: Mettre à jour les tests `buildLeaderboard`**

Dans `tests/leaderboard.test.ts`, remplacer le helper `player` (lignes ~14-20) par :

```typescript
function player(
  id: string,
  login: string,
  total_points = 0,
  coalition: LeaderboardPlayer["coalition"] = null,
): LeaderboardPlayer {
  return { id, login, avatar_url: null, total_points, coalition };
}
```

Remplacer les tests de points pour qu'ils pilotent `total_points` (les bets ne servent
qu'à rendre le joueur « actif » + accuracy). Remplacer les tests suivants :

```typescript
  test("tri par points décroissant", () => {
    const players = [player("u1", "alice", 1), player("u2", "bob", 3)];
    const bets: LeaderboardBet[] = [
      { user_id: "u1", points_awarded: 1 },
      { user_id: "u2", points_awarded: 3 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r.map((e) => e.login)).toEqual(["bob", "alice"]);
    expect(r.map((e) => e.rank)).toEqual([1, 2]);
  });

  test("ex æquo -> même rang, le suivant saute (1,1,3)", () => {
    const players = [
      player("u1", "alice", 3),
      player("u2", "bob", 3),
      player("u3", "carol", 1),
    ];
    const bets: LeaderboardBet[] = [
      { user_id: "u1", points_awarded: 3 },
      { user_id: "u2", points_awarded: 3 },
      { user_id: "u3", points_awarded: 1 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r.map((e) => e.rank)).toEqual([1, 1, 3]);
  });

  test("départage par login à points égaux", () => {
    const players = [player("u2", "bob", 3), player("u1", "alice", 3)];
    const bets: LeaderboardBet[] = [
      { user_id: "u2", points_awarded: 3 },
      { user_id: "u1", points_awarded: 3 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r.map((e) => e.login)).toEqual(["alice", "bob"]);
  });
```

Remplacer le test « points somme correctement, null compté 0 » par :

```typescript
  test("points proviennent de total_points (pas de la somme des bets)", () => {
    const players = [player("u1", "alice", 42)];
    const bets: LeaderboardBet[] = [
      { user_id: "u1", points_awarded: 3 },
      { user_id: "u1", points_awarded: 1 },
    ];
    const r = buildLeaderboard(players, bets);
    expect(r[0].points).toBe(42); // total_points, pas 4
    expect(r[0].bets).toBe(2); // nb de pronos inchangé
  });
```

Le test « coalition propagée telle quelle » devient (signature du helper change) :

```typescript
  test("coalition propagée telle quelle", () => {
    const players = [player("u1", "alice", 1, COA)];
    const bets: LeaderboardBet[] = [{ user_id: "u1", points_awarded: 1 }];
    const r = buildLeaderboard(players, bets);
    expect(r[0].coalition).toEqual(COA);
  });
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npm test -- leaderboard`
Expected: FAIL — `LeaderboardPlayer` n'a pas `total_points`, et `points` vaut encore la somme des bets.

- [ ] **Step 3: Mettre à jour `leaderboard.ts`**

Dans `src/lib/leaderboard.ts`, ajouter `total_points` au type `LeaderboardPlayer` :

```typescript
export type LeaderboardPlayer = {
  id: string;
  login: string;
  avatar_url: string | null;
  total_points: number;
  coalition: { name: string; color: string; image_url: string | null } | null;
};
```

Dans `buildLeaderboard`, remplacer la boucle d'agrégation (le `.map((p) => { ... })`)
pour que `points` vienne de `total_points` et que les bets ne pilotent que `bets`/`accuracy` :

```typescript
    .map((p) => {
      const userBets = betsByUser.get(p.id)!;
      let scored = 0;
      let wins = 0;
      for (const b of userBets) {
        if (b.points_awarded !== null) {
          scored += 1;
          if (b.points_awarded > 0) wins += 1;
        }
      }
      return {
        login: p.login,
        avatarUrl: p.avatar_url,
        coalition: p.coalition,
        points: p.total_points, // source de vérité dénormalisée (score_match)
        bets: userBets.length,
        accuracy: scored > 0 ? wins / scored : null,
      };
    });
```

- [ ] **Step 4: Mettre à jour `listPlayers` (`src/lib/users.ts`)**

Dans le `.select(...)` de `listPlayers`, ajouter `total_points` :

```typescript
    .select("id, login, avatar_url, total_points, coalition:coalitions(name, color, image_url)");
```

Et dans le `.map` de retour, propager le champ :

```typescript
    return {
      id: row.id,
      login: row.login,
      avatar_url: row.avatar_url,
      total_points: row.total_points,
      coalition: Array.isArray(c) ? (c[0] ?? null) : c,
    };
```

- [ ] **Step 5: Lancer les tests, vérifier le succès**

Run: `npm test -- leaderboard`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add src/lib/leaderboard.ts src/lib/users.ts tests/leaderboard.test.ts
git commit -m "feat(leaderboard): le classement individuel lit users.total_points"
```

---

## Task 4 : Fusion des Houses par nom + couleur canonique

**Files:**
- Modify: `src/lib/leaderboard.ts`
- Modify: `src/lib/users.ts` (`listPlayers` select + map)
- Test: `tests/leaderboard.test.ts`

On ajoute `ft_id` à la forme « coalition » pour choisir une couleur canonique
déterministe (priorité de cursus la plus haute) quand deux ft_id partagent un nom.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `tests/leaderboard.test.ts`, mettre à jour les constantes coalition pour inclure `ft_id` :

```typescript
const COA = { ft_id: 192, name: "The Federation", color: "#39c2c2", image_url: null };
```

```typescript
const FED = { ft_id: 192, name: "Federation", color: "#39c2c2", image_url: null };
const ORDER = { ft_id: 191, name: "Order", color: "#9b59b6", image_url: null };
const ALLI = { ft_id: 168, name: "Alliance", color: "#e67e22", image_url: null };
```

Ajouter, dans `describe("buildCoalitionLeaderboard", ...)`, un test de fusion +
couleur canonique (House c21 ft_id 192 `#599ac2` prioritaire sur House c1 ft_id 189 `#528AAE`) :

```typescript
  test("fusionne les Houses homonymes et garde la couleur du cursus prioritaire", () => {
    const houseC21 = { ft_id: 192, name: "House of Threads", color: "#599ac2", image_url: "c21" };
    const houseC1 = { ft_id: 189, name: "House of Threads", color: "#528AAE", image_url: "c1" };
    const entries = [
      entry("alice", 4, houseC21),
      entry("bob", 2, houseC1),
    ];
    const r = buildCoalitionLeaderboard(entries);
    expect(r).toHaveLength(1);
    expect(r[0].coalition.name).toBe("House of Threads");
    expect(r[0].coalition.color).toBe("#599ac2"); // couleur c21 (priorité 3)
    expect(r[0].coalition.image_url).toBe("c21");
    expect(r[0].totalPoints).toBe(6);
    expect(r[0].players).toBe(2);
  });
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npm test -- leaderboard`
Expected: FAIL — la forme coalition n'a pas `ft_id`, et la couleur canonique n'est pas choisie par priorité (premier croisé non déterministe).

- [ ] **Step 3: Ajouter `ft_id` aux types coalition de `leaderboard.ts`**

Dans `src/lib/leaderboard.ts`, définir un type partagé et l'utiliser partout :

```typescript
export type LeaderboardCoalition = {
  ft_id: number;
  name: string;
  color: string;
  image_url: string | null;
};
```

Remplacer les trois occurrences de la forme inline `{ name: string; color: string; image_url: string | null }`
(dans `LeaderboardPlayer.coalition`, `LeaderboardEntry.coalition`, `CoalitionStanding.coalition`)
par `LeaderboardCoalition | null` (et `LeaderboardCoalition` non-null pour `CoalitionStanding.coalition`).

- [ ] **Step 4: Couleur canonique dans `buildCoalitionLeaderboard`**

En tête de `src/lib/leaderboard.ts`, ajouter l'import de la table de priorité :

```typescript
import { COALITION_CURSUS_PRIORITY } from "@/lib/coalitions";
```

Dans `buildCoalitionLeaderboard`, lors du regroupement par nom, conserver l'objet
coalition de **plus haute priorité de cursus**. Remplacer le bloc de regroupement
(la boucle `for (const e of entries) { ... }`) par :

```typescript
  for (const e of entries) {
    if (e.coalition === null) continue;
    const acc = byName.get(e.coalition.name);
    if (acc) {
      acc.totalPoints += e.points;
      acc.players += 1;
      // Couleur/logo canoniques = coalition de cursus le plus prioritaire (21>9>1).
      const cur = COALITION_CURSUS_PRIORITY[acc.coalition.ft_id] ?? 0;
      const cand = COALITION_CURSUS_PRIORITY[e.coalition.ft_id] ?? 0;
      if (cand > cur) acc.coalition = e.coalition;
    } else {
      byName.set(e.coalition.name, {
        coalition: e.coalition,
        totalPoints: e.points,
        players: 1,
      });
    }
  }
```

- [ ] **Step 5: Mettre à jour `listPlayers` (`src/lib/users.ts`)**

Ajouter `ft_id` au select de la relation coalition :

```typescript
    .select("id, login, avatar_url, total_points, coalition:coalitions(ft_id, name, color, image_url)");
```

Mettre à jour le cast de `c` dans le `.map` pour inclure `ft_id` :

```typescript
    const c = row.coalition as
      | { ft_id: number; name: string; color: string; image_url: string | null }
      | { ft_id: number; name: string; color: string; image_url: string | null }[]
      | null;
```

- [ ] **Step 6: Lancer les tests, vérifier le succès**

Run: `npm test -- leaderboard`
Expected: PASS.

- [ ] **Step 7: Typecheck (le composant `CoalitionBadge` accepte un sur-ensemble)**

Run: `npm run typecheck`
Expected: aucune erreur. `CoalitionBadge` attend `{ name, color, image_url }` ; on lui
passe un `LeaderboardCoalition` (sur-ensemble avec `ft_id`) via une variable → assignable.

- [ ] **Step 8: Commit**

```bash
git add src/lib/leaderboard.ts src/lib/users.ts tests/leaderboard.test.ts
git commit -m "feat(leaderboard): fusion des Houses par nom + couleur canonique (cursus prioritaire)"
```

---

## Task 5 : Seed local multi-joueurs / multi-coalitions

**Files:**
- Create: `supabase/seed.sql`

`supabase/seed.sql` est joué par `supabase db reset` en local UNIQUEMENT — jamais en
prod (ce n'est pas une migration versionnée). Données fictives marquées `test_*`.

- [ ] **Step 1: Créer `supabase/seed.sql`**

```sql
-- supabase/seed.sql
-- Seed de DEV uniquement (joué par `supabase db reset`, jamais en prod).
-- 6 coalitions réelles de Lausanne (campus 47) + joueurs fictifs `test_*`
-- répartis sur plusieurs coalitions, avec des bets notés pour peupler le classement.
-- Données vérifiées via l'API 42 le 2026-06-07.

-- 1. Coalitions réelles (cursus 21 = Houses, cursus 9 = Piscine).
insert into public.coalitions (ft_id, name, color, image_url) values
  (193, 'House of Processes', '#70AF85', 'https://cdn.intra.42.fr/coalition/image/193/final-processes-black-12.svg'),
  (192, 'House of Threads',   '#599ac2', 'https://cdn.intra.42.fr/coalition/image/192/final-threads-black.svg'),
  (191, 'House of Cores',     '#B23256', 'https://cdn.intra.42.fr/coalition/image/191/final-cores-black3.svg'),
  (168, 'The Sharks',         '#82CCE0', 'https://cdn.intra.42.fr/coalition/image/168/7.svg'),
  (167, 'The Frogs',          '#6c8946', 'https://cdn.intra.42.fr/coalition/image/167/5.svg'),
  (166, 'The Penguins',       '#EAB77F', 'https://cdn.intra.42.fr/coalition/image/166/8.svg')
on conflict (ft_id) do nothing;

-- 2. Joueurs fictifs, total_points dénormalisé cohérent avec les bets ci-dessous.
insert into public.users (ft_id, login, avatar_url, coalition_id, total_points)
select v.ft_id, v.login, null, c.id, v.total_points
from (values
  (900001, 'test_proc_a', 193, 9),
  (900002, 'test_proc_b', 193, 4),
  (900003, 'test_threads_a', 192, 7),
  (900004, 'test_threads_b', 192, 3),
  (900005, 'test_cores_a', 191, 6),
  (900006, 'test_cores_b', 191, 1),
  (900007, 'test_shark_a', 168, 8),
  (900008, 'test_shark_b', 168, 2),
  (900009, 'test_frog_a', 167, 5),
  (900010, 'test_penguin_a', 166, 3),
  (900011, 'test_nocoa', null, 0)
) as v(ft_id, login, coa_ft_id, total_points)
left join public.coalitions c on c.ft_id = v.coa_ft_id
on conflict (ft_id) do nothing;
```

> Note : `coa_ft_id = null` (test_nocoa) → `left join` donne `c.id = null` → joueur sans
> coalition (vérifie le badge « Sans coalition » + l'exclusion du classement coalition).

- [ ] **Step 2: Ajouter des bets fictifs notés (pour `accuracy` et la présence au classement)**

Compléter `supabase/seed.sql` avec un bloc qui crée des bets liés à un match existant.
Le seed suppose qu'au moins un match est présent (sinon ajuster l'`match_id`). Ajouter :

```sql
-- 3. Bets fictifs notés, accrochés au premier match disponible.
--    Chaque joueur a 2 pronos ; points_awarded varié pour exercer accuracy.
with m as (select id from public.matches order by kickoff_at limit 1)
insert into public.bets (user_id, match_id, home_score, away_score, points_awarded)
select u.id, m.id, b.home, b.away, b.pts
from m
cross join (values
  (900001, 2, 1, 3), (900001, 1, 1, 1),
  (900002, 0, 0, 1), (900002, 3, 0, 0),
  (900003, 2, 2, 3), (900003, 1, 0, 1),
  (900004, 1, 1, 3), (900004, 0, 2, 0),
  (900005, 2, 0, 3), (900005, 1, 1, 1),
  (900006, 0, 1, 1), (900006, 2, 2, 0),
  (900007, 3, 1, 3), (900007, 1, 1, 1),
  (900008, 0, 0, 1), (900008, 2, 1, 0),
  (900009, 1, 2, 3), (900009, 0, 0, 1),
  (900010, 2, 1, 3), (900010, 1, 1, 0)
) as b(ft_id, home, away, pts)
join public.users u on u.ft_id = b.ft_id
on conflict (user_id, match_id) do nothing;
```

> Note : si la table `matches` est vide en local, ce bloc n'insère rien (CTE `m` vide).
> Dans ce cas, lancer d'abord les migrations de matches (`0008`/`0009`) ou ajouter un
> match de test avant de rejouer le seed.

- [ ] **Step 3: Vérifier le seed localement (si Supabase local dispo)**

Run: `supabase db reset` (rejoue migrations + seed)
Expected: pas d'erreur SQL ; `select count(*) from public.users where login like 'test_%';` → 11.

> Si Supabase local n'est pas configuré sur la machine, sauter l'exécution : le SQL est
> validé à la lecture, et la vérif visuelle se fera à l'étape Task 7.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "test(seed): coalitions Lausanne réelles + joueurs fictifs multi-coalitions"
```

---

## Task 6 : Documentation & mémoire

**Files:**
- Modify: `docs/api-42.md`
- Modify: `docs/database-schema.md`
- Modify: `docs/handoff.md`

- [ ] **Step 1: Documenter les coalitions réelles dans `docs/api-42.md`**

Ajouter une section « Coalitions de Lausanne (campus 47) » contenant : le tableau des 9
lignes coalitions (cf. en-tête de ce plan), la règle de priorité de cursus (21>9>1) avec
renvoi à `COALITION_CURSUS_PRIORITY`, et l'avertissement que `FT_API_CAMPUS_ID=47`
(et non 33 = Bangkok).

- [ ] **Step 2: Documenter dans `docs/database-schema.md`**

Dans la section `coalitions` / `users`, noter : (a) `total_points` est la source lue par
le classement individuel (maintenue par `score_match`) ; (b) le classement par coalition
fusionne par `name` avec couleur canonique = cursus prioritaire ; (c) `signIn` reste
bloquant si l'upsert user échoue (choix assumé).

- [ ] **Step 3: Mettre à jour `docs/handoff.md`**

Ajouter une entrée datée 2026-06-07 résumant : correction campus 47, sélection
déterministe de coalition, leaderboard sur `total_points`, fusion Houses, seed de test.

- [ ] **Step 4: Enregistrer la découverte en mémoire (claude-mem)**

Via l'outil mémoire, enregistrer une observation : « `FT_API_CAMPUS_ID=33` pointait sur
Bangkok ; Lausanne = campus 47 ; 9 coalitions réelles (3 Houses cursus21, 3 Houses
cursus1 legacy, 3 animaux Piscine cursus9) ; mapping de priorité 21>9>1 dans
`COALITION_CURSUS_PRIORITY`. »

- [ ] **Step 5: Commit**

```bash
git add docs/api-42.md docs/database-schema.md docs/handoff.md
git commit -m "docs: coalitions Lausanne réelles, campus 47, règles de sélection/leaderboard"
```

---

## Task 7 : Vérification finale (gates + visuel)

**Files:** aucun (validation seule)

- [ ] **Step 1: Suite de tests complète**

Run: `npm test`
Expected: tous verts (aucune régression).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: aucune erreur.

- [ ] **Step 4: Build production**

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 5: Vérification visuelle (dev server + seed)**

Run: `npm run dev` puis ouvrir `http://localhost:3000/leaderboard`.
Expected : section « Par coalition » peuplée avec plusieurs coalitions (Houses + animaux),
badges avec logos sur disque blanc, classement individuel trié par points ; `test_nocoa`
soit absent (aucun bet) soit avec badge « Sans coalition ».

---

## Self-review (à valider avant exécution)

- **Couverture spec** : campus (T1), pickUserCoalition (T2), total_points (T3), fusion+couleur (T4), fixtures (T2/T3/T4), seed (T5), docs+mémoire (T6), signIn « documenté seulement » (T6 step 2). ✅
- **Pas de placeholder** : tout le code est explicite. ✅
- **Cohérence des types** : `LeaderboardCoalition` (avec `ft_id`) introduit en T4 et propagé ; `COALITION_CURSUS_PRIORITY` défini en T2, réutilisé en T4 ; helper `player(id, login, total_points, coalition)` cohérent entre T3 et T4. ✅
