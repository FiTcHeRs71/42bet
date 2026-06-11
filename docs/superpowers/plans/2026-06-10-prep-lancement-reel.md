# Préparation du lancement réel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repartir d'une base propre pour le lancement WC : retirer l'exception coalition des 3 chefs de piscine (code), et fournir un script de reset qui vide les matchs/paris, remet les scores à 0 et reclasse les testeurs sur leur cursus.

**Architecture:** Deux volets indépendants. Volet 1 = revert d'une feature pure (`pickUserCoalition`) couvert par Vitest. Volet 2 = script dev `service_role` one-shot (modèle `simulate-score`), avec dry-run + backup + garde-fou `--yes`.

**Tech Stack:** TypeScript strict, Vitest, `@supabase/supabase-js` (transport `ws`), tsx, Next 16.

---

## Branch & PR strategy

- **Volet 1 (Tasks 1–2)** modifie le comportement de l'app → **sa propre PR**, mergée et **déployée AVANT** de lancer le reset (sinon un re-login re-classerait un chef sur sa piscine). Brancher depuis `main` : `git checkout main && git checkout -b chore/remove-coalition-exception`.
- **Volet 2 (Tasks 3–5) + docs (spec/plan)** ne touchent pas l'app (script non importé) → PR `chore/prep-lancement-reel` (branche courante, qui porte déjà la spec).
- L'**exécution du reset** (Task 5 `--yes`) est une opération manuelle post-déploiement, après la fin de l'alpha.

---

## Task 1: Volet 1 — retirer l'exception dans `coalitions.ts`

**Files:**
- Modify: `src/lib/coalitions.ts`
- Test: `tests/coalitions.test.ts`

- [ ] **Step 1: Mettre à jour les tests (retirer les cas exception + l'import)**

Dans `tests/coalitions.test.ts`, remplacer le bloc d'import (lignes 3–7) :

```typescript
import {
  pickUserCoalition,
  COALITION_CURSUS_PRIORITY,
} from "@/lib/coalitions";
```

Puis **supprimer entièrement** le `describe("pickUserCoalition — exception chefs de piscine", () => { … })` (le dernier `describe` du fichier, de sa ligne d'ouverture jusqu'à son `});` fermant).

- [ ] **Step 2: Lancer les tests pour voir l'échec attendu**

Run: `npx vitest run tests/coalitions.test.ts`
Expected: FAIL — `pickUserCoalition` accepte encore un 2ᵉ argument et `PISCINE_CHEFS` est encore exporté mais plus importé (TS/lint), mais surtout les anciens tests exception ont disparu. Le but de ce step est de confirmer que la suite tourne encore sur le reste.

(Si la suite passe déjà au vert ici, c'est OK : le revert du code au Step 3 ne doit pas la casser.)

- [ ] **Step 3: Retirer l'exception du code source**

Dans `src/lib/coalitions.ts`, **supprimer** le bloc de définition `PISCINE_CHEFS` (le commentaire `/** Chefs de piscine … */` + `export const PISCINE_CHEFS: ReadonlySet<string> = new Set([...]);`).

Puis remplacer la signature et le corps de `pickUserCoalition`. Remplacer :

```typescript
export function pickUserCoalition(
  raw: Ft42Coalition[],
  login?: string,
): CoalitionRef | null {
  if (raw.length === 0) return null;

  // Exception chefs de piscine : on retourne la coalition de groupe « piscine »
  // que l'API a renvoyée pour ce joueur. Sinon (aucune piscine reçue), on ne
  // l'invente pas → repli sur la priorité cursus.
  if (login !== undefined && PISCINE_CHEFS.has(login)) {
    const piscine = raw.find((c) => coalitionGroupOf(c.id) === "piscine");
    if (piscine) return normalise(piscine);
  }

  // Sélection déterministe : priorité de cursus la plus haute (21>9>1). À égalité
```

par :

```typescript
export function pickUserCoalition(
  raw: Ft42Coalition[],
): CoalitionRef | null {
  if (raw.length === 0) return null;

  // Sélection déterministe : priorité de cursus la plus haute (21>9>1). À égalité
```

(Le reste de la fonction — la boucle de priorité et le `return normalise(best)` — est inchangé.)

- [ ] **Step 4: Lancer les tests pour vérifier le vert**

Run: `npx vitest run tests/coalitions.test.ts`
Expected: PASS (tous les cas restants : null, priorité cursus, piscineux pur, mapping).

- [ ] **Step 5: Typecheck (détecte tout usage résiduel de `PISCINE_CHEFS` / du param `login`)**

Run: `npm run typecheck`
Expected: échouera si `upsert-player.ts` passe encore `profile.login` → c'est attendu, corrigé en Task 2. Si l'erreur ne concerne QUE `upsert-player.ts`, continuer.

- [ ] **Step 6: Commit**

```bash
git add src/lib/coalitions.ts tests/coalitions.test.ts
git commit -m "refactor(leaderboard): retire l'exception coalition chefs de piscine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Volet 1 — adapter l'appelant `upsert-player.ts`

**Files:**
- Modify: `src/lib/auth/upsert-player.ts:48`
- Test: `tests/auth-upsert-player.test.ts`

- [ ] **Step 1: Retirer le test « chef » de la suite upsert-player**

Dans `tests/auth-upsert-player.test.ts`, **supprimer entièrement** le `it("chef de piscine : upserte et lie sa coalition de piscine, pas le cursus", async () => { … });` (lignes 86–103), juste avant le `});` final du `describe`.

- [ ] **Step 2: Lancer la suite pour confirmer l'état**

Run: `npx vitest run tests/auth-upsert-player.test.ts`
Expected: la suite tourne ; le test chef a disparu. (Les autres cas restent verts.)

- [ ] **Step 3: Ne plus transmettre `login` à `pickUserCoalition`**

Dans `src/lib/auth/upsert-player.ts`, remplacer la ligne 48 :

```typescript
    const ref = pickUserCoalition(raw, profile.login);
