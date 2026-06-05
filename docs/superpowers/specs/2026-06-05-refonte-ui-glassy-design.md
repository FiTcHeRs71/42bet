# Spec — Refonte UI glassy (sombre vibrant, façon Apple) — 42Bet

> Design validé le 2026-06-05. Brainstorm mené avec compagnon visuel.
> Périmètre : **présentation uniquement** — la couche data et la logique métier
> (fonctions pures testées) restent **intactes**.

## 1. Objectif

Refondre l'interface de 42Bet dans un style **glassy / épuré façon Apple**,
**sombre vibrant** avec halos violet/cyan (esprit coalitions 42), avec un vrai
travail de la **vue mobile** (bottom tab bar). Niveau d'animation **subtil et
soigné**, `prefers-reduced-motion` respecté.

Décisions de cadrage (toutes tranchées) :

| Sujet | Décision |
|---|---|
| Ambiance / palette | Sombre vibrant (dark **only**), halos violet/cyan |
| Périmètre | Thème global d'abord, puis page par page |
| Nav mobile | Bottom tab bar (Matchs / Classement / Profil) ; desktop = nav horizontale |
| Animations | Subtil & soigné (CSS pur), `prefers-reduced-motion` honoré |
| Architecture thème | **Approche A** : tokens `@theme` + classes glass dans `globals.css` |
| Contrainte | Présentation only — server components et data inchangés |

Skills d'implémentation : `emil-design-eng` (polish, micro-interactions),
`ui-ux-pro-max` (palettes, responsive, guidelines).

## 2. Architecture du thème (fondation)

Tout dans `src/app/globals.css` (Tailwind v4, pas de `tailwind.config.js`).

### 2.1 Tokens — `@theme inline`

- Couleurs : `--background` ≈ `#0b0b16`, surface ≈ `#15151f`, `--foreground`
  clair (`#ededed`-ish).
- Accent **violet** (dégradé pour les actions, base ≈ `#7c3aed` → `#6d28d9`),
  **cyan** secondaire (≈ `#06b6d4`), **succès/points** vert (≈ `#34d399`).
- Geist : `--font-sans` / `--font-mono` (déjà chargés dans `layout.tsx`).
- Rayons (16px cartes), profondeur de blur (≈ 18px), couleurs de bordure
  (`white/10`).

### 2.2 Dark forcé

- `<html class="dark">` dans `layout.tsx`.
- `@custom-variant dark (&:where(.dark, .dark *))` dans `globals.css` → **toutes
  les variantes `dark:` existantes restent actives** sans réécrire la logique des
  composants.
- **Supprimer** le bloc `@media (prefers-color-scheme: dark)` et le résidu
  `body { font-family: Arial, Helvetica }` (passer à Geist via `--font-sans`).

### 2.3 Classes glass — `@layer components`

- `.glass` : surface translucide (`background: rgba(255,255,255,0.055)`,
  `border: 1px solid rgba(255,255,255,0.11)`, `backdrop-filter: blur(18px)`,
  rayon 16px). Fallback sans `backdrop-filter` (opacité plus élevée).
- `.glass-strong` : variante pour les barres de navigation (blur plus marqué,
  fond plus opaque).
- `.halo-bg` : helper pour les halos d'ambiance (utilisé par `AppBackground`).

**Critère de réussite §2** : le thème compile, le dark s'applique partout sans
toucher au JSX des composants existants, aucune trace de `prefers-color-scheme`
ni d'`Arial`.

## 3. Layout & navigation

### 3.1 `AppBackground` (nouveau, server-safe)

- Composant sans état, rendu une fois dans `layout.tsx`.
- Pose les halos violet/cyan en `fixed inset-0 -z-10 pointer-events-none`.
- Statique (aucun JS, aucun `"use client"`).

### 3.2 `layout.tsx`

- `<html lang="..." class="dark ...">`.
- `<body class="min-h-full flex flex-col">` + `<AppBackground />` avant le contenu.
- `padding-bottom` mobile pour ne pas masquer la `BottomNav` (et `safe-area`).

### 3.3 Desktop — `site-header.tsx`

- Reste sémantiquement la nav horizontale, re-stylée en barre `glass-strong`
  **`sticky top-0 z-40`**.
- État actif de l'onglet courant (soulignement/halo accent) via un petit
  composant client **`NavLink`** (utilise `usePathname` uniquement — **aucune
  donnée**). Le `SiteHeader` lui-même reste server component.
- Visible `≥ md` ; la `BottomNav` prend le relais `< md`.

### 3.4 Mobile — `BottomNav` (nouveau, `"use client"`)

- Barre d'onglets `glass-strong` `fixed bottom-0`, visible `< md`.
- 3 entrées : **Matchs** (`/matches`), **Classement** (`/leaderboard`),
  **Profil**.
  - Profil → `/profile/<login>` si connecté ; **si déconnecté → déclenche la
    connexion 42** (server action `signIn("42")`, même mécanisme qu'ailleurs).
    Le `login` est passé en prop depuis un parent server (pas de fetch client).
- Icône + label par onglet, **cible tactile ≥ 44px**, état actif via
  `usePathname`, `padding-bottom: env(safe-area-inset-bottom)`.
- N'importe que `usePathname` (+ éventuellement une server action passée en
  prop) — **jamais** Supabase ni API 42.

