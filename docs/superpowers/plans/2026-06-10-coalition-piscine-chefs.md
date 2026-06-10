# Exception coalition chefs de piscine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classer les 3 chefs de piscine (`ludebarn`, `jturrel`, `sweinber`) dans leur coalition de piscine au lieu de leur cursus, et fournir un script de re-sync immédiat, afin de vérifier que le segment Piscine du leaderboard s'affiche et fonctionne.

**Architecture:** Une map en dur `PISCINE_CHEFS` (login → ft_id de coalition piscine) dans `src/lib/coalitions.ts` est l'unique source de vérité. `pickUserCoalition` (fonction pure) la consulte pour préférer la piscine au login ; un script dev `scripts/resync-coalition.ts` (calqué sur `simulate-score.ts`, client service_role propre, sans `server-only` ni API 42) la consulte pour forcer l'état en DB immédiatement.

**Tech Stack:** TypeScript strict, Vitest, Supabase JS (service_role), tsx.

**Spec:** `docs/superpowers/specs/2026-06-10-coalition-exception-piscine-chefs-design.md`

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/coalitions.ts` (modif) | + `PISCINE_CHEFS` ; + helper `normalise` (DRY) ; `pickUserCoalition(raw, login?)` applique l'exception |
| `src/lib/auth/upsert-player.ts` (modif) | passe `profile.login` à `pickUserCoalition` |
| `scripts/resync-coalition.ts` (création) | outil dev : force `users.coalition_id` des chefs sur leur piscine, idempotent |
| `package.json` (modif) | + script npm `resync-coalition` |
| `tests/coalitions.test.ts` (modif) | + cas exception (chef → piscine, repli, non-régression) |
| `tests/auth-upsert-player.test.ts` (modif) | + cas : chef → la piscine est upsertée/liée |

---

## Task 1: Exception dans `pickUserCoalition` (fonction pure)

**Files:**
- Modify: `src/lib/coalitions.ts`
- Test: `tests/coalitions.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter ce bloc à la fin de `tests/coalitions.test.ts` (après le dernier `describe`) :

```ts
describe("pickUserCoalition — exception chefs de piscine", () => {
  const sharkC9 = { id: 168, name: "The Sharks", color: "#82CCE0", image_url: "s" };
  const houseC21 = { id: 192, name: "House of Threads", color: "#599ac2", image_url: "u" };

  it("chef de piscine → sa piscine même si le cursus est prioritaire", () => {
    // ludebarn dirige les Sharks (168). raw contient cursus (prio 3) + piscine (prio 2).
    expect(pickUserCoalition([houseC21, sharkC9], "ludebarn")?.ftId).toBe(168);
    // ordre inverse : même résultat
    expect(pickUserCoalition([sharkC9, houseC21], "ludebarn")?.ftId).toBe(168);
  });

  it("chef dont la piscine est absente de raw → repli priorité cursus", () => {
    // l'API n'a pas renvoyé la piscine : on ne l'invente pas, on prend le cursus.
    expect(pickUserCoalition([houseC21], "ludebarn")?.ftId).toBe(192);
  });

  it("login non-chef → sélection par priorité inchangée", () => {
    expect(pickUserCoalition([houseC21, sharkC9], "fducrot")?.ftId).toBe(192);
  });

  it("expose la map des chefs de piscine", () => {
    expect(PISCINE_CHEFS).toEqual({ ludebarn: 168, jturrel: 167, sweinber: 166 });
  });
});
```

Et compléter l'import en tête de fichier :

```ts
import {
  pickUserCoalition,
  COALITION_CURSUS_PRIORITY,
  PISCINE_CHEFS,
} from "@/lib/coalitions";
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run tests/coalitions.test.ts`
Expected: FAIL — `PISCINE_CHEFS` n'est pas exporté ; `pickUserCoalition` ignore le 2e argument.

- [ ] **Step 3: Implémenter dans `src/lib/coalitions.ts`**

Ajouter la map après `COALITION_CURSUS_PRIORITY` / `coalitionGroupOf` (avant `pickUserCoalition`) :

```ts
/**
 * Chefs de piscine : classés dans leur coalition de PISCINE, pas leur cursus.
 * login → ft_id de la coalition piscine dirigée. Exception TEMPORAIRE
 * (piscine 2026) : retirer cette map quand l'école retire la double
 * affectation — `pickUserCoalition` reclassera alors les joueurs sur leur
 * cursus via la priorité normale.
 */
export const PISCINE_CHEFS: Record<string, number> = {
  ludebarn: 168, // The Sharks
  jturrel: 167, // The Frogs
  sweinber: 166, // The Penguins
};
```

Extraire la normalisation (DRY) — ajouter ce helper privé juste avant `pickUserCoalition` :

