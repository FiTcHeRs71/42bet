# Logo de coalition dans le CoalitionBadge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher le logo de la coalition (`image_url`) sur un disque blanc à gauche du nom dans le `CoalitionBadge`, sans changer le reste du comportement.

**Architecture:** Modification mono-fichier d'un composant React purement présentatif. La donnée `image_url` existe déjà dans le type `Coalition` et circule de bout en bout — aucune I/O, requête ou type à toucher. Rendu conditionnel : logo seulement si `image_url` non nul. Le composant étant unique, la modif se propage aux 4 emplacements appelants.

**Tech Stack:** React 19, Next.js 16 (App Router), TypeScript strict, Tailwind v4.

**Spec de référence:** `docs/superpowers/specs/2026-06-07-coalition-badge-logo-design.md`

---

## Task 1: Rendu du logo dans `CoalitionBadge`

**Files:**
- Modify: `src/components/coalition-badge.tsx`

**Contexte fichier** — état actuel pertinent :

```tsx
type Coalition = { name: string; color: string; image_url: string | null };

const SIZE = {
  sm: "h-5 px-2 text-[10px]",
  md: "h-6 px-2.5 text-xs",
  lg: "h-7 px-3 text-sm",
} as const;
```

Le cas « coalition non nulle » rend aujourd'hui :

```tsx
  return (
    <span
      aria-label={coalition.name}
      style={{
        backgroundColor: coalition.color,
        color: readableTextColor(coalition.color),
      }}
      className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold ${SIZE[size]}`}
    >
      {coalition.name}
    </span>
  );
```

> Pas de test unitaire JSX : le projet ne teste que la logique pure (`readableTextColor`
> reste inchangé). La vérification se fait par typecheck/lint/build (Steps 4-7).

- [ ] **Step 1: Ajouter la map `LOGO_SIZE`**

Juste après la déclaration de `SIZE` dans `src/components/coalition-badge.tsx` :

```ts
const LOGO_SIZE = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;
```

- [ ] **Step 2: Ajouter `gap-1.5` au conteneur de la pastille colorée**

Remplacer la `className` du `<span>` du cas « coalition non nulle » :

```tsx
className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${SIZE[size]}`}
```

(seul ajout : `gap-1.5` après `items-center`).

- [ ] **Step 3: Insérer le rendu conditionnel du logo avant le nom**

Dans le même `<span>`, insérer **avant** `{coalition.name}` :

```tsx
      {coalition.image_url && (
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white ${LOGO_SIZE[size]}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coalition.image_url}
            alt=""
            className="h-full w-full rounded-full object-contain p-0.5"
          />
        </span>
      )}
      {coalition.name}
```

Le bloc final du cas non-null doit ressembler à :

```tsx
  return (
    <span
      aria-label={coalition.name}
      style={{
        backgroundColor: coalition.color,
        color: readableTextColor(coalition.color),
      }}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${SIZE[size]}`}
    >
      {coalition.image_url && (
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white ${LOGO_SIZE[size]}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coalition.image_url}
            alt=""
            className="h-full w-full rounded-full object-contain p-0.5"
          />
        </span>
      )}
      {coalition.name}
    </span>
  );
```

> Ne pas toucher au cas `coalition === null` (fallback gris `—`) ni à `readableTextColor`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS, aucune erreur.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS — pas d'erreur `@next/next/no-img-element` (le commentaire `eslint-disable-next-line` est présent), pas de variable inutilisée.

- [ ] **Step 6: Suite de tests (non-régression)**

Run: `npm test`
Expected: PASS — 108/108 (aucun test ne cible ce composant ; on vérifie l'absence de régression).

- [ ] **Step 7: Build production**

Run: `npm run build`
Expected: SUCCESS — les routes utilisant le badge (`/`, `/leaderboard`, `/profile/[login]`) compilent.

- [ ] **Step 8: Commit**

```bash
git add src/components/coalition-badge.tsx
git commit -m "feat(coalition): affiche le logo sur disque blanc dans le badge"
```

---

## Vérification manuelle (post-implémentation)

Après le commit, lancer `npm run dev` et ouvrir `/profile/<login>` (ou `/leaderboard`) :
- coalition avec logo → logo sur disque blanc à gauche du nom, lisible sur la pastille colorée ;
- coalition sans logo (`image_url` nul) → nom seul, identique à avant ;
- pas de coalition → pastille grise `—` inchangée.

Ne pas pousser ni ouvrir de PR : ce travail s'empile sur `feat/coalitions-pipeline` pour une PR groupée ultérieure.