### 3.5 `auth-button.tsx`

- Bouton « Se connecter avec 42 » re-stylé en **accent dégradé violet**.
- Connecté : avatar + login ; déconnexion en lien discret, **conservée dans le
  header** (pas dans la BottomNav, pour rester épuré).

**Critère de réussite §3** : nav horizontale desktop avec onglet actif, bottom
tab bar mobile fonctionnelle et pouce-friendly, halos visibles derrière le
contenu, aucun import data dans un composant client.

## 4. Pages (présentation only)

Toutes restent **server components** et réutilisent les fonctions data
existantes — **aucune nouvelle requête métier inventée**.

### 4.1 `/` (home — `page.tsx`)

- Aujourd'hui placeholder. Enrichissement (backlog #3) :
  - Hero glass compact : titre + pitch + CTA connexion (ou « salut `login` »).
  - Carte glass « Tes prochains matchs à parier » (réutilise `listMatches` +
    logique d'état `match-view`).
  - Carte glass « Aperçu classement » : top 3 (réutilise `buildLeaderboard`).
- Reste server component ; pas de nouvelle source de données.

### 4.2 `/matches` (`matches/page.tsx` + `match-row.tsx` + `bet-form.tsx`)

- Les `<ul>` bordés → **cartes glass groupées par jour**.
- `match-row.tsx` : équipes, score central `tabular-nums`, `BetCell` **garde ses
  4 états** (`upcoming` / `live` / `finished` / `postponed|cancelled`) — habillé :
  prono en **pill violette**, `+points` en **vert**, « Parier » en bouton accent.
  Cibles tactiles agrandies en mobile.
- `bet-form.tsx` : inputs score en style glass (fond translucide, **focus ring
  accent**), submit accent, message inline « Enregistré ✓ » discret. **Logique
  server-action inchangée**.

### 4.3 `/leaderboard` (`leaderboard/page.tsx`)

- Sections « Par coalition » et « Individuel » en **cartes glass**.
- Lignes : rang, avatar, `CoalitionBadge` (couleur DB inchangée), stats
  (`tabular-nums`). En-têtes de colonnes conservés.
- Léger traitement accent sur le rang du podium (1-2-3).

### 4.4 `/profile/[login]` (`profile/[login]/page.tsx`)

- En-tête avatar + login + `CoalitionBadge` sur panneau glass.
- Les 4 `Stat` → **cartes glass** (extraction possible d'un `StatCard` à la
  hybride si ça clarifie le JSX).
- Timeline d'historique en lignes glass ; pastilles d'`outcome`
  (exact/bon/raté/attente) **gardent leurs couleurs sémantiques**, ajustées pour
  le fond sombre.

### 4.5 `coalition-badge.tsx`

- Inchangé fonctionnellement (skill `coalition-badge`). `readableTextColor`
  conservé. On vérifie seulement qu'il ressort bien sur verre sombre.

**Critère de réussite §4** : les 4 pages rendues en glass sombre, contenu et
états identiques à l'actuel, aucune régression de logique.

## 5. Animations & accessibilité (« subtil & soigné »)

- Micro-interactions : hover/press cartes & boutons (élévation légère + `scale`
  ~0.98 au press), **focus-ring accent** visible au clavier, transition douce des
  couleurs de lien. Durées ~150-200ms, easing naturel.
- Apparition : cartes en léger fondu + translation, échelonnées par liste — **CSS
  pur**, pas de lib.
- `@media (prefers-reduced-motion: reduce)` neutralise transforms/transitions.
- Contraste texte sur verre sombre visé **WCAG AA**.
- **Écarté** (niveau « expressif ») : View Transitions, animation de score/points.

## 6. Tests & vérification

- **Présentation pure** → les **75 tests Vitest** existants restent verts **sans
  modification** (filet anti-régression sur la logique métier).
- Pas de nouveau test unitaire (rien d'unitairement testable dans du style).
- Vérif manuelle : 4 pages en dark, responsive desktop (`≥ md`) + mobile
  (BottomNav, `< md`), `prefers-reduced-motion`.
- Avant merge (AGENTS.md §6) : `npm test` + `npm run typecheck` +
  `npm run lint` + `npm run build` **verts**.

## 7. Garde-fous (non-négociables respectés)

- Aucun import Supabase / API 42 dans un composant `"use client"`
  (`NavLink`, `BottomNav`, `BetForm` ne touchent que `usePathname` /
  server-actions).
- Tailwind v4 `@theme` — **pas** de `tailwind.config.js`.
- Aucun secret introduit, `.env.local.example` inchangé.
- Calcul des points (`src/lib/points.ts`) et toute la logique métier **non
  touchés**.
- SOLID : nouveaux composants à responsabilité unique, props limitées.

## 8. Hors-périmètre (YAGNI)

- Thème clair / bascule de thème (dark only assumé).
- Refonte de la couche data, nouvelles requêtes, nouveaux endpoints.
- Notifications / feed d'activité (backlog post-UI #4).
- Déploiement Vercel (backlog #2).