```ts
/** Normalise un élément brut de l'API 42 en CoalitionRef (couleur fallback). */
function normalise(c: Ft42Coalition): CoalitionRef {
  const color = c.color?.trim() ? c.color.trim() : FALLBACK_COLOR;
  return {
    ftId: c.id,
    name: c.name,
    color,
    imageUrl: c.image_url ?? null,
  };
}
```

Remplacer le corps de `pickUserCoalition` par :

```ts
export function pickUserCoalition(
  raw: Ft42Coalition[],
  login?: string,
): CoalitionRef | null {
  if (raw.length === 0) return null;

  // Exception chefs de piscine : on retourne leur coalition de piscine si l'API
  // l'a bien renvoyée. Sinon, on ne l'invente pas → repli sur la priorité cursus.
  if (login && login in PISCINE_CHEFS) {
    const piscine = raw.find((c) => c.id === PISCINE_CHEFS[login]);
    if (piscine) return normalise(piscine);
  }

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

  return normalise(best);
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run tests/coalitions.test.ts`
Expected: PASS — tous les cas (existants + 4 nouveaux) verts.

- [ ] **Step 5: Commit**

```bash
git add src/lib/coalitions.ts tests/coalitions.test.ts
git commit -m "feat(leaderboard): pickUserCoalition classe les chefs de piscine dans leur piscine"
```

---

## Task 2: Passer le login dans `upsertPlayer`