```

par :

```typescript
    const ref = pickUserCoalition(raw);
```

- [ ] **Step 4: Gate complet du Volet 1**

Run:
```bash
npx vitest run
npm run typecheck
npm run lint
```
Expected: tests tous verts, typecheck 0 erreur (plus d'erreur résiduelle), lint 0 erreur.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/upsert-player.ts tests/auth-upsert-player.test.ts
git commit -m "refactor(auth): upsertPlayer n'a plus besoin du login pour la coalition

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Ouvrir la PR Volet 1 (à déployer en premier)**

```bash
git push -u origin chore/remove-coalition-exception
gh pr create --base main --head chore/remove-coalition-exception \
  --title "refactor(leaderboard): retire l'exception coalition des chefs de piscine" \
  --body "Volet 1 du spec prep-lancement-reel. Revert de l'exception PISCINE_CHEFS (alpha-only). À MERGER + DÉPLOYER avant de lancer le reset (Volet 2). À la prochaine connexion, ludebarn/jturrel → House of Cores, sweinber → House of Processes."
```

---

## Task 3: Volet 2 — ignorer le dossier de backups

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Ajouter `backups/` au `.gitignore`**

Ajouter à la fin de `.gitignore` :

```
# Backups produits par scripts/reset-play-data.ts (jamais committés)
/backups/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore le dossier backups/ (dumps de reset)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Volet 2 — script `reset-play-data.ts`

**Files:**
- Create: `scripts/reset-play-data.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Créer le script**

Créer `scripts/reset-play-data.ts` avec exactement :

```typescript
// scripts/reset-play-data.ts
// OUTIL DEV — jamais importé par l'app. Remet la base en « ardoise vierge » pour
// le lancement réel : supprime tous les matchs (les paris tombent en cascade),
// remet tous les total_points à 0, et reclasse les 3 testeurs sur leur coalition
// de cursus (l'exception piscine ayant été retirée — cf. Volet 1).
//
// Dry-run par défaut : affiche les compteurs et ce qui SERAIT fait, sans rien
// modifier. Passer `-- --yes` pour exécuter réellement. Un backup JSON horodaté
// est écrit dans backups/ AVANT toute écriture.
//
// Crée son PROPRE client service_role (n'importe PAS @/lib/supabase/server ni
// rien de `server-only`). Path alias @ résolus par tsx.
//
// Usage : npm run reset-play-data            (dry-run)
//         npm run reset-play-data -- --yes   (exécution réelle)

import { mkdirSync, writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import ws from "ws";

import type { Database } from "@/lib/database.types";

// Reclassement cursus des testeurs (ft_id vérifiés via l'API 42, cf. spec).
// login → ft_id de la coalition de CURSUS. sweinber est déjà sur 193 (no-op réel).
const CURSUS_TARGET: Record<string, number> = {
  ludebarn: 191, // House of Cores
  jturrel: 191, // House of Cores
  sweinber: 193, // House of Processes
};

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as unknown as typeof WebSocket } },
);

async function counts() {
  const { count: matches } = await supabaseAdmin
    .from("matches")
    .select("*", { count: "exact", head: true });
  const { count: bets } = await supabaseAdmin
    .from("bets")
    .select("*", { count: "exact", head: true });
  const { data: pts } = await supabaseAdmin
    .from("users")
    .select("login, total_points")
    .gt("total_points", 0)
    .order("total_points", { ascending: false });
  return { matches: matches ?? 0, bets: bets ?? 0, usersWithPoints: pts ?? [] };
}

