# Alpha 42Bet — Design (campus 47, Vercel, matchs amicaux)

> Spec issue d'un brainstorming le 2026-06-08. Source des conventions : `AGENTS.md`.

## Objectif

Mettre en ligne une **alpha** de 42Bet, **ouverte à tout le campus 42 Lausanne
(campus 47)**, déployée sur **Vercel**, pour valider le **flow complet de bout en
bout** (login OAuth 42 → pari → scoring → classement) sur les **matchs amicaux**
qui précèdent la Coupe du Monde.

But n°1 retenu : *valider le flow complet* avec de vraies personnes de 42, avant
le démarrage automatique de la Coupe du Monde.

## Décisions de cadrage

| Sujet | Décision |
|---|---|
| Accès | Tout compte dont le **campus principal = 47** (Lausanne). Les autres sont refusés au login. |
| Hébergement | Vercel, branche de prod = `main`. |
| Matchs de test | **Amicaux**, gérés manuellement (SQL d'insertion + `simulate-score` pour le résultat). |
| Ingestion auto | Le cron World Cup (`/competitions/WC/matches`) reste en place ; il tourne « dans le vide » jusqu'à la CM — inoffensif pour l'alpha. |

## Contexte technique vérifié (2026-06-08)

- `signIn` (`src/lib/auth/config.ts`) renvoie `true` sans aucun filtre de campus.
- `Ft42Me` (`src/lib/auth/profile.ts`) ne capture **pas** le campus. Or `/v2/me`
  (récupéré par NextAuth avec le token utilisateur) renvoie `campus_users[]`
  avec `campus_id` et `is_primary` → le gating ne nécessite **aucun appel API
  supplémentaire**.
- L'env var `FT_API_CAMPUS_ID` existe déjà et vaut `47`.
- `scripts/simulate-score.ts` appelle le **vrai** RPC `score_match` (persistance +
  idempotence réelles), crée son propre client `service_role`, et lit `.env.local`.
- `supabase/seed.sql` est **dev-only** (joué par `supabase db reset`, jamais en prod).
- `docs/deploy.md` §3 indique encore `FT_API_CAMPUS_ID=33` (erreur) → à corriger en `47`.

---

## Chantier A — Gating campus 47 (seul code à écrire)

Le module `profile.ts` reste **pur** (aucun I/O, aucun `server-only`).

1. Étendre l'interface `Ft42Me` :

   ```typescript
   export interface Ft42Me {
     id: number;
     login: string;
     image?: { link?: string | null } | null;
     campus_users?: Array<{ campus_id: number; is_primary: boolean }>;
   }
   ```

2. Ajouter une fonction pure `getPrimaryCampusId` :

   ```typescript
   /** Campus principal du compte 42 (is_primary), sinon le premier listé, sinon null. */
   export function getPrimaryCampusId(raw: Ft42Me): number | null {
     const list = raw.campus_users ?? [];
     if (list.length === 0) return null;
     const primary = list.find((c) => c.is_primary);
     return (primary ?? list[0]).campus_id;
   }
   ```

3. Dans le callback `signIn` (`src/lib/auth/config.ts`), filtrer **avant**
   `upsertPlayer` (ne pas créer d'utilisateur hors-47) :

   ```typescript
   async signIn({ profile }) {
     if (!profile) return false;
     const raw = profile as unknown as Ft42Me;
     if (getPrimaryCampusId(raw) !== Number(requireEnv("FT_API_CAMPUS_ID"))) {
       return false; // accès alpha réservé au campus 47 (Lausanne)
     }
     await upsertPlayer(mapFt42Profile(raw), upsertDeps);
     return true;
   }
   ```

**Effet :** NextAuth refuse l'accès à tout compte dont le campus principal ≠ 47.

**Tests (`tests/auth-profile.test.ts`, fichier existant) :** `getPrimaryCampusId` couvre
— campus principal présent (=47 et ≠47), pas de `is_primary` (fallback premier),
liste vide / champ absent (`null`).

**Hors scope :** pas de whitelist de logins, pas de code d'invitation, pas de
table d'autorisation — la simple appartenance au campus 47 suffit.

---

## Chantier B — Déploiement Vercel (config + runbook, pas de code)

Pré-requis : la PR `feat/coalitions-pipeline` est mergée sur `main` (prod = `main`),
puis cette branche `feat/alpha-launch` mergée à son tour.

1. **Projet Vercel** lié au repo, branche de production = `main`.
2. **Variables d'environnement** (scope Production) — toutes celles de
   `.env.local.example` :
   - `AUTH_SECRET` (`openssl rand -base64 32`)
   - `AUTH_URL` = URL de prod (ex. `https://42bet.vercel.app`)
   - `FT_API_UID`, `FT_API_SECRET`
   - `FT_API_CAMPUS_ID=47`
   - `FOOTBALL_DATA_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
   - `CRON_SECRET`
3. **OAuth intra 42** : ajouter la redirect URI
   `https://<prod>/api/auth/callback/42` sur l'application
   (https://profile.intra.42.fr/oauth/applications).
4. **Cron** : vérifier que `/api/cron/sync-results` (et `sync-matches`) refuse
   l'appel sans `CRON_SECRET` (`401`) — Vercel envoie `Authorization: Bearer <CRON_SECRET>`.
5. **DB prod** : confirmer que toutes les migrations `supabase/migrations/` sont
   appliquées au projet Supabase prod. Confirmer que `seed.sql` n'a **pas** été
   joué en prod (aucun login `test_*`).
6. **Doc** : corriger `docs/deploy.md` §3 (`FT_API_CAMPUS_ID` 33 → 47).
7. **Smoke test post-déploiement** : login OAuth 42 réel (compte 47 accepté,
   compte non-47 refusé), page `/leaderboard` accessible, cron répond `401` sans secret.

---

## Chantier C — Amicaux (runbook ops, pas de code)

Cycle par match amical :

1. **Créer le match** dans la table `matches` (SQL editor Supabase prod) :
   `football_data_id` unique (id réel football-data si dispo, sinon valeur
   convenue), `home_team`, `away_team`, `kickoff_at` (UTC), `status='scheduled'`.
2. **Paris** : les testeurs parient via l'UI existante avant le coup d'envoi
   (les paris se ferment au `kickoff_at` — comportement existant à re-vérifier).
3. **Scoring** après le vrai résultat :

   ```bash
   npm run simulate-score -- <footballDataId> <home> <away>
   ```

   lancé en local avec `.env.local` pointé sur la **DB prod** (donc
   `SUPABASE_SERVICE_ROLE_KEY` de prod présent localement). `score_match` passe le
   match en `finished`, note les paris non scorés, met à jour `users.total_points`.
   Idempotent : relancer ne double pas les points.

**Note de sécurité :** détenir le `service_role` prod dans un `.env.local` reste
réservé aux deux contributeurs ; ne jamais committer ce fichier (déjà gitignoré).

---

## Critères de succès de l'alpha

- Un étudiant 42 Lausanne se connecte via OAuth 42 en prod ; un compte hors-47 est refusé.
- Il voit les matchs amicaux, place des paris, ne peut plus parier après le coup d'envoi.
- Après saisie du résultat via `simulate-score`, ses points et le classement
  (individuel + par coalition) reflètent le résultat.
- Le cron est protégé (`401` sans `CRON_SECRET`).

## Hors scope (YAGNI)

- Page d'administration in-app (création de match / saisie de score).
- Formulaire de feedback, bannière « alpha ».
- Extension du sync football-data aux amicaux.
- Whitelist de logins / code d'invitation.
