# Classement — onglet Joueurs par défaut + Meilleur de la semaine : Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher les Joueurs comme onglet par défaut du classement, et ajouter un « meilleur de la semaine » (vendredi→vendredi, Europe/Zurich) — carte 🍺 en haut + onglet « Semaine ».

**Architecture:** Logique pure isolée (fenêtre temporelle + agrégat hebdo), I/O Supabase séparée, UI en composants. Le hebdo somme les `points_awarded` déjà attribués des paris dont le match tombe dans la fenêtre — aucune recompute de points (règle #7).

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript strict, Vitest. Fuseau via `Intl.DateTimeFormat` (Europe/Zurich, DST-correct).

**Spec :** `docs/superpowers/specs/2026-06-17-leaderboard-weekly-best-design.md`

---

## File Structure

- **Create** `src/lib/week.ts` — `currentWeekWindow(now)` : fenêtre vendredi→vendredi Zurich (pur).
- **Create** `tests/week.test.ts` — tests de la fenêtre (dont DST).
- **Modify** `src/lib/leaderboard.ts` — ajout `WeeklyBet`, `WeeklyEntry`, `buildWeeklyLeaderboard` (pur).
- **Modify** `tests/leaderboard.test.ts` — tests de `buildWeeklyLeaderboard`.
- **Modify** `src/lib/bets.ts` — `listScoredBetsWithKickoff()` (I/O).
- **Create** `src/components/weekly-winner-card.tsx` — carte gagnant (server component).
- **Modify** `src/components/leaderboard-tabs.tsx` — défaut Joueurs + onglet Semaine.
- **Modify** `src/app/leaderboard/page.tsx` — orchestration.

---

## Task 1 : Fenêtre hebdomadaire vendredi→vendredi (Europe/Zurich)

**Files:**
- Create: `src/lib/week.ts`
- Test: `tests/week.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

`tests/week.test.ts` :
```ts
import { describe, test, expect } from "vitest";

import { currentWeekWindow } from "../src/lib/week";

/** Lit l'heure-horloge Europe/Zurich d'un instant : { weekday, hm }. */
function zurich(date: Date): { weekday: string; hm: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { weekday: get("weekday"), hm: `${get("hour")}:${get("minute")}` };
}

const H = 3600 * 1000;

describe("currentWeekWindow", () => {
  test("un mercredi → start = vendredi précédent 00:00 Zurich", () => {
    const { start, end } = currentWeekWindow(new Date("2026-06-17T12:00:00Z")); // mercredi
    expect(zurich(start)).toEqual({ weekday: "Friday", hm: "00:00" });
    expect(zurich(end)).toEqual({ weekday: "Friday", hm: "00:00" });
    expect(start.getTime()).toBeLessThanOrEqual(Date.parse("2026-06-17T12:00:00Z"));
    expect(end.getTime()).toBeGreaterThan(Date.parse("2026-06-17T12:00:00Z"));
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * H); // semaine standard
  });

  test("un dimanche → même semaine que le vendredi précédent", () => {
    const { start } = currentWeekWindow(new Date("2026-06-21T12:00:00Z")); // dimanche
    expect(zurich(start)).toEqual({ weekday: "Friday", hm: "00:00" });
    // vendredi 19 juin 2026 00:00 CEST = 18 juin 22:00 UTC
    expect(start.toISOString()).toBe("2026-06-18T22:00:00.000Z");
  });

  test("un vendredi → start = ce vendredi 00:00 (borne incluse)", () => {
    const now = new Date("2026-06-19T08:00:00Z"); // vendredi matin
    const { start, end } = currentWeekWindow(now);
    expect(zurich(start)).toEqual({ weekday: "Friday", hm: "00:00" });
    expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(now.getTime()).toBeLessThan(end.getTime());
    expect(start.toISOString()).toBe("2026-06-18T22:00:00.000Z");
  });

  test("semaine du passage à l'heure d'été (DST) → 167h", () => {
    // Dimanche 29 mars 2026 = passage CET→CEST (on perd 1h).
    const { start, end } = currentWeekWindow(new Date("2026-03-30T12:00:00Z")); // lundi
    expect(zurich(start)).toEqual({ weekday: "Friday", hm: "00:00" });
    expect(zurich(end)).toEqual({ weekday: "Friday", hm: "00:00" });
    expect(end.getTime() - start.getTime()).toBe(167 * H); // 7j - 1h
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npm test -- week`
Expected: FAIL — `Cannot find module '../src/lib/week'`.

- [ ] **Step 3 : Implémenter**

`src/lib/week.ts` :
```ts
// Fenêtre hebdomadaire "vendredi → vendredi" en Europe/Zurich (DST-correct).
// Pur : aucune I/O. La semaine court du dernier vendredi 00h00 (Zurich) au
// vendredi suivant 00h00. Sert au classement "meilleur de la semaine".

const TZ = "Europe/Zurich";
const FRIDAY = 5; // getUTCDay(): 0=dimanche .. 6=samedi

/** Décalage (ms) du fuseau Zurich à l'instant `date` (positif à l'est de UTC). */
function tzOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return asUtc - date.getTime();
}

/** Composantes calendaires (année/mois/jour) de `date` lues en Europe/Zurich. */
function zurichYMD(date: Date): { y: number; m: number; d: number } {
  const local = new Date(date.getTime() + tzOffsetMs(date));
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
}

/** Instant UTC correspondant à 00h00 Zurich du jour calendaire y/m/d. */
function zurichMidnight(y: number, m: number, d: number): Date {
  // Décalage estimé à midi local ce jour-là : évite l'ambiguïté de la
  // transition DST qui survient la nuit, jamais à midi.
  const noonGuess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - tzOffsetMs(noonGuess));
}

/** Fenêtre [start, end) de la semaine courante : vendredi 00h00 → vendredi 00h00. */
export function currentWeekWindow(now: Date): { start: Date; end: Date } {
  const { y, m, d } = zurichYMD(now);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const daysSinceFriday = (weekday - FRIDAY + 7) % 7;

  const fri = new Date(Date.UTC(y, m - 1, d - daysSinceFriday));
  const start = zurichMidnight(
    fri.getUTCFullYear(),
    fri.getUTCMonth() + 1,
    fri.getUTCDate(),
  );

  const nextFri = new Date(
    Date.UTC(fri.getUTCFullYear(), fri.getUTCMonth(), fri.getUTCDate() + 7),
  );
  const end = zurichMidnight(
    nextFri.getUTCFullYear(),
    nextFri.getUTCMonth() + 1,
    nextFri.getUTCDate(),
  );

  return { start, end };
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npm test -- week`
Expected: PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/week.ts tests/week.test.ts
git commit -m "feat(leaderboard): currentWeekWindow vendredi→vendredi (Europe/Zurich, DST)"
```

---

## Task 2 : Agrégat hebdomadaire pur

**Files:**
- Modify: `src/lib/leaderboard.ts`
- Test: `tests/leaderboard.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter en fin de `tests/leaderboard.test.ts` (et compléter l'import depuis `../src/lib/leaderboard` avec `buildWeeklyLeaderboard`, `type WeeklyBet`) :
```ts
describe("buildWeeklyLeaderboard", () => {
  const WIN = {
    start: new Date("2026-06-18T22:00:00Z"), // vendredi 19/06 00:00 Zurich
    end: new Date("2026-06-25T22:00:00Z"), // vendredi 26/06 00:00 Zurich
  };
  // Un kickoff dans la fenêtre et un hors fenêtre.
  const IN = "2026-06-20T18:00:00Z";
  const OUT = "2026-06-10T18:00:00Z";

  test("aucun pari → []", () => {
    expect(buildWeeklyLeaderboard([], [player("u1", "alice")], WIN)).toEqual([]);
  });

  test("somme les points de la fenêtre, ignore le hors-fenêtre", () => {
    const players = [player("u1", "alice"), player("u2", "bob")];
    const bets: WeeklyBet[] = [
      { user_id: "u1", points_awarded: 3, kickoff_at: IN },
      { user_id: "u1", points_awarded: 1, kickoff_at: IN },
      { user_id: "u1", points_awarded: 3, kickoff_at: OUT }, // ignoré
      { user_id: "u2", points_awarded: 1, kickoff_at: IN },
    ];
    const res = buildWeeklyLeaderboard(bets, players, WIN);
    expect(res.map((e) => [e.login, e.weeklyPoints, e.rank])).toEqual([
      ["alice", 4, 1],
      ["bob", 1, 2],
    ]);
  });

  test("exclut les joueurs à 0 pt sur la semaine", () => {
    const players = [player("u1", "alice"), player("u2", "bob")];
    const bets: WeeklyBet[] = [
      { user_id: "u1", points_awarded: 3, kickoff_at: IN },
      { user_id: "u2", points_awarded: 0, kickoff_at: IN }, // a parié, rien gagné
    ];
    const res = buildWeeklyLeaderboard(bets, players, WIN);
    expect(res.map((e) => e.login)).toEqual(["alice"]);
  });

  test("égalité → rang standard (1,1,3) + départage par login", () => {
    const players = [
      player("u1", "alice"),
      player("u2", "bob"),
      player("u3", "carol"),
    ];
    const bets: WeeklyBet[] = [
      { user_id: "u1", points_awarded: 3, kickoff_at: IN },
      { user_id: "u2", points_awarded: 3, kickoff_at: IN },
      { user_id: "u3", points_awarded: 1, kickoff_at: IN },
    ];
    const res = buildWeeklyLeaderboard(bets, players, WIN);
    expect(res.map((e) => [e.login, e.rank])).toEqual([
      ["alice", 1],
      ["bob", 1],
      ["carol", 3],
    ]);
  });

  test("user_id sans joueur correspondant → ignoré", () => {
    const players = [player("u1", "alice")];
    const bets: WeeklyBet[] = [
      { user_id: "u1", points_awarded: 1, kickoff_at: IN },
      { user_id: "ghost", points_awarded: 3, kickoff_at: IN },
    ];
    const res = buildWeeklyLeaderboard(bets, players, WIN);
    expect(res.map((e) => e.login)).toEqual(["alice"]);
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npm test -- leaderboard`
Expected: FAIL — `buildWeeklyLeaderboard` / `WeeklyBet` non exportés.

- [ ] **Step 3 : Implémenter**

Ajouter à la fin de `src/lib/leaderboard.ts` :
```ts
export type WeeklyBet = {
  user_id: string;
  points_awarded: number;
  kickoff_at: string;
};

export type WeeklyEntry = {
  rank: number;
  login: string;
  avatarUrl: string | null;
  coalition: LeaderboardCoalition | null;
  weeklyPoints: number;
};

/**
 * Classement "meilleur de la semaine" : somme des points DÉJÀ attribués
 * (points_awarded) des paris dont le match (kickoff_at) tombe dans `window`
 * = [start, end). Aucun recalcul de points (rule #7). Exclut les joueurs à 0 pt
 * sur la semaine et les user_id sans joueur correspondant. Tri points hebdo
 * décroissants puis login ; rang standard (1,1,3).
 */
export function buildWeeklyLeaderboard(
  weeklyBets: WeeklyBet[],
  players: LeaderboardPlayer[],
  weekWindow: { start: Date; end: Date },
): WeeklyEntry[] {
  const startMs = weekWindow.start.getTime();
  const endMs = weekWindow.end.getTime();

  // 1. Somme des points par joueur, restreinte à la fenêtre.
  const pointsByUser = new Map<string, number>();
  for (const b of weeklyBets) {
    const t = new Date(b.kickoff_at).getTime();
    if (t < startMs || t >= endMs) continue;
    pointsByUser.set(b.user_id, (pointsByUser.get(b.user_id) ?? 0) + b.points_awarded);
  }

  // 2. Joindre aux joueurs ; exclure 0 pt et user_id inconnu.
  const aggregated = players
    .map((p) => ({ p, weeklyPoints: pointsByUser.get(p.id) ?? 0 }))
    .filter((x) => x.weeklyPoints > 0)
    .map(({ p, weeklyPoints }) => ({
      login: p.login,
      avatarUrl: p.avatar_url,
      coalition: p.coalition,
      weeklyPoints,
    }));

  // 3. Tri : points hebdo décroissants, puis login croissant (déterministe).
  aggregated.sort(
    (a, b) => b.weeklyPoints - a.weeklyPoints || a.login.localeCompare(b.login),
  );

  // 4. Rang standard (1,1,3) — même schéma que buildCoalitionLeaderboard.
  let lastPoints: number | null = null;
  let lastRank = 0;
  return aggregated.map((entry, index) => {
    const rank =
      lastPoints !== null && entry.weeklyPoints === lastPoints ? lastRank : index + 1;
    lastPoints = entry.weeklyPoints;
    lastRank = rank;
    return { rank, ...entry };
  });
}
```

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `npm test -- leaderboard`
Expected: PASS (tests existants + 5 nouveaux).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/leaderboard.ts tests/leaderboard.test.ts
git commit -m "feat(leaderboard): buildWeeklyLeaderboard (somme points hebdo, pur)"
```

---

## Task 3 : Requête des paris notés + date de match

**Files:**
- Modify: `src/lib/bets.ts`

> Pas de test unitaire (I/O Supabase, suivant le pattern des autres `list*` du fichier). Vérification par typecheck + build.

- [ ] **Step 1 : Ajouter la fonction**

Dans `src/lib/bets.ts` :

1. Compléter l'import depuis leaderboard :
```ts
import type { LeaderboardBet, WeeklyBet } from "@/lib/leaderboard";
```
(remplace la ligne `import type { LeaderboardBet } from "@/lib/leaderboard";`)

2. Ajouter en fin de fichier :
```ts
/**
 * Paris NOTÉS (points_awarded non null) joints à la date de coup d'envoi de leur
 * match, pour le classement "meilleur de la semaine". Lecture server-only via
 * service_role (bets = RLS default-deny). Normalise le match imbriqué en
 * objet|null (supabase-js peut le typer objet OU tableau selon la relation).
 */
export async function listScoredBetsWithKickoff(): Promise<WeeklyBet[]> {
  const { data, error } = await supabaseAdmin
    .from("bets")
    .select("user_id, points_awarded, match:matches(kickoff_at)")
    .not("points_awarded", "is", null);

  if (error) throw new Error(`listScoredBetsWithKickoff: ${error.message}`);

  return (data ?? []).flatMap((row) => {
    const m = row.match as { kickoff_at: string } | { kickoff_at: string }[] | null;
    const match = Array.isArray(m) ? (m[0] ?? null) : m;
    // points_awarded est non null (filtré ci-dessus) ; match non null (FK not null).
    if (match === null || row.points_awarded === null) return [];
    return [
      {
        user_id: row.user_id,
        points_awarded: row.points_awarded,
        kickoff_at: match.kickoff_at,
      },
    ];
  });
}
```

- [ ] **Step 2 : Typecheck**

Run: `npm run typecheck`
Expected: pas d'erreur.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/bets.ts
git commit -m "feat(leaderboard): listScoredBetsWithKickoff (paris notés + kickoff)"
```

---

## Task 4 : Carte « Bière de la semaine »

**Files:**
- Create: `src/components/weekly-winner-card.tsx`

- [ ] **Step 1 : Créer le composant**

`src/components/weekly-winner-card.tsx` :
```tsx
// Carte mise en avant du meilleur joueur de la semaine (vendredi→vendredi).
// Server component, sans état. Reçoit le gagnant calculé côté page (ou null).
import type { WeeklyEntry } from "@/lib/leaderboard";

export function WeeklyWinnerCard({ winner }: { winner: WeeklyEntry | null }) {
  return (
    <section className="glass rise mb-4 flex items-center gap-4 p-4">
      <span className="text-3xl" aria-hidden>
        🍺
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Bière de la semaine
        </p>
        {winner ? (
          <div className="mt-1 flex items-center gap-3">
            {winner.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={winner.avatarUrl}
                alt=""
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <span className="block h-10 w-10 rounded-full bg-white/10" />
            )}
            <span className="min-w-0 flex-1 truncate font-bold">{winner.login}</span>
            <span className="shrink-0 font-semibold tabular-nums text-accent">
              {winner.weeklyPoints} pts
            </span>
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-300">
            Pas encore de gagnant cette semaine
          </p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2 : Typecheck + lint**

Run: `npm run typecheck && npx eslint src/components/weekly-winner-card.tsx`
Expected: pas d'erreur (eslint exit 0).

- [ ] **Step 3 : Commit**

```bash
git add src/components/weekly-winner-card.tsx
git commit -m "feat(leaderboard): composant WeeklyWinnerCard (🍺 bière de la semaine)"
```

---

## Task 5 : Onglet Joueurs par défaut + onglet Semaine

**Files:**
- Modify: `src/components/leaderboard-tabs.tsx`

- [ ] **Step 1 : Étendre le type d'onglet + importer WeeklyEntry**

Dans `src/components/leaderboard-tabs.tsx` :

1. Compléter l'import de types :
```ts
import type {
  CampStanding,
  CoalitionStanding,
  LeaderboardEntry,
  WeeklyEntry,
} from "@/lib/leaderboard";
```

2. Étendre le type `Tab` :
```ts
type Tab = "coalitions" | "players" | "weekly";
```

- [ ] **Step 2 : Ajouter la prop `weekly` et le défaut Joueurs**

1. Étendre la signature du composant (props) :
```ts
export function LeaderboardTabs({
  coalitions,
  camps,
  players,
  weekly,
}: {
  coalitions: CoalitionViews;
  camps: CampStanding[];
  players: PlayerViews;
  weekly: WeeklyEntry[];
}) {
```

2. Onglet par défaut = Joueurs :
```ts
  const [tab, setTab] = useState<Tab>("players");
```

- [ ] **Step 3 : Réordonner les onglets (Joueurs en premier) + ajouter Semaine**

Remplacer le `<Segmented<Tab> …>` de tête par :
```tsx
      <Segmented<Tab>
        options={[
          { key: "players", label: "Joueurs" },
          { key: "coalitions", label: "Coalitions" },
          { key: "weekly", label: "Semaine" },
        ]}
        value={tab}
        onChange={setTab}
      />
```

- [ ] **Step 4 : Transformer le ternaire en 3 blocs conditionnels + section Semaine**

Le rendu actuel est `{tab === "coalitions" ? ( <section coalitions> ) : ( <section players> )}`.
Le remplacer par trois blocs indépendants. Conserver **tel quel** le contenu des deux
`<section>` existantes (coalitions et joueurs), en changeant uniquement leur enveloppe
conditionnelle, et ajouter la section Semaine :

```tsx
      {tab === "coalitions" && (
        <section>
          {/* … contenu coalitions EXISTANT, inchangé … */}
        </section>
      )}

      {tab === "players" && (
        <section>
          {/* … contenu joueurs EXISTANT (camps + filtres + liste), inchangé … */}
        </section>
      )}

      {tab === "weekly" && (
        <section>
          {weekly.length === 0 ? (
            <p className="text-zinc-400">Aucun joueur classé cette semaine.</p>
          ) : (
            <ul className="glass divide-y divide-white/5 overflow-hidden">
              {weekly.map((e) => (
                <li
                  key={e.login}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <span
                    className={`w-6 shrink-0 text-center font-bold tabular-nums ${
                      e.rank <= 3 ? "text-accent" : "text-zinc-400"
                    }`}
                  >
                    {e.rank}
                  </span>
                  <Link
                    href={`/profile/${e.login}`}
                    aria-label={`Profil de ${e.login}`}
                    className="shrink-0 rounded-full ring-white/0 transition-shadow hover:ring-2 hover:ring-accent/60"
                  >
                    {e.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={e.avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="block h-8 w-8 rounded-full bg-white/10" />
                    )}
                  </Link>
                  <Link
                    href={`/profile/${e.login}`}
                    className="min-w-0 flex-1 truncate font-medium transition-colors hover:text-accent"
                  >
                    {e.login}
                  </Link>
                  <span className="sm:hidden">
                    <CoalitionBadge coalition={e.coalition} size="sm" showLabel={false} />
                  </span>
                  <span className="hidden sm:inline-flex">
                    <CoalitionBadge coalition={e.coalition} size="sm" />
                  </span>
                  <span className="w-14 shrink-0 text-right font-semibold tabular-nums">
                    {e.weeklyPoints} pt
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
```

> Note : le contenu des sections coalitions et joueurs ne change pas — seul le
> `? :` devient trois `{tab === "…" && (…)}`. `Link`, `CoalitionBadge`,
> `PCT_FMT`, `AVG_FMT` restent importés/utilisés comme avant.

- [ ] **Step 5 : Typecheck + lint**

Run: `npm run typecheck && npx eslint src/components/leaderboard-tabs.tsx`
Expected: pas d'erreur (eslint exit 0). En particulier, plus aucune branche ne doit
laisser `tab` non géré.

- [ ] **Step 6 : Commit**

```bash
git add src/components/leaderboard-tabs.tsx
git commit -m "feat(leaderboard): onglet Joueurs par défaut + onglet Semaine"
```

---

## Task 6 : Câblage de la page classement

**Files:**
- Modify: `src/app/leaderboard/page.tsx`

- [ ] **Step 1 : Importer la fenêtre, l'agrégat, la requête et la carte**

Dans `src/app/leaderboard/page.tsx`, ajouter aux imports :
```ts
import { currentWeekWindow } from "@/lib/week";
import { listScoredBetsWithKickoff } from "@/lib/bets";
import { buildWeeklyLeaderboard } from "@/lib/leaderboard";
import { WeeklyWinnerCard } from "@/components/weekly-winner-card";
```
(`listAllBets` reste importé tel quel ; `buildWeeklyLeaderboard` s'ajoute aux imports déjà présents depuis `@/lib/leaderboard`.)

- [ ] **Step 2 : Calculer la fenêtre, fetch, agrégat**

Dans `LeaderboardPage`, après `await requireSession();`, remplacer le fetch :
```ts
  const now = new Date();
  const week = currentWeekWindow(now);
  const [players, bets, weeklyBets] = await Promise.all([
    listPlayers(),
    listAllBets(),
    listScoredBetsWithKickoff(),
  ]);
  const weekly = buildWeeklyLeaderboard(weeklyBets, players, week);
  const winner = weekly[0] ?? null;
```
(La ligne d'origine `const [players, bets] = await Promise.all([listPlayers(), listAllBets()]);` est remplacée par le bloc ci-dessus.)

- [ ] **Step 3 : Rendre la carte + passer `weekly` à l'onglet**

Dans le JSX retourné, juste avant `<LeaderboardTabs … />`, ajouter la carte, et ajouter
la prop `weekly` :
```tsx
      <WeeklyWinnerCard winner={winner} />
      <LeaderboardTabs
        coalitions={coalitions}
        camps={camps}
        players={playerViews}
        weekly={weekly}
      />
```
(Adapter aux noms de variables réels passés actuellement à `<LeaderboardTabs>` : ajouter
uniquement `weekly={weekly}` et insérer `<WeeklyWinnerCard winner={winner} />` au-dessus.)

- [ ] **Step 4 : Typecheck + lint + tests + build**

Run: `npm run typecheck && npx eslint src/app/leaderboard/page.tsx && npm test && npm run build`
Expected: tout vert ; build OK ; `/leaderboard` présent dans la sortie des routes.

- [ ] **Step 5 : Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "feat(leaderboard): câble la carte + l'onglet meilleur de la semaine"
```

---

## Task 7 : Vérification finale

**Files:** aucun (gates qualité).

- [ ] **Step 1 : Suite complète**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: tout vert (le test `week` + les nouveaux tests `buildWeeklyLeaderboard` inclus).

- [ ] **Step 2 : Vérification manuelle**

`npm run dev`, connecté, ouvrir `/leaderboard` :
- L'onglet affiché par défaut est **Joueurs** (pas Coalitions) ; ordre `[Joueurs] [Coalitions] [Semaine]`.
- La carte « 🍺 Bière de la semaine » apparaît en haut : le n°1 hebdo (avatar + login + points), ou « Pas encore de gagnant cette semaine » si aucun point cette semaine.
- L'onglet **Semaine** liste les joueurs ayant marqué depuis vendredi, triés par points hebdo ; cohérent avec le n°1 de la carte.

---

## Couverture spec (auto-review)

- §2 onglet Joueurs par défaut + ordre → Task 5 (steps 2-3).
- §3.1 fenêtre vendredi→vendredi Zurich + DST → Task 1.
- §3.2 `listScoredBetsWithKickoff` → Task 3.
- §3.3 `buildWeeklyLeaderboard` + types `WeeklyBet`/`WeeklyEntry`, exclusion 0 pt, rang → Task 2.
- §3.4 carte `WeeklyWinnerCard` → Task 4 ; onglet Semaine → Task 5 (step 4) ; câblage page → Task 6.
- §4 cas limites (vide → carte « pas de gagnant » + onglet vide ; hors fenêtre ignoré ; sans coalition ; requireSession inchangé) → Task 2 (tests), Task 4, Task 5, Task 6.
- §6 tests (`week`, `buildWeeklyLeaderboard`, non-régression) → Task 1, Task 2, Task 7.
