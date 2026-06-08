# Alpha 42Bet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettre en ligne une alpha de 42Bet sur Vercel, réservée au campus 42 Lausanne (47), pour tester le flow complet (login → pari → scoring → classement) sur des matchs amicaux.

**Architecture:** Un seul chantier de code — filtrer le login OAuth sur le campus principal du compte 42, via une fonction pure `getPrimaryCampusId` branchée dans le callback `signIn` de NextAuth. Le reste est opérationnel : un runbook de déploiement Vercel (env vars + redirect OAuth + cron) et un runbook de gestion manuelle des amicaux (insertion SQL + `simulate-score` contre la prod).

**Tech Stack:** TypeScript strict, Vitest, NextAuth v5 (provider `42`), Next.js 16 (App Router), Supabase (RPC `score_match`), Vercel.

**Spec de référence :** `docs/superpowers/specs/2026-06-08-alpha-launch-design.md`

---

## Task 1 : `getPrimaryCampusId` — fonction pure de lecture du campus

**Files:**
- Modify: `src/lib/auth/profile.ts`
- Test: `tests/auth-profile.test.ts`

Le module `profile.ts` reste **pur** (aucun I/O, aucun import `server-only`).

- [ ] **Step 1: Écrire les tests qui échouent**

Modifier la ligne d'import en tête de `tests/auth-profile.test.ts` :

```typescript
import { mapFt42Profile, getPrimaryCampusId } from "@/lib/auth/profile";
```

Ajouter à la fin du fichier :

```typescript
describe("getPrimaryCampusId", () => {
  it("renvoie le campus marqué is_primary", () => {
    expect(
      getPrimaryCampusId({
        id: 1,
        login: "alice",
        campus_users: [
          { campus_id: 33, is_primary: false },
          { campus_id: 47, is_primary: true },
        ],
      }),
    ).toBe(47);
  });

  it("retombe sur le premier campus si aucun is_primary", () => {
    expect(
      getPrimaryCampusId({
        id: 2,
        login: "bob",
        campus_users: [
          { campus_id: 21, is_primary: false },
          { campus_id: 47, is_primary: false },
        ],
      }),
    ).toBe(21);
  });

  it("renvoie null si la liste est vide", () => {
    expect(getPrimaryCampusId({ id: 3, login: "carol", campus_users: [] })).toBeNull();
  });

  it("renvoie null si campus_users est absent", () => {
    expect(getPrimaryCampusId({ id: 4, login: "dave" })).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npm test -- auth-profile`
Expected: FAIL — `getPrimaryCampusId` n'est pas exporté.

- [ ] **Step 3: Étendre `Ft42Me` et implémenter `getPrimaryCampusId`**

Dans `src/lib/auth/profile.ts`, ajouter le champ `campus_users` à l'interface `Ft42Me` :

```typescript
/** Sous-ensemble utile de la réponse `GET /v2/me` de l'API 42. */
export interface Ft42Me {
  id: number;
  login: string;
  image?: { link?: string | null } | null;
  campus_users?: Array<{ campus_id: number; is_primary: boolean }>;
}
```

Ajouter la fonction pure après `mapFt42Profile` :

