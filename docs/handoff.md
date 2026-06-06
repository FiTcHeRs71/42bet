# Handoff / reprise de session — 42Bet

> Doc de **reprise de travail** (notamment pour changer de machine). Mis à jour à
> la fin d'une session. Dernière maj : **2026-06-06**.
>
> Pour le setup d'une nouvelle machine (clone, `.env.local`, plugins/skills
> Claude Code) → voir [`deploy.md`](./deploy.md) §1.
> Pour comprendre l'app (onboarding) → [`README.md`](./README.md) →
> [`architecture.md`](./architecture.md).

> ⚙️ **Changement de workflow (2026-06-06)** : le projet repasse **en binôme** →
> **flux PR obligatoire** réactivé (review + merge squash, plus de merge direct
> sur `main`). Cf. [`AGENTS.md`](../AGENTS.md) §8. Doc d'onboarding complétée :
> `architecture.md`, `api-42.md`, `football-data.md` ajoutés.

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

## 1bis. Pipeline matchs — ✅ LIVRÉ (2026-06-06, branche `feat/match-pipeline`)

**Le chaînon qui manquait** : il n'existait aucune ingestion des matchs. La table
`matches` ne contenait que le seed de dev factice ; le cron `sync-results` ne
fait que *scorer* des matchs déjà présents. On a donc construit l'ingestion réelle
des fixtures Coupe du Monde 2026 + un outil de test du scoring.

Spec : `docs/superpowers/specs/2026-06-06-match-pipeline-design.md` ·
Plan : `docs/superpowers/plans/2026-06-06-match-pipeline.md` (8 tâches).

Livré :
- `src/lib/match-sync.ts` (pur, testé) — `parseMatchesForUpsert` + `mapStatus`
  (inclut `AWARDED → finished`) + `formatStage`.
- `src/lib/football-data.ts` — `fetchWorldCupMatches()` renvoie le type fixture
  enrichi (`WorldCupMatchesResponse`).
- Migrations `0009_upsert_matches.sql` (RPC upsert idempotent, statut `finished`
  collant, scores jamais écrasés) + `0010_remove_dev_seed_matches.sql`.
  **Appliquées en DB** (`supabase db push`) + types régénérés.
- Route `GET /api/cron/sync-matches` (auth `CRON_SECRET`) + cron Vercel quotidien
  (`0 4 * * *`) dans `vercel.json`.
- `src/components/match-row.tsx` — écussons d'équipe (crests).
- `scripts/simulate-score.ts` + `npm run simulate-score -- <fdId> <h> <a>` :
  appelle le vrai RPC `score_match` pour tester l'attribution de points.

**Validé end-to-end** : ingestion `upserted: 104`, crests affichés, seed retiré,
auth 401 OK ; scoring testé sur 3 cas (exact=3, bon vainqueur=1, raté=0), total
correct, **idempotence** OK (`scored: 0` au 2ᵉ passage). 86 tests verts.

⚠️ **Note technique** : `scripts/simulate-score.ts` ajoute un workaround
WebSocket (`ws` + `realtime.transport`) car `@supabase/supabase-js` lève sur
**Node 20** sans WebSocket natif. Supprimable si passage à Node 22+.

---

## 2. Refonte UI glassy — ✅ LIVRÉE (branche `feat/ui-glassy`)

**Direction retenue** : style **glassy / épuré façon Apple**, sombre vibrant
(halos violet/cyan), avec **bottom-nav mobile** dédiée.

Les 10 tâches du plan `docs/superpowers/plans/2026-06-05-refonte-ui-glassy.md`
sont implémentées (présentation pure, aucun `src/lib/**` ni data touché) :
thème glassy (tokens `@theme`, dark forcé, classes `glass`/`glass-strong`),
`AppBackground` (halos), header glass sticky + `NavLink`, `BottomNav` mobile,
auth-button accent, pages `/matches` `/leaderboard` `/profile/[login]` en cartes
glass, home enrichie (hero + prochains matchs + top 3), passe polish
(`rise`, `prefers-reduced-motion`). Filet : **75 tests verts** + typecheck +
lint + build à chaque tâche. Résidus scaffold corrigés au passage
(`font-family: Arial` → Geist, `lang="en"` → `lang="fr"`).

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

1. **Feature B — pipeline coalitions** (spec séparé à écrire) : la table
   `coalitions` est **vide** et `upsert-player` n'écrit pas de coalition → badges
   /photos vides. À faire : fetch des coalitions depuis l'intra 42 (nom/couleur/
   image) + assignation de la coalition du joueur au login.
2. Régénérer `FT_API_SECRET` sur intra 42 (sécurité — partagé en clair) → `.env.local`.
3. Déploiement Vercel (env vars + **2 crons** : `sync-results` */5, `sync-matches`
   quotidien). ⚠️ Flux **PR réactivé dès maintenant** (binôme, cf. AGENTS §8) ;
   activer la **protection de branche `main`** sur GitHub (review requise).
4. ~~Enrichir la home `/`~~ ✓ fait dans la refonte UI.
5. ~~Ingestion des matchs CM + test scoring~~ ✓ fait (§1bis).
6. Bonus restant : notifications / feed d'activité.
