---
name: solid-principles
description: Application concrète des principes SOLID dans 42Bet — adapté à TypeScript / React / Next.js, avec exemples du projet et anti-patterns spécifiques (composants god, lib qui touche la DB, props booléens qui multiplient les modes…)
---

# Skill : principes SOLID dans 42Bet

## Pourquoi

SOLID = 5 règles de design pensées pour limiter la dette dès qu'on est plus d'un dev. Dans un projet à deux (Personne A back, Personne B front), c'est notre meilleur outil pour qu'on ne se marche pas dessus et que le code reste compréhensible par l'autre.

On les applique **adaptés à l'écosystème TS/React** — pas comme dans un cours de Java.

## Les 5 principes — interprétation 42Bet

### S — Single Responsibility

> Une fonction / un composant / un module fait **une seule chose** et a **une seule raison de changer**.

**Application concrète** :
- `src/lib/points.ts` calcule des points. Point. Pas de fetch, pas de DB, pas de `console.log`. Voir [[bet-points-calc]].
- `src/lib/api-42.ts` parle à l'API 42. Pas de logique métier 42Bet dedans.
- Un composant React = une responsabilité visuelle. `BetCard` affiche un pari, ne contient pas la logique de soumission (déléguée à un hook ou un parent).
- Une route API = une opération (`POST /api/bets` crée un pari, c'est tout).

**Test mental** : si tu dois mettre un "et" dans la description de ta fonction/composant, c'est probablement deux responsabilités.

✅ `calcBetPoints(bet, result)` — calcule les points d'un pari
❌ `submitBetAndRecalculate(userId, matchId, scores)` — deux verbes, deux jobs

### O — Open/Closed

> Ouvert à l'extension, fermé à la modification. On étend par **composition**, pas en patchant des composants existants.

**Application concrète** :
- Pour varier l'apparence d'un composant : `children`, `className`, slots — pas un boolean `compact` qui ajoute une variante dans son corps.
- Pour étendre un hook : créer un hook qui le compose, pas modifier le hook original.
- Cf. skill globale [[vercel-composition-patterns]] (installée dans `~/.agents/skills/`) pour les patterns de composition React 19.

✅
```tsx
<MatchCard match={m}>
  <BetForm matchId={m.id} />
</MatchCard>
```

❌
```tsx
<MatchCard
  match={m}
  showBetForm
  betFormCompact
  isLocked
  showLockReason
  hideScoreUntilFinished
/>
```
→ Ajouter un mode = modifier le composant = on viole OCP.

### L — Liskov Substitution

> Un sous-type doit pouvoir remplacer son parent sans casser le contrat.

**Application concrète en TS** :
- Si tu utilises l'héritage de types (`extends`) ou les intersections (`&`), le sous-type ne doit **rien retirer** du contrat parent et ne doit pas changer la sémantique.
- Pour les **unions discriminées** (très utiles dans 42Bet, ex. `Match` avec status `'pending' | 'live' | 'finished'`) : chaque variant doit avoir les champs cohérents avec son discriminant.
- Une fonction qui prend `(m: Match)` doit fonctionner pour **n'importe quel** status — sinon resserrer le type d'entrée.

✅
```ts
type Match =
  | { status: "pending"; kickoffAt: Date; homeTeam: string; awayTeam: string }
  | { status: "live"; kickoffAt: Date; homeTeam: string; awayTeam: string; homeScore: number; awayScore: number }
  | { status: "finished"; kickoffAt: Date; homeTeam: string; awayTeam: string; homeScore: number; awayScore: number };

function displayScore(m: Match): string {
  if (m.status === "pending") return "vs";
  return `${m.homeScore} - ${m.awayScore}`;
}
```

❌ Un `Match` avec `homeScore?: number | null` partout, et chaque fonction se demande quoi faire des nulls.

### I — Interface Segregation

> Mieux vaut **plusieurs petits types/props** que des god objects qu'on accepte "au cas où".

**Application concrète** :
- Un composant qui ne lit que `user.login` et `user.coalition` ne doit **pas** prendre `user: User` complet — ça force ses tests à fabriquer un User entier et lie inutilement le composant à sa source.
- Pour `CoalitionBadge` (cf. skill [[coalition-badge]]), on prend `coalition: Coalition | null`, **pas** un `user: User` complet.
- Pour les fonctions, splitter `(opts: BigOptions)` en plusieurs paramètres typés si elles n'utilisent qu'un sous-ensemble.

✅
```tsx
type LeaderboardRowProps = {
  login: string;
  avatarUrl: string;
  coalition: Coalition | null;
  points: number;
  rank: number;
};
```

❌
```tsx
type LeaderboardRowProps = {
  user: User;        // contient login, avatar, coalition, mais aussi tout son historique de paris, son email, etc.
  rank: number;
};
```

### D — Dependency Inversion

> Les composants/fonctions de haut niveau dépendent **d'abstractions** (types, interfaces, props), pas d'implémentations concrètes.

**Application concrète dans Next.js + Supabase** :
- Les **composants React ne doivent jamais importer directement** `src/lib/supabase/server.ts` ou `src/lib/api-42.ts`. Ils reçoivent les données via props (passées par un server component parent ou une server action).
- Un server component fait l'I/O et passe à un client component une prop déjà typée.
- Le calcul des points (`points.ts`) reçoit ses entrées en arguments, ne va pas les chercher.
- Les wrappers `fetch42()` et le client Supabase sont des **abstractions** : si on change de fournisseur, on change un endroit.

✅
```tsx
// Server component
import { listMatches } from "@/lib/matches";
import { MatchList } from "@/components/MatchList";

export default async function Page() {
  const matches = await listMatches();
  return <MatchList matches={matches} />;
}

// Client component pur
"use client";
export function MatchList({ matches }: { matches: Match[] }) {
  // pas de fetch, pas de supabase ici
}
```

❌
```tsx
"use client";
import { createBrowserClient } from "@supabase/ssr"; // ← UI couplée à Supabase
export function MatchList() {
  const supabase = createBrowserClient(...);
  const [matches, setMatches] = useState(...);
  // ...
}
```

## Anti-patterns spécifiques à 42Bet — à refuser

| Anti-pattern | Principe violé | Correction |
|---|---|---|
| `BetCard` qui fait fetch + affichage + soumission | SRP | Découper en `BetCardView` + hook `useBetSubmit` + parent qui orchestre |
| `MatchCard` avec 12 props booléens | OCP / ISP | Variants typés ou composition via `children` |
| `points.ts` qui importe Supabase | SRP / DIP | Garder `points.ts` pur, l'orchestration est dans la route API |
| Composant client qui importe `lib/api-42.ts` | DIP / [[42api-fetch]] | Server component fetch → passe props |
| Hook `useEverything()` qui retourne 15 valeurs | ISP | Découper en hooks ciblés |
| Type `Match` avec tous les champs optionnels | LSP | Union discriminée par `status` |

## Quand suspendre un principe

SOLID n'est pas une religion. On peut transiger **quand** :
- Le code est jetable (POC, script one-shot)
- Appliquer le principe coûte plus que le bénéfice (over-engineering)
- Une feature est trop tôt pour qu'on connaisse son design final

Dans ces cas, **un commentaire explique** pourquoi on a transigé. Pas de transgression silencieuse.

## Comment vérifier en review

Avant de merger une PR, se poser pour chaque fichier modifié :
- **S** : "ce module a-t-il une seule raison de changer ?"
- **O** : "si on doit ajouter un cas, on modifie ce code ou on l'étend ?"
- **L** : "tous les variants de mes types se comportent-ils correctement avec mes fonctions ?"
- **I** : "ce composant utilise-t-il tout ce qu'on lui donne en props ?"
- **D** : "ce composant client touche-t-il directement la DB / l'API externe ?"

Cf. checklist dans [[pr-template]].

## Liens

- [[bet-points-calc]] — exemple parfait de SRP (fonction pure)
- [[42api-fetch]] — exemple de DIP (wrapper abstrait)
- [[coalition-badge]] — exemple d'ISP (props minimales)
- [[pr-template]] — checklist SOLID en review
- Skill globale `vercel-composition-patterns` (~/.agents/skills/) — pour les patterns React qui appliquent OCP