**Files:**
- Modify: `src/lib/auth/upsert-player.ts`
- Test: `tests/auth-upsert-player.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter ce cas dans le `describe("upsertPlayer", …)` de `tests/auth-upsert-player.test.ts` :

```ts
it("chef de piscine : upserte et lie sa coalition de piscine, pas le cursus", async () => {
  const chef = { ...profile, login: "ludebarn" };
  const deps = baseDeps({
    fetchUserCoalitions: vi.fn().mockResolvedValue([
      { id: 192, name: "House of Threads", color: "#599ac2" }, // cursus (prio 3)
      { id: 168, name: "The Sharks", color: "#82CCE0" }, // piscine dirigée
    ]),
    upsertCoalition: vi.fn().mockResolvedValue({ id: "shark-uuid", error: null }),
  });
  await upsertPlayer(chef, deps);
  expect(deps.upsertCoalition).toHaveBeenCalledWith({
    ftId: 168,
    name: "The Sharks",
    color: "#82CCE0",
    imageUrl: null,
  });
  expect(deps.setCoalition).toHaveBeenCalledWith(42, "shark-uuid");
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run tests/auth-upsert-player.test.ts`
Expected: FAIL — `upsertCoalition` est appelé avec la coalition 192 (cursus), pas 168, car le login n'est pas encore transmis à `pickUserCoalition`.

- [ ] **Step 3: Implémenter**

Dans `src/lib/auth/upsert-player.ts`, modifier l'appel (actuellement `const ref = pickUserCoalition(raw);`) :

```ts
    const ref = pickUserCoalition(raw, profile.login);
```

- [ ] **Step 4: Lancer toute la suite pour vérifier qu'elle passe**

Run: `npx vitest run tests/auth-upsert-player.test.ts`
Expected: PASS — le nouveau cas + les 6 existants (login `fducrot` non-chef) verts.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/upsert-player.ts tests/auth-upsert-player.test.ts
git commit -m "feat(auth): transmet le login à pickUserCoalition pour l'exception chefs"
```

---

## Task 3: Script de re-sync immédiat

**Files:**
- Create: `scripts/resync-coalition.ts`
- Modify: `package.json`

> Outil dev, non importé par l'app et non couvert par un test unitaire (même
> convention que `scripts/simulate-score.ts`). Vérification : `typecheck` + run réel.

- [ ] **Step 1: Créer `scripts/resync-coalition.ts`**

```ts
// scripts/resync-coalition.ts
// OUTIL DEV — jamais importé par l'app. Force la coalition des chefs de piscine
// (cf. PISCINE_CHEFS dans @/lib/coalitions) sur leur coalition de piscine, sans
// attendre qu'ils se reconnectent. AUCUN appel API 42 : la cible vient de la map
// en dur. Idempotent : ré-exécuter laisse le même état.
//
// Crée son PROPRE client service_role (n'importe PAS @/lib/supabase/server ni
// @/lib/api-42, qui chargent `server-only` et lèveraient hors runtime Next).
// N'importe que la map pure PISCINE_CHEFS. Path alias @ résolus par tsx.
//
// Usage : npm run resync-coalition

import { createClient } from "@supabase/supabase-js";
import ws from "ws";

import type { Database } from "@/lib/database.types";
import { PISCINE_CHEFS } from "@/lib/coalitions";

// Node 20 has no native WebSocket — pass ws as transport so supabase-js
// doesn't throw at createClient() time (realtime is unused here).
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as unknown as typeof WebSocket } },
);

async function main() {
  for (const [login, piscineFtId] of Object.entries(PISCINE_CHEFS)) {
    // 1. uuid interne de la coalition de piscine cible.
    const { data: coal, error: cErr } = await supabaseAdmin
      .from("coalitions")
      .select("id, name")
      .eq("ft_id", piscineFtId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!coal) {
      console.warn(`⚠️  coalition ft_id=${piscineFtId} introuvable — ${login} ignoré`);
      continue;
    }

    // 2. état courant du joueur (pour logguer avant/après et l'idempotence).
    const { data: user, error: uErr } = await supabaseAdmin
      .from("users")
      .select("coalition_id")
      .eq("login", login)
      .maybeSingle();
    if (uErr) throw uErr;
    if (!user) {
      console.warn(`⚠️  user login=${login} introuvable — ignoré`);
      continue;
    }
    if (user.coalition_id === coal.id) {
      console.log(`✓ ${login} déjà sur ${coal.name} (rien à faire)`);
      continue;
    }

    // 3. bascule.
    const { error: upErr } = await supabaseAdmin
      .from("users")
      .update({ coalition_id: coal.id })
      .eq("login", login);
    if (upErr) throw upErr;
    console.log(`→ ${login} : ${user.coalition_id ?? "∅"} → ${coal.name} (${coal.id})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Ajouter le script npm dans `package.json`**

Dans `"scripts"`, après la ligne `"simulate-score": …`, ajouter :

```json
    "resync-coalition": "node --env-file=.env.local --import tsx scripts/resync-coalition.ts"
```

(Penser à la virgule en fin de la ligne `simulate-score` précédente.)

- [ ] **Step 3: Vérifier le typecheck**

Run: `npm run typecheck`
Expected: aucune erreur (0 sortie).

- [ ] **Step 4: Commit**

```bash
git add scripts/resync-coalition.ts package.json
git commit -m "feat(leaderboard): script resync-coalition pour basculer les chefs sur leur piscine"
```

---

## Task 4: Gate complet + vérification réelle + PR

**Files:** aucun changement de code — validation et ouverture de PR.

- [ ] **Step 1: Gate complet**

Run:
```bash
npm test
npm run typecheck
npm run lint
```
Expected: tests tous verts (suite existante + nouveaux cas), typecheck 0 erreur, lint 0 erreur.

- [ ] **Step 2: Re-sync réel (nécessite `.env.local` pointant sur la vraie DB Supabase)**

Run: `npm run resync-coalition`
Expected: une ligne par chef, p.ex.
```
→ ludebarn : <ancien-uuid> → The Sharks (<uuid>)
→ jturrel  : <ancien-uuid> → The Frogs (<uuid>)
→ sweinber : <ancien-uuid> → The Penguins (<uuid>)
```
Ré-exécuter → `✓ … déjà sur … (rien à faire)` (preuve d'idempotence).

- [ ] **Step 3: Vérif visuelle (manuelle)**

Run: `npm run dev`, puis dans le navigateur :
- `/leaderboard` → onglet/segment **Piscine** : `ludebarn` (Sharks), `jturrel` (Frogs),
  `sweinber` (Penguins) apparaissent avec le bon `CoalitionBadge` ; ils ne sont
  **plus** dans le segment **Cursus**.
- `/profile/ludebarn`, `/profile/jturrel`, `/profile/sweinber` → coalition de
  piscine affichée.

- [ ] **Step 4: Pousser et ouvrir la PR (skill pr-template)**

```bash
git push -u origin feat/coalition-piscine-chefs
gh pr create --base main --head feat/coalition-piscine-chefs \
  --title "feat(leaderboard): classe les chefs de piscine dans leur coalition de piscine" \
  --body "<corps suivant .github/pull_request_template.md : Quoi / Pourquoi / Comment tester / Checklist + captures avant-après>"
```
Expected: PR ouverte. Remplir la checklist, faire la self-review du diff (onglet
Files changed), joindre des captures du segment Piscine.

---

## Self-Review (auteur du plan)

**Spec coverage :**
- Map en dur login→ft_id piscine → Task 1 ✅
- `pickUserCoalition(raw, login?)` + repli si piscine absente → Task 1 ✅
- Appelant `upsert-player` transmet le login → Task 2 ✅
- Script de re-sync idempotent sans API 42 / sans server-only → Task 3 ✅
- Script npm `resync-coalition` → Task 3 ✅
- Tests (chef→piscine, repli, non-régression) → Tasks 1 & 2 ✅
- Plan de vérification (gate, re-sync, leaderboard, profils, durabilité) → Task 4 ✅
- PR `feat(leaderboard)` → Task 4 ✅
- Pas de mise à jour de skill (aucune skill ne couvre la sélection) → conforme spec ✅

**Placeholder scan :** aucun TBD/TODO ; tout le code est fourni en entier.

**Type consistency :** `PISCINE_CHEFS: Record<string, number>`, `pickUserCoalition(raw, login?)`, `normalise(c): CoalitionRef`, `CoalitionRef { ftId, name, color, imageUrl }` cohérents entre toutes les tasks et avec les types existants de `coalitions.ts`.
