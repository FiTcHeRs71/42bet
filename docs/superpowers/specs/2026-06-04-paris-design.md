# Spec — Brick « Système de paris »

> Date : 2026-06-04 · Statut : approuvé (design) · Brick MVP write-side au-dessus de `/matches`.

## 1. Objectif

Permettre à un·e étudiant·e 42 **authentifié·e** (NextAuth v5, provider 42) de
soumettre un pronostic de score (`home`/`away`) sur un match **à venir**, depuis
la page `/matches`, tant que le coup d'envoi (`kickoff_at`) n'est pas passé. Le
prono est **modifiable** jusqu'au kickoff (upsert). Après le kickoff il est figé ;
après la fin du match, les points gagnés (0/1/3) sont affichés à côté du score réel.

Le scoring lui-même est **déjà en place** (cron `sync-results` →
`score_match` SQL + `calcBetPoints` pur). Cette brick ne touche pas au scoring :
elle alimente la table `bets` côté écriture et expose la lecture privée des pronos
du joueur.

## 2. Hors périmètre (YAGNI)

- Pas de classement / leaderboard (brick séparée « Classement »).
- Pas de détail des points des autres joueurs.
- Pas de page dédiée `/matches/[id]` ni `/mes-paris` (UI **inline** sur `/matches`).
- **Aucune migration DB** : la table `bets` (migration 0004) est déjà prête,
  RLS default-deny, contrainte `unique (user_id, match_id)`.

## 3. Décisions de conception (issues du brainstorming)

| Sujet | Décision |
|---|---|
| Placement UI | **Inline** sur `/matches` (form dans `MatchRow`) |
| Modifiable | **Oui**, jusqu'au kickoff → upsert `(user_id, match_id)` |
| Cycle de vie | Prono figé après kickoff ; **prono + points** une fois terminé |
| Non connecté | Lien « Connecte-toi pour parier » (→ login 42) au lieu du form |
| Architecture | Approche A : server action mince + module **pur** `bet-rules.ts` |

## 4. Architecture & responsabilités

Décline le pattern existant (`points.ts` pur + `sync.ts` orchestrateur DI) :
logique métier **pure et testée** séparée de l'I/O et du framework (SRP, AGENTS.md §10).

| Fichier | Rôle | I/O |
|---|---|---|
| `src/lib/bet-rules.ts` | **Pur, testé** : `canPlaceBet`, `validateScore`, types | ❌ |
| `src/lib/bets.ts` | I/O privé via `supabaseAdmin` : `listMyBets`, `upsertBet` | ✅ |
| `src/lib/users.ts` (nouveau) | `resolveUserId(ftId)` : `ft_id` → `users.id` | ✅ |
| `src/app/matches/actions.ts` | server action `placeBet(formData)` : orchestration | ✅ |
| `src/components/bet-form.tsx` | `"use client"` : 2 inputs + submit, état via `useFormStatus` | — |
| `src/components/match-row.tsx` | modifié : choisit l'affichage selon état + session | — |
| `src/app/matches/page.tsx` | modifié : `auth()`, charge les pronos, passe une `Map` | — |

## 5. Règles pures — `bet-rules.ts`

```ts
type BetInput = { homeScore: number; awayScore: number };

/** Un pari est plaçable/modifiable ssi le match est programmé ET le kickoff est futur. */
function canPlaceBet(match: { status: MatchStatus; kickoff_at: string }, now: Date): boolean;
//  -> true  ssi match.status === "scheduled" && now < new Date(kickoff_at)
//  -> false pour tout autre statut (live/finished/postponed/cancelled) ou kickoff passé

/** Un score est valide ssi home et away sont des entiers, 0 <= n <= 99. */
function validateScore(homeScore: number, awayScore: number): boolean;
```

- Ces deux fonctions sont la **source de vérité** du lock et de la validation.
- Elles sont **toujours** ré-appliquées côté serveur dans la server action — le
  client ne fait que de l'UX (anti-triche : un POST tardif/forgé est rejeté serveur).
- Borne `<= 99` : garde anti-absurde, pas une règle métier forte.

## 6. Flux de la server action — `placeBet`