```typescript
/** Campus principal du compte 42 (is_primary), sinon le premier listé, sinon null. */
export function getPrimaryCampusId(raw: Ft42Me): number | null {
  const list = raw.campus_users ?? [];
  if (list.length === 0) return null;
  const primary = list.find((c) => c.is_primary);
  return (primary ?? list[0]).campus_id;
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npm test -- auth-profile`
Expected: PASS (anciens + nouveaux tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/profile.ts tests/auth-profile.test.ts
git commit -m "feat(auth): getPrimaryCampusId — lecture du campus principal 42"
```

---

## Task 2 : Brancher le filtre campus 47 dans `signIn`

**Files:**
- Modify: `src/lib/auth/config.ts`

`config.ts` est `server-only` et difficile à tester unitairement (NextAuth + supabase). On
s'appuie sur la fonction pure déjà testée (Task 1) ; la vérif ici est typecheck + lint, et
le smoke test réel à la Task 4.

- [ ] **Step 1: Importer `getPrimaryCampusId`**

Dans `src/lib/auth/config.ts`, modifier l'import depuis `@/lib/auth/profile` :

```typescript
import { mapFt42Profile, getPrimaryCampusId, type Ft42Me } from "@/lib/auth/profile";
```

- [ ] **Step 2: Filtrer le campus dans le callback `signIn`**

Remplacer le callback `signIn` existant par :

```typescript
    async signIn({ profile }) {
      if (!profile) return false;
      const raw = profile as unknown as Ft42Me;
      // Alpha : accès réservé au campus 42 Lausanne (47). Filtre AVANT l'upsert
      // pour ne pas créer de fiche joueur hors campus.
      if (getPrimaryCampusId(raw) !== Number(requireEnv("FT_API_CAMPUS_ID"))) {
        return false;
      }
      await upsertPlayer(mapFt42Profile(raw), upsertDeps);
      return true;
    },
```

> Note : `requireEnv` est déjà importé dans ce fichier. `FT_API_CAMPUS_ID` vaut `47`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/config.ts
git commit -m "feat(auth): login alpha réservé au campus 47 (Lausanne)"
```

---

## Task 3 : Corriger la doc deploy (campus 33 → 47)

**Files:**
- Modify: `docs/deploy.md`

- [ ] **Step 1: Corriger la ligne du tableau §3**

Dans `docs/deploy.md`, remplacer la ligne :

```
| `FT_API_CAMPUS_ID` | server | `33` (Lausanne) |
```

par :

```
| `FT_API_CAMPUS_ID` | server | `47` (Lausanne — Renens). 33 = Bangkok, ne pas confondre. |
```

- [ ] **Step 2: Vérifier qu'aucun autre `33` campus ne traîne dans la doc**

Run: `grep -rn "33" docs/ | grep -i campus`
Expected: aucune sortie.

- [ ] **Step 3: Commit**

```bash
git add docs/deploy.md
git commit -m "docs(deploy): FT_API_CAMPUS_ID = 47 (Lausanne), pas 33"
```

---

## Task 4 : Runbook de déploiement Vercel

**Files:**
- Modify: `docs/deploy.md`

Cette tâche **documente et exécute** le premier déploiement. Les étapes Vercel/intra se font
hors-repo (interface web) ; on consigne la procédure dans `docs/deploy.md` pour qu'elle soit
rejouable, puis on la suit.

> Pré-requis : la PR `feat/coalitions-pipeline` ET cette branche `feat/alpha-launch` sont
> mergées sur `main` (la prod Vercel suit `main`).

- [ ] **Step 1: Ajouter la section déploiement dans `docs/deploy.md`**

Ajouter à la fin de `docs/deploy.md` :

```markdown
---

## 4. Premier déploiement Vercel (alpha)

Prod = branche `main`. Toute modif passe par PR mergée avant de partir en prod.

### 4.1 Projet Vercel
1. Importer le repo `FiTcHeRs71/42bet` dans Vercel (framework détecté : Next.js).
2. Production Branch = `main`.

### 4.2 Variables d'environnement (scope **Production**)
Reprendre toutes les clés de `.env.local.example` :

| Variable | Valeur |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` (nouvelle valeur prod) |
| `AUTH_URL` | URL de prod, ex. `https://42bet.vercel.app` |
| `FT_API_UID` / `FT_API_SECRET` | App OAuth intra 42 |
| `FT_API_CAMPUS_ID` | `47` |
| `FOOTBALL_DATA_API_KEY` | clé football-data.org |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase prod |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé publishable Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | clé secret Supabase (server-only) |
| `CRON_SECRET` | `openssl rand -base64 32` |

### 4.3 OAuth intra 42
Sur https://profile.intra.42.fr/oauth/applications, ajouter la redirect URI :
`https://<prod>/api/auth/callback/42` (garder aussi celle de localhost pour le dev).

### 4.4 Cron Vercel
`vercel.json` déclare déjà les crons. Vercel envoie `Authorization: Bearer <CRON_SECRET>`.
Rien à configurer côté Vercel hormis la variable `CRON_SECRET`.

### 4.5 Smoke test post-déploiement
- Login OAuth avec un compte campus 47 → accès accordé.
- Login avec un compte hors-47 → accès refusé (retour à la page de login).
- `/leaderboard` s'affiche.
- `curl -s -o /dev/null -w "%{http_code}" https://<prod>/api/cron/sync-results` → `401`.
```

- [ ] **Step 2: Exécuter le déploiement en suivant la section 4**

Suivre 4.1 → 4.4 dans l'interface Vercel + intra 42. (Étapes manuelles hors-repo.)
Expected: build Vercel vert, URL de prod accessible.

- [ ] **Step 3: Vérifier la protection du cron en prod**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://<prod>/api/cron/sync-results`
Expected: `401`.

- [ ] **Step 4: Vérifier le gating campus (smoke test)**

Suivre 4.5 : un compte 47 entre, un compte hors-47 est refusé.
Expected: comportement conforme.

- [ ] **Step 5: Commit**

```bash
git add docs/deploy.md
git commit -m "docs(deploy): runbook premier déploiement Vercel (alpha)"
```

---

## Task 5 : Runbook des matchs amicaux

**Files:**
- Create: `docs/alpha-amicaux.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Créer `docs/alpha-amicaux.md`**

```markdown
# Runbook — Matchs amicaux (alpha)

Les amicaux ne sont pas couverts par le sync football-data (cron World Cup
uniquement). On les gère **à la main** pendant l'alpha. Procédure par match.

## 1. Créer le match (SQL editor Supabase prod)

```sql
insert into public.matches
  (football_data_id, home_team, away_team, kickoff_at, status)
values
  (<fd_id_unique>, '<Domicile>', '<Extérieur>', '<YYYY-MM-DDTHH:MM:SSZ>', 'scheduled');
```

- `football_data_id` : id réel football-data si dispo, sinon une valeur convenue
  et unique (sert de clé pour `simulate-score`).
- `kickoff_at` en UTC : les paris se ferment automatiquement à cette heure.

## 2. Phase de paris

Les testeurs parient via l'UI. Aucun geste côté admin.

## 3. Scoring après le résultat réel

Depuis une machine de dev, avec `.env.local` **pointé sur la DB prod**
(`SUPABASE_SERVICE_ROLE_KEY` de prod) :

```bash
npm run simulate-score -- <football_data_id> <home> <away>
```

`score_match` passe le match en `finished`, note les paris non scorés et met à
jour `users.total_points`. Idempotent : relancer ne double pas les points.

> ⚠️ Sécurité : le `service_role` prod ne vit que dans `.env.local` (gitignoré),
> réservé aux deux contributeurs. Ne jamais le committer ni l'exposer côté client.
```

- [ ] **Step 2: Référencer le runbook dans `docs/README.md`**

Dans `docs/README.md`, ajouter à la liste des docs une ligne pointant vers le runbook :

```markdown
- Runbook matchs amicaux (alpha) → `alpha-amicaux.md`
```

> Note : adapter le libellé/format au style de liste déjà présent dans `docs/README.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/alpha-amicaux.md docs/README.md
git commit -m "docs: runbook matchs amicaux (insertion SQL + simulate-score)"
```

---

## Task 6 : Vérification finale (gates)

**Files:** aucun (validation seule)

- [ ] **Step 1: Suite de tests complète**

Run: `npm test`
Expected: tous verts (aucune régression ; les tests campus passent).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: aucune erreur.

- [ ] **Step 4: Build production**

Run: `npm run build`
Expected: build réussi.

---

## Self-review (validée avant exécution)

- **Couverture spec** : Chantier A → Tasks 1-2 (`getPrimaryCampusId` + `signIn`) ; fix doc campus → Task 3 ; Chantier B (Vercel) → Task 4 ; Chantier C (amicaux) → Task 5 ; gates → Task 6. ✅
- **Pas de placeholder** : tout le code est explicite ; les seules étapes manuelles (interface Vercel/intra) sont des actions hors-repo clairement décrites. ✅
- **Cohérence des types** : `Ft42Me` étendu en Task 1 et réutilisé en Task 2 ; `getPrimaryCampusId` signature identique partout ; `requireEnv("FT_API_CAMPUS_ID")` déjà importé dans `config.ts`. ✅
- **Dépendance d'ordre** : Task 4 (déploiement) suppose `main` à jour → PR coalitions + PR alpha mergées d'abord. Tasks 1-3, 5 sont indépendantes du déploiement. ✅
```
