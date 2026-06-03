# Spec — Brique « Liste des matchs »

> Date : 2026-06-03 · Statut : approuvé, prêt pour plan d'implémentation
> Brique MVP : *Liste des matchs* (socle lecture seule de l'UI de paris)

## 1. Objectif

Afficher la liste des matchs de la Coupe du Monde sur une page publique en
lecture seule, regroupés par jour. C'est le socle visuel sur lequel s'appuiera
ensuite le système de paris.

Cette brique n'introduit **aucune écriture utilisateur** : lecture seule.

## 2. Contexte / découverte

- La table `public.matches` existe déjà (`0003_create_matches.sql`) avec RLS et
  une policy **public read** (`matches_select_public` pour `anon`,
  `authenticated`).
- **Découverte clé** : le cron de sync (`src/lib/sync.ts`) ne *crée jamais* de
  lignes dans `matches`. `loadMatchWithUnscoredBets()` renvoie `null` pour un
  match absent du calendrier et le sync `continue`. Aucun code n'insère
  actuellement de matchs → la table est vide.
- **Décision** : pour cette brique, on peuple via une **seed migration SQL**
  (option retenue par l'utilisateur). L'ingestion réelle depuis
  football-data.org (`importWorldCupFixtures()`) est une **brique séparée
  ultérieure**, hors périmètre ici.

## 3. Périmètre

### Inclus
1. Seed migration de fixtures d'exemple.
2. Fonction d'accès données (I/O pur) `listMatches()`.
3. Logique de présentation pure et testée (`displayState`, `groupByDay`).
4. Page `/matches` (server component) + composant `MatchRow` + empty state.
5. Lien « Matchs » dans le header.

### Hors-périmètre (YAGNI)
- Page détail d'un match.
- Filtres / recherche / pagination.
- Ingestion réelle depuis football-data.org.
- Crests (logos) d'équipes.
- Toute UI ou écriture de pari.

## 4. Composants

### 4.1 Seed — `supabase/migrations/0008_seed_matches.sql`
- ~6–8 fixtures WC d'exemple, **clairement marqués « seed dev »** en commentaire
  (à remplacer par l'ingestion réelle).
- Mix d'états pour exercer l'affichage, relatif à la date de référence
  2026-06-03 :
  - 2–3 matchs **finished** avec `home_score`/`away_score`, `kickoff_at` dans le
    passé ;
  - 3–4 matchs **scheduled** avec `kickoff_at` dans le futur.
- Insert idempotent : `on conflict (football_data_id) do nothing`.
- `football_data_id` : identifiants placeholder distincts (données de seed, pas
  d'appariement avec la vraie API).
- Pas de crest URLs (colonnes laissées `NULL`).

### 4.2 Accès données — `src/lib/matches.ts`
- `listMatches(): Promise<Match[]>`
- Utilise le client **anon** existant `supabaseBrowser`
  (`src/lib/supabase/browser.ts`) — RLS-respecting, jamais le service_role. Son
  commentaire prévoit déjà l'usage « matches ». Pas de garde `server-only`, donc
  importable depuis un server component.
- `select('*')` ordonné par `kickoff_at` ascendant.
- **SRP** : aucune logique métier/présentation ici, uniquement l'I/O. En cas
  d'erreur Supabase, lève (laisse remonter à la boundary Next).

### 4.3 Logique pure — `src/lib/match-view.ts`
Deux fonctions pures, **sans I/O**, testées (cf. §6) :

- `displayState(match: Match, now: Date): MatchDisplayState`
  où `MatchDisplayState = "upcoming" | "live" | "finished" | "postponed" | "cancelled"`.
  Dérivation depuis `match.status` + `match.kickoff_at` :
  - `status === "finished"` → `"finished"`
  - `status === "postponed"` → `"postponed"`
  - `status === "cancelled"` → `"cancelled"`
  - `status === "live"` → `"live"`
  - `status === "scheduled"` :
    - `now < kickoff_at` → `"upcoming"`
    - `now >= kickoff_at` → `"live"` (le coup d'envoi est passé mais le sync n'a
      pas encore basculé le statut ; on l'affiche comme en cours)
- `groupByDay(matches: Match[]): MatchDay[]`
  où `MatchDay = { day: string; matches: Match[] }` (`day` = clé jour locale,
  ex. `YYYY-MM-DD`). Jours triés chronologiquement ; matchs triés par
  `kickoff_at` dans chaque jour. Le regroupement suppose une entrée déjà triée
  mais ne doit pas en dépendre pour l'exactitude (re-trie défensivement).

### 4.4 UI

**Page** — `src/app/matches/page.tsx`
- Server component `async`.
- Appelle `listMatches()` → `groupByDay()` → rend une section par jour.
- En-tête de jour lisible en français (ex. « Mar. 11 juin »).
- **Empty state** si aucun match : message « Aucun match pour l'instant ».

**Composant** — `src/components/match-row.tsx`
- Affiche une ligne : heure du kickoff, `HOME - AWAY`, et :
  - si `finished` : score `HOME x-y AWAY` ;
  - sinon : badge d'état (« à venir » / « en cours » / « reporté » / « annulé »).
- Reçoit le `Match` + son `displayState` calculé (ou calcule via `displayState`
  avec un `now` fourni par la page pour rester déterministe).
- Texte uniquement (pas de crest en v1).

**Header** — `src/components/site-header.tsx`
- Ajouter un lien `next/link` « Matchs » vers `/matches`.

## 5. Flux de données

```
seed 0008 ──> public.matches
                   │ (anon, RLS public read)
                   ▼
            listMatches()  [I/O, src/lib/matches.ts]
                   │  Match[]
                   ▼
          groupByDay() / displayState()  [pur, src/lib/match-view.ts]
                   │  MatchDay[]
                   ▼
        /matches page  ──>  MatchRow[]   [src/app/matches]
```

## 6. Tests

`tests/` (Vitest), écrits **avant** l'implémentation (TDD) :

- `displayState` :
  - finished → `"finished"`
  - postponed → `"postponed"`, cancelled → `"cancelled"`, live → `"live"`
  - scheduled + `now < kickoff_at` → `"upcoming"`
  - scheduled + `now >= kickoff_at` → `"live"`
  - cas limite `now === kickoff_at` → `"live"`
- `groupByDay` :
  - liste vide → `[]`
  - plusieurs matchs même jour → un seul groupe, matchs triés par kickoff
  - matchs sur plusieurs jours → groupes triés chronologiquement
  - entrée désordonnée → sortie correctement triée (groupes + intra-jour)

Pas de test d'I/O sur `listMatches()` (couverture par l'exécution réelle ; la
logique testable est isolée dans `match-view.ts`).

## 7. Contraintes & vérifs

- **Aucune nouvelle variable d'environnement.**
- RLS déjà en place (public read existant) ; la seed n'ajoute pas de policy.
- Pas d'appel API 42 ni football-data dans cette brique.
- Conventions respectées : SOLID (SRP I/O vs pur), Next.js 16 App Router (server
  component, pas de `getServerSideProps`), pas de `useEffect` pour le fetch.
- Avant merge : `npm test` + `npm run typecheck` + `npm run lint` verts.
- Commits : conventional-commits.

## 8. Risques / notes

- Les `football_data_id` de seed sont des placeholders : si plus tard
  l'ingestion réelle insère les vrais matchs avec leurs propres ids, il faudra
  nettoyer/remplacer les lignes de seed (documenter au moment de l'ingestion).
- `supabaseBrowser` est un singleton sans garde `server-only` ; on l'utilise
  côté serveur en lecture publique. Si un jour on veut une séparation stricte,
  un client anon « server » dédié pourra être introduit — non nécessaire ici.
</content>
</invoke>