```
placeBet(formData)                              // "use server"
 ├─ session = await auth()
 │    └─ pas de session/ftId  → return { ok: false, reason: "unauth" }
 ├─ ftId = session.user.ftId
 ├─ { matchId, home, away } = parse(formData)   // Number(), garde NaN
 ├─ validateScore(home, away)                   // pur
 │    └─ false → return { ok: false, reason: "invalid" }
 ├─ userId = await resolveUserId(ftId)
 │    └─ introuvable → return { ok: false, reason: "no-user" }
 ├─ match = await getMatchForBet(matchId)       // kickoff_at + status
 │    └─ introuvable → return { ok: false, reason: "no-match" }
 ├─ canPlaceBet(match, new Date())              // pur
 │    └─ false → return { ok: false, reason: "locked" }
 ├─ await upsertBet({ userId, matchId, home, away })   // onConflict (user_id, match_id)
 ├─ revalidatePath("/matches")
 └─ return { ok: true }
```

Type de retour : `type PlaceBetResult = { ok: true } | { ok: false; reason: PlaceBetError }`
avec `PlaceBetError = "unauth" | "invalid" | "no-user" | "no-match" | "locked"`.

`getMatchForBet` peut être une lecture publique (client anon, `matches` est public-read)
ou via `supabaseAdmin` — au choix de l'implémentation ; le lock est de toute façon
re-vérifié sur les données fraîches de la DB.

## 7. Lecture des pronos du joueur — `page.tsx`

`/matches` reste un server component `force-dynamic`. Modifications :

1. `const session = await auth();`
2. Si connecté : `const myBets = await listMyBets(userId)` → `Map<matchId, Bet>`.
   - `listMyBets` lit via `supabaseAdmin` (RLS default-deny ; lecture privée
     **après** `auth()`), filtré sur `user_id = userId`.
3. Passe à chaque `MatchRow` : le `Match`, l'état d'affichage, le `Bet | undefined`
   du joueur, et un booléen `isAuthenticated`.

## 8. Affichage par état — `MatchRow` + `BetForm`

| État match (`displayState`) | Connecté | Non connecté |
|---|---|---|
| `upcoming` | `BetForm` (pré-rempli si prono existant) | lien « Connecte-toi pour parier » |
| `live` | prono figé (lecture seule) ou « aucun prono » | vue actuelle |
| `finished` | prono + **points (0/1/3)** à côté du score réel | vue actuelle |
| `postponed` / `cancelled` | badge état (pas de form) | badge état |

- `BetForm` (`"use client"`) : `<form action={placeBet}>`, 2 `<input type="number">`
  (home/away), bouton submit, `useFormStatus` pour l'état pending, affichage
  inline du `reason` en cas d'échec. Champ caché `matchId`.
- Les points proviennent de `bet.points_awarded` (déjà calculé par le cron) ; pas
  de recalcul côté UI (AGENTS.md §7).

## 9. Erreurs & sécurité

- La server action **ne throw pas vers l'UI** : retourne `{ ok, reason }`, le form
  affiche un message lisible par `reason`.
- **Double lock** : `canPlaceBet` serveur fait autorité. Cacher le form côté client
  est purement cosmétique ; un POST hors-délai est rejeté.
- `supabaseAdmin` est **server-only** (`import "server-only"`), jamais importé dans
  un composant `"use client"` (AGENTS.md §3/rule #3). `bet-form.tsx` n'importe que
  la server action `placeBet`, pas les modules I/O.
- RLS `bets` inchangée (default-deny). Aucun secret nouveau, aucune variable d'env.

## 10. Tests

`tests/bet-rules.test.ts` (Vitest, style `points.test.ts`) :

- `canPlaceBet` :
  - `scheduled` + kickoff futur → `true`
  - `scheduled` + kickoff passé → `false`
  - `scheduled` + kickoff == now (limite) → `false`
  - `live` / `finished` / `postponed` / `cancelled` → `false` (quel que soit kickoff)
- `validateScore` :
  - nominal `(2, 1)` → `true`
  - `(0, 0)` → `true`
  - négatif `(-1, 0)` → `false`
  - non-entier `(1.5, 0)` → `false`
  - hors borne `(100, 0)` → `false`

Convention repo : seules les fonctions **pures** sont testées unitairement ; l'I/O
et la server action ne le sont pas (cf. `sync.ts`).

## 11. Gates avant merge

`npm test` · `npm run typecheck` · `npm run lint` verts, puis merge `--no-ff` dans
`main` (phase pré-déploiement, AGENTS.md §8). Régénérer `database.types.ts` non
nécessaire (schéma `bets` inchangé).
