# Handoff / reprise de session — 42Bet

> Doc de **reprise de travail** (notamment pour changer de machine). Mis à jour à
> la fin d'une session. Dernière maj : **2026-06-05**.
>
> Pour le setup d'une nouvelle machine (clone, `.env.local`, plugins/skills
> Claude Code) → voir [`deploy.md`](./deploy.md) §1.

---

## 1. État du projet (au 2026-06-05)

- **MVP complet (5/5)** + **2 bonus livrés** : page profil `/profile/:login` et
  classement par coalition (section sur `/leaderboard`).
- **75 tests verts** (Vitest), `typecheck` + `lint` + `build` OK.
- `main` **poussé sur `origin`** — dernier commit `d6c356a` (docs). Tout est
  synchro : un `git pull` sur l'autre machine récupère tout.
- Pas encore déployé sur Vercel.

Dernières features mergées (toutes sur `main`, poussées) :

| Feature | Merge | Pure fn | I/O |
|---|---|---|---|
| Profil `/profile/:login` | `64f3b2e` | `buildProfileHistory` (`src/lib/profile.ts`) | `listBetsWithMatchByUser` (`bets.ts`) |
| Classement par coalition | `86f549d` | `buildCoalitionLeaderboard` (`src/lib/leaderboard.ts`) | — (réutilise `buildLeaderboard`) |

Specs/plans correspondants dans `docs/superpowers/specs/` et `.../plans/`
(marqués « ✅ LIVRÉ »).

---

## 2. En cours : refonte UI — **spec + plan écrits, prêts à exécuter**

**Direction retenue par l'utilisateur** : style **glassy / épuré façon Apple**,
avec un travail spécifique de la **vue mobile**.

➡️ **Reprise (sur l'autre ordi)** : `git pull`, puis exécuter le plan
`docs/superpowers/plans/2026-06-05-refonte-ui-glassy.md` (10 tâches, présentation
only). Skill recommandée : `superpowers:subagent-driven-development` (un
sous-agent par tâche) ou `superpowers:executing-plans` (inline). Spec de
référence : `docs/superpowers/specs/2026-06-05-refonte-ui-glassy-design.md`.

**Décisions de cadrage tranchées** : sombre vibrant (dark only) + halos
violet/cyan · thème global d'abord · bottom tab bar mobile (desktop = nav
horizontale) · animations « subtil & soigné » (`prefers-reduced-motion`) ·
archi thème = approche A (tokens `@theme` + classes glass, dark forcé via
`@custom-variant`). Aucune tâche ne touche `src/lib/**` ni la data.

**Skills à utiliser à l'implémentation** (installés comme plugins, cf. deploy.md §1) :
- `emil-design-eng` — polish UI, animations, détails invisibles (philosophie Emil Kowalski).
- `ui-ux-pro-max` — styles, palettes, font pairings, guidelines UX, responsive.

### Analyse de l'UI actuelle (point de départ de la refonte)

- `src/app/globals.css` : thème Tailwind v4 **minimal** — uniquement
  `--background` / `--foreground`, dark via `@media (prefers-color-scheme: dark)`.
  ⚠️ `body` force `font-family: Arial, Helvetica` alors que **Geist** est chargé
  dans `layout.tsx` (résidu du scaffold à corriger).
- `src/app/layout.tsx` : `<body>` = `min-h-full flex flex-col` + `<SiteHeader/>`.
  Geist Sans/Mono chargés en variables CSS.
- `src/components/site-header.tsx` : nav **horizontale** (logo + Matchs +
  Classement + AuthButton). Risque de **débordement sur mobile** — pas de menu
  responsive.
- `src/app/page.tsx` : home **placeholder** (titre + sous-titre + état session).
  À enrichir (matchs du jour + état des paris).
- Styling général : générique **zinc** + bordures `black/10` / `white/10`,
  `tabular-nums` sur les chiffres. Aucun effet glass, aucune palette custom.

### Pages/composants à retravailler

`/` (home), `/matches` (+ `match-row.tsx`, `bet-form.tsx`), `/leaderboard`
(+ section coalition + `coalition-badge.tsx`), `/profile/[login]`,
`site-header.tsx` (nav mobile), `globals.css` (thème glassy), `auth-button.tsx`.

---

## 3. Comment reprendre (sur l'autre machine)

1. `git pull` (tout est sur `origin/main`).
2. Setup machine si nécessaire (deploy.md §1) : `npm install`, `.env.local`,
   et **réinstaller les plugins Claude Code** (superpowers, etc.).
3. Relancer Claude Code dans le dossier et dire : *« on reprend le brainstorm UI
   (glassy/Apple + mobile) »*. Le brainstorm était à l'étape **questions de
   cadrage** (aucune question encore tranchée, pas de spec écrite).

### Questions de cadrage encore à trancher (prochaine étape brainstorm)

- Palette & ambiance précise (clair / sombre / les deux ? accent couleur ?).
- Périmètre : refonte **globale** (thème + toutes les pages) vs page par page.
- Mobile : nav (menu burger ? bottom-tab bar façon app ?) + cibles tactiles.
- Niveau d'animation (transitions de page, micro-interactions — cf. Emil).
- Contrainte : rester en Tailwind v4 + composants serveur existants (pas de
  refonte data, uniquement présentation).

---

## 4. Backlog post-UI (rappel)

1. Régénérer `FT_API_SECRET` sur intra 42 (sécurité — partagé en clair) → `.env.local`.
2. Déploiement Vercel (env vars + cron `sync-results`) ; réactiver PR + protection `main`.
3. Enrichir la home `/` (peut se faire DANS la refonte UI).
4. Bonus restant : notifications / feed d'activité.