async function backup() {
  const [{ data: matches }, { data: bets }, { data: users }] = await Promise.all([
    supabaseAdmin.from("matches").select("*"),
    supabaseAdmin.from("bets").select("*"),
    supabaseAdmin.from("users").select("*"),
  ]);
  mkdirSync("backups", { recursive: true });
  const path = `backups/reset-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(path, JSON.stringify({ matches, bets, users }, null, 2));
  return path;
}

async function main() {
  const execute = process.argv.includes("--yes");

  const before = await counts();
  console.log("AVANT:", JSON.stringify(before, null, 2));

  if (!execute) {
    console.log("\n[DRY-RUN] Aucune modification. Avec --yes, le script ferait :");
    console.log(`  - delete from matches (${before.matches} matchs, ${before.bets} paris en cascade)`);
    console.log("  - update users set total_points = 0");
    console.log(`  - reclassement cursus : ${JSON.stringify(CURSUS_TARGET)}`);
    console.log("\nRelancer avec : npm run reset-play-data -- --yes");
    return;
  }

  const path = await backup();
  console.log(`\nBackup écrit : ${path}`);

  // 1. Supprimer tous les matchs ; les paris tombent en cascade.
  const { error: mErr } = await supabaseAdmin
    .from("matches")
    .delete()
    .not("id", "is", null);
  if (mErr) throw mErr;
  console.log("✓ matchs supprimés (paris en cascade)");

  // 2. Remettre tous les scores à 0.
  const { error: uErr } = await supabaseAdmin
    .from("users")
    .update({ total_points: 0 })
    .gt("total_points", 0);
  if (uErr) throw uErr;
  console.log("✓ total_points remis à 0");

  // 3. Reclasser les testeurs sur leur coalition de cursus.
  for (const [login, ftId] of Object.entries(CURSUS_TARGET)) {
    const { data: coal, error: cErr } = await supabaseAdmin
      .from("coalitions")
      .select("id, name")
      .eq("ft_id", ftId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!coal) {
      console.warn(`⚠️  coalition cursus ft_id=${ftId} introuvable — ${login} ignoré`);
      continue;
    }
    const { error: rErr } = await supabaseAdmin
      .from("users")
      .update({ coalition_id: coal.id })
      .eq("login", login);
    if (rErr) throw rErr;
    console.log(`✓ ${login} → ${coal.name} (cursus)`);
  }

  const after = await counts();
  console.log("\nAPRÈS:", JSON.stringify(after, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Enregistrer le script npm**

Dans `package.json`, après la ligne `"simulate-score": …`, ajouter (avec une virgule au bout de la ligne `simulate-score`) :

```json
    "reset-play-data": "node --env-file=.env.local --import tsx scripts/reset-play-data.ts"
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: 0 erreur.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: 0 erreur.

- [ ] **Step 5: Commit**

```bash
git add scripts/reset-play-data.ts package.json
git commit -m "chore(scripts): reset-play-data (wipe matchs/paris, scores 0, reclasse cursus)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Vérification (dry-run) + PR Volet 2

**Files:** aucun — vérification et PR.

- [ ] **Step 1: Dry-run contre la vraie base**

Run: `npm run reset-play-data`
Expected: affiche les compteurs AVANT (matches > 0, bets > 0, users avec points) et le bloc `[DRY-RUN]` listant les actions. **Aucune** écriture.

- [ ] **Step 2: Ouvrir la PR Volet 2 (+ docs)**

```bash
git push -u origin chore/prep-lancement-reel
gh pr create --base main --head chore/prep-lancement-reel \
  --title "chore: prép lancement réel — script reset-play-data + spec/plan" \
  --body "Volet 2 du spec prep-lancement-reel : script dev reset-play-data (dry-run + backup + --yes), .gitignore backups/, docs spec/plan. N'affecte pas l'app (script non importé). Le reset réel se lance manuellement APRÈS déploiement du Volet 1 et fin de l'alpha."
```

- [ ] **Step 3: (Opération manuelle, hors PR) Exécuter le reset le moment venu**

Pré-requis : Volet 1 mergé **et déployé**, alpha terminée.
Run: `npm run reset-play-data -- --yes`
Expected: backup écrit, matchs supprimés, paris en cascade, `total_points` à 0, `ludebarn`/`jturrel` → House of Cores, `sweinber` → House of Processes (no-op), compteurs APRÈS à 0.

---

## Self-Review (auteur du plan)

**Spec coverage :**
- Volet 1 retrait `PISCINE_CHEFS` + branche chef + param `login` → Task 1 ✅
- Volet 1 appelant `upsert-player` → Task 2 ✅
- Volet 1 tests nettoyés + gate + PR séparée → Tasks 1–2 ✅
- Volet 2 script dry-run/backup/--yes → Task 4 ✅
- Volet 2 delete matches (cascade) + total_points 0 + reclassement cursus → Task 4 ✅
- `.gitignore backups/` → Task 3 ✅
- npm `reset-play-data` → Task 4 ✅
- Ordre Volet 1 déployé avant Volet 2 → Branch strategy + Task 5 Step 3 ✅
- Repopulation WC hors scope → non couvert (intentionnel, spec B) ✅

**Placeholder scan :** aucun TBD/TODO ; tout le code est fourni en entier.

**Type consistency :** `pickUserCoalition(raw)` cohérent entre Task 1 (def) et Task 2 (appel) ; `CURSUS_TARGET: Record<string, number>` ; helpers `counts()` / `backup()` ; client `supabaseAdmin` typé `Database`. Cohérent avec les types existants (`simulate-score.ts`, `coalitions.ts`).
