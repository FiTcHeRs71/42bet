# Handoff / reprise de session — 42Bet

> Doc de **reprise de travail** (notamment pour changer de machine). Mis à jour à
> la fin d'une session. Dernière maj : **2026-06-10**.
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

## 0. État courant — PRÉP LANCEMENT RÉEL (2026-06-10)

> Section de tête : l'état **vrai** aujourd'hui. Les sections numérotées plus bas
> (1, 1bis, 1ter…) sont l'historique des chantiers, conservé tel quel.

### 0a. Prép lancement réel — 2 PR ouvertes (2026-06-10)

Objectif : repartir d'une **base propre** pour la Coupe du Monde. Deux volets
indépendants, **PR ouvertes, pas encore mergées** (on s'en occupe plus tard).
Spec : `docs/superpowers/specs/2026-06-10-prep-lancement-reel-design.md` ·
Plan : `docs/superpowers/plans/2026-06-10-prep-lancement-reel.md`.

- **Volet 1 — retrait de l'exception coalition chefs de piscine**
  (branche `chore/remove-coalition-exception`, **PR #15**). Revert de la feature
  alpha-only `PISCINE_CHEFS` : `pickUserCoalition` ne prend plus de `login`, plus
  de branche chef, tests d'exception retirés des 2 suites. **À merger + déployer
  AVANT le reset** (sinon un re-login d'un chef le re-classerait sur sa piscine).
  À la prochaine connexion : `ludebarn`/`jturrel` → House of Cores,
  `sweinber` → House of Processes.
- **Volet 2 — script de reset + docs** (branche `chore/prep-lancement-reel`,
  **PR #16**). `scripts/reset-play-data.ts` (`npm run reset-play-data`) :
  **dry-run par défaut**, backup JSON horodaté dans `backups/` (gitignored),
  garde-fou `-- --yes`. Wipe `matches` (paris en cascade) + `total_points = 0` +
  reclassement cursus des 3 testeurs. N'affecte pas l'app (script non importé).
  Dry-run validé contre la prod : **107 matchs, 39 paris** détectés, 0 écriture.

**Reste à faire (manuel, dans l'ordre)** : (1) relire + merger **PR #15**, attendre
le **déploiement** ; (2) relire + merger **PR #16** ; (3) **à la fin de l'alpha**,
lancer `npm run reset-play-data -- --yes`.

### 0b. Lisibilité mobile leaderboard + chefs de piscine (PR #11–#14, mergées)

- **PR #11/#12** — ligne joueur lisible en mobile (badge coalition logo-seul,
  photo cliquable, badge responsive + cibles tactiles 44px).
- **PR #13/#14** — classement des **chefs de piscine** dans leur coalition de
  piscine (via le groupe coalition renvoyé par l'API, pas un `ft_id` en dur).
  ⚠️ **Exception en cours de retrait** par le Volet 1 ci-dessus (PR #15).

---

### État alpha déployée (2026-06-09) — toujours valable

- ✅ **Alpha déployée sur Vercel** depuis `main` (dernier commit `cbbe02f`,
  *chore: trigger prod redeploy*). Login réservé au campus **47** (Lausanne).
- ✅ **135 tests verts**, `typecheck` + `lint` propres. `main` vert, synchro
  `origin/main`.
- ✅ **Flux PR effectif** : PR #4 → #9 toutes mergées en **squash**. Plus de
  merge direct sur `main`.
- ✅ **Crons (plan Vercel Hobby)** : `sync-matches` sur cron Vercel (quotidien) ;
  `sync-results` **externalisé sur GitHub Actions** (`*/5`,
  `.github/workflows/cron-sync-results.yml`, secrets repo `PROD_URL` +
  `CRON_SECRET`). Cf. `architecture.md` §3c.
- ✅ **Leaderboard segmenté** (PR #8) : filtre **général / par camp
  (Students vs Piscineux) / par coalition** ; `buildCampStandings` +
  `buildCoalitionLeaderboard` purs ; camps dérivés via `coalitionGroupOf`
  (cursus 9 = Piscine → "Piscineux", reste → "Students"), sans colonne DB dédiée.
- ✅ **Rangs sur le profil** (PR #9, intégrée à #8 au merge) :
  `buildProfileRanks` (pur) + composant `RankLine` affichent le rang ordinal du
  joueur en **général / camp / coalition** sur `/profile/:login`.
- ✅ **`assignRanks` extrait** (rang standard 1,1,3 réutilisable) + **fix** : un
  rang périmé ne peut plus écraser le rang recalculé (régression couverte par un
  test).

**Reste à faire** : (1) vérifier les secrets Actions `PROD_URL`/`CRON_SECRET` en
prod et surveiller un tick `sync-results` réel ; (2) régénérer `FT_API_SECRET`
sur l'intra 42 ; (3) insérer/scorer les matchs amicaux à la main
(`docs/alpha-amicaux.md`) ; (4) bonus restant : notifications / feed d'activité.

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

## 1ter. Pipeline coalitions — ✅ LIVRÉ (2026-06-07, branche `feat/coalitions-pipeline`)

**Feature B du backlog (§4.1) close.** Les coalitions étaient synchronisées du
mauvais campus et la sélection multi-cursus était non déterministe. 5 changements
livrés et committés :

1. **Fix campus 47** — `FT_API_CAMPUS_ID` passait de `33` (Bangkok, Thaïlande !)
   à **`47`** (Lausanne, Renens). C'était la cause racine : les coalitions
   venaient du mauvais campus.
2. **Sélection déterministe** — `pickUserCoalition` (`src/lib/coalitions.ts`) ne
   prend plus `raw[0]` mais choisit par priorité de cursus statique
   `COALITION_CURSUS_PRIORITY` (**21 > 9 > 1**), départage par `ft_id` croissant,
   fallback première coalition si `ft_id` inconnu. Un étudiant Piscine+cursus est
   représenté par sa House de cursus 21 ; un piscineux actuel par son animal.
3. **Classement individuel sur `users.total_points`** — le tri individuel lit le
   `total_points` dénormalisé (maintenu par `score_match`) au lieu de re-sommer
   `bets.points_awarded`. Les paris ne pilotent plus que le compte de pronostics
   et la précision.
4. **Classement coalition : merge par `name` + couleur canonique** —
   `buildCoalitionLeaderboard` regroupe par `name` (les deux cursus d'une House
   fusionnent en une équipe), couleur/logo = ceux de la priorité de cursus la plus
   haute (cursus 21 gagne).
5. **Seed dev avec coalitions réelles de Lausanne** + joueurs factices
   multi-coalitions, pour tester la sélection déterministe et le merge.

Les 9 coalitions réelles (campus 47, vérifiées via
`GET /v2/blocs?filter[campus_id]=47` le 2026-06-07) = 6 équipes logiques sont
documentées dans [`api-42.md`](./api-42.md) §« Coalitions de Lausanne ».

> **Décision assumée** : `signIn` **reste bloquant** si l'upsert de la fiche
> `users` échoue (pas de session sans ligne `users`), tandis que l'assignation de
> coalition est **best-effort** (ne bloque jamais le login).

---

## 1quater. Alpha — ✅ CODE LIVRÉ (2026-06-08, branche `feat/alpha-launch`, PR #5)

Objectif : mettre 42Bet en ligne sur **Vercel** pour une **alpha ouverte au campus
42 Lausanne (47)**, et tester le flow complet (login → pari → scoring → classement)
sur les **matchs amicaux** qui précèdent la Coupe du Monde.

Spec : `docs/superpowers/specs/2026-06-08-alpha-launch-design.md` ·
Plan : `docs/superpowers/plans/2026-06-08-alpha-launch.md` (6 tâches).

Livré (seul chantier de code = le gating) :
- **Login réservé au campus 47** — `getPrimaryCampusId` (`src/lib/auth/profile.ts`,
  pur) lit le campus principal (`is_primary`, sinon premier, sinon `null`). Le
  callback `signIn` (`src/lib/auth/config.ts`) refuse (`return false`) tout compte
  dont le campus principal ≠ `ALPHA_CAMPUS_ID`, **avant** l'upsert (pas de fiche
  joueur hors campus).
- `ALPHA_CAMPUS_ID = Number(requireEnv("FT_API_CAMPUS_ID"))` hoisté au chargement
  du module + garde entier (mauvaise config = crash au démarrage, pas au login).
- Fix doc `deploy.md` : `FT_API_CAMPUS_ID = 47` (et non 33 = Bangkok).
- Runbooks : `deploy.md` §4 (premier déploiement Vercel) et nouveau
  `docs/alpha-amicaux.md` (insertion SQL d'un amical + `simulate-score`).

Décisions de cadrage : accès = **tout le campus 47** (pas de whitelist/invite) ;
amicaux gérés **à la main** (SQL + `simulate-score` pointé sur la prod), pas
d'extension du sync football-data ; cron World Cup laissé en place (tourne dans le
vide jusqu'à la CM, inoffensif).

Gates verts : **120 tests**, typecheck, lint, build.

> **Reste à faire (manuel, hors PR, après merge)** : créer le projet Vercel,
> coller les secrets en prod, ajouter la redirect URI OAuth `/api/auth/callback/42`
> sur l'intra 42, smoke test (compte 47 accepté / hors-47 refusé, cron → `401`).
> Voir `deploy.md` §4.

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

1. ~~**Feature B — pipeline coalitions**~~ ✓ fait (§1ter, branche
   `feat/coalitions-pipeline`) : campus 47, sélection déterministe, classements
   sur `total_points` + merge par `name`.
2. Régénérer `FT_API_SECRET` sur intra 42 (sécurité — partagé en clair) → `.env.local`.
3. Déploiement Vercel (env vars + **2 crons** : `sync-results` */5, `sync-matches`
   quotidien). ⚠️ Flux **PR réactivé dès maintenant** (binôme, cf. AGENTS §8) ;
   activer la **protection de branche `main`** sur GitHub (review requise).
4. ~~Enrichir la home `/`~~ ✓ fait dans la refonte UI.
5. ~~Ingestion des matchs CM + test scoring~~ ✓ fait (§1bis).
6. Bonus restant : notifications / feed d'activité.
