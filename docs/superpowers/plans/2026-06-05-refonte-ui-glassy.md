# Refonte UI glassy (sombre vibrant) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre l'UI de 42Bet en style glassy sombre vibrant (halos violet/cyan, façon Apple) avec bottom-nav mobile, sans toucher à la couche data ni à la logique métier.

**Architecture:** Approche A — tokens dans `@theme` + classes glass dans `globals.css` (Tailwind v4). Dark forcé via `class="dark"` sur `<html>` + `@custom-variant`, ce qui réactive toutes les variantes `dark:` existantes sans réécrire la logique. Deux composants structurels nouveaux (`AppBackground`, `BottomNav`) + un helper client `NavLink`. Toutes les pages restent des server components.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, TypeScript strict, Geist.

> **Note importante sur la vérification :** ce plan est de la **présentation pure**. Il n'y a pas de test unitaire à écrire (rien d'unitairement testable dans du style). Le filet de sécurité est : les **75 tests Vitest existants restent verts** (anti-régression logique) + `typecheck` + `lint` + `build` verts + **contrôle visuel** en dark/responsive. Chaque tâche se termine par ces vérifs puis un commit.
>
> Spec de référence : `docs/superpowers/specs/2026-06-05-refonte-ui-glassy-design.md`.

---

## File Structure

**Créés :**
- `src/components/app-background.tsx` — halos d'ambiance (server, sans état)
- `src/components/bottom-nav.tsx` — bottom tab bar mobile (`"use client"`, `usePathname`)
- `src/components/nav-link.tsx` — lien de nav avec état actif (`"use client"`, `usePathname`)

**Modifiés :**
- `src/app/globals.css` — tokens `@theme`, dark variant, classes glass, keyframes
- `src/app/layout.tsx` — `class="dark"`, `AppBackground`, `BottomNav`, padding mobile
- `src/components/site-header.tsx` — barre `glass-strong` sticky, `NavLink`
- `src/components/auth-button.tsx` — bouton accent dégradé
- `src/app/matches/page.tsx` — cartes glass par jour
- `src/components/match-row.tsx` — ligne match re-stylée (états conservés)
- `src/components/bet-form.tsx` — inputs/bouton glass
- `src/app/leaderboard/page.tsx` — cartes glass coalition + individuel
- `src/app/profile/[login]/page.tsx` — en-tête + StatCards + timeline glass
- `src/app/page.tsx` — home enrichie (hero + 2 cartes)

**Ordre :** fondation thème → layout/nav (structurel) → pages → home → passe polish/anim. Chaque tâche est autonome et laisse `main` vert.

---

## Task 1: Fondation du thème (tokens + dark forcé + classes glass)

**Files:**
- Modify: `src/app/globals.css` (remplacement complet)

- [ ] **Step 1: Remplacer le contenu de `src/app/globals.css`**

```css
@import "tailwindcss";

/* Dark-only : on bascule la variante `dark:` en mode classe (pilotée par
   <html class="dark">) au lieu de prefers-color-scheme. Toutes les classes
   dark: existantes des composants restent ainsi actives. */
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: #0b0b16;
  --surface: #15151f;
  --foreground: #ededf2;
  --accent: #7c3aed;
  --accent-2: #6d28d9;
  --cyan: #06b6d4;
  --success: #34d399;
}

@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-foreground: var(--foreground);
  --color-accent: var(--accent);
  --color-accent-2: var(--accent-2);
  --color-cyan: var(--cyan);
  --color-success: var(--success);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), system-ui, sans-serif;
}

@layer components {
  .glass {
    background: rgba(255, 255, 255, 0.055);
    border: 1px solid rgba(255, 255, 255, 0.10);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border-radius: 1rem;
  }
  .glass-strong {
    background: rgba(11, 11, 22, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.10);
    backdrop-filter: blur(22px) saturate(140%);
    -webkit-backdrop-filter: blur(22px) saturate(140%);
  }
  /* Fallback navigateurs sans backdrop-filter : plus d'opacité. */
  @supports not (backdrop-filter: blur(1px)) {
    .glass { background: rgba(21, 21, 31, 0.92); }
    .glass-strong { background: rgba(11, 11, 22, 0.95); }
  }
}

@layer utilities {
  .rise { animation: rise 0.4s ease both; }
  @keyframes rise {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 2: Forcer le dark sur `<html>` dans `src/app/layout.tsx`**

Remplacer la ligne `className={...}` du `<html>` pour y ajouter `dark` :

```tsx
    <html
      lang="fr"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
```

(On en profite pour corriger `lang="en"` → `lang="fr"`, l'app est en français.)

- [ ] **Step 3: Vérifier**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: tout vert, aucune erreur. (Visuellement, le fond devient sombre ; halos ajoutés Task 2.)

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(ui): thème glassy sombre — tokens, dark forcé, classes glass"
```

---

## Task 2: `AppBackground` (halos d'ambiance)

**Files:**
- Create: `src/components/app-background.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Créer `src/components/app-background.tsx`**

```tsx
// Fond d'ambiance : halos violet/cyan fixes derrière tout le contenu.
// Server component sans état, aucun JS. Purement décoratif (aria-hidden).
export function AppBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div
        className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full opacity-40 blur-[90px]"
        style={{ background: "var(--accent)" }}
      />
      <div
        className="absolute -bottom-40 -right-24 h-[26rem] w-[26rem] rounded-full opacity-35 blur-[90px]"
        style={{ background: "var(--cyan)" }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Monter `AppBackground` dans `src/app/layout.tsx`**

Ajouter l'import puis le rendre en premier enfant du `<body>` :

```tsx
import { AppBackground } from "@/components/app-background";
// ...
      <body className="min-h-full flex flex-col pb-20 md:pb-0">
        <AppBackground />
        <SiteHeader />
        {children}
      </body>
```

(`pb-20 md:pb-0` réserve la place de la BottomNav mobile, ajoutée Task 4.)

- [ ] **Step 3: Vérifier**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: vert. Visuel : deux halos diffus violet/cyan visibles derrière le contenu.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-background.tsx src/app/layout.tsx
git commit -m "feat(ui): AppBackground — halos d'ambiance violet/cyan"
```

---

## Task 3: Navigation desktop (`NavLink` + `site-header` glass sticky)

**Files:**
- Create: `src/components/nav-link.tsx`
- Modify: `src/components/site-header.tsx`

- [ ] **Step 1: Créer `src/components/nav-link.tsx`**

```tsx
"use client";
// Lien de navigation avec état actif. Client uniquement pour usePathname —
// aucune donnée Supabase/API 42 ici.
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`text-sm transition-colors ${
        active
          ? "font-semibold text-foreground"
          : "text-zinc-400 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
```

- [ ] **Step 2: Re-styler `src/components/site-header.tsx`**

Remplacer le contenu par (header `glass-strong` sticky, masqué sous `md` où la BottomNav prend le relais) :

```tsx
// src/components/site-header.tsx
import Link from "next/link";
import { AuthButton } from "@/components/auth-button";
import { NavLink } from "@/components/nav-link";

export function SiteHeader() {
  return (
    <header className="glass-strong sticky top-0 z-40 flex items-center justify-between px-6 py-3">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          42<span className="text-cyan">Bet</span>
        </Link>
        <nav className="hidden items-center gap-5 md:flex">
          <NavLink href="/matches">Matchs</NavLink>
          <NavLink href="/leaderboard">Classement</NavLink>
        </nav>
      </div>
      <AuthButton />
    </header>
  );
}
```

- [ ] **Step 3: Vérifier**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: vert. Visuel desktop : barre translucide collante, onglet actif en surbrillance.

- [ ] **Step 4: Commit**

```bash
git add src/components/nav-link.tsx src/components/site-header.tsx
git commit -m "feat(ui): header glass sticky + NavLink état actif"
```

---

## Task 4: `BottomNav` mobile

**Files:**
- Create: `src/components/bottom-nav.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Créer `src/components/bottom-nav.tsx`**

L'onglet Profil pointe vers `/profile/<login>` si connecté, sinon déclenche la connexion 42 via une server action passée en prop. `login` et l'action viennent du layout (server). Aucune donnée fetchée côté client.

```tsx
"use client";
// Bottom tab bar mobile (< md). Client uniquement pour usePathname.
// Le login + la server action signIn sont fournis par le layout (server).
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: string };

const TABS: Tab[] = [
  { href: "/matches", label: "Matchs", icon: "⚽" },
  { href: "/leaderboard", label: "Classement", icon: "🏆" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav({
  login,
  signInAction,
}: {
  login: string | null;
  signInAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const cls = (active: boolean) =>
    `flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
      active ? "text-foreground" : "text-zinc-400"
    }`;

  return (
    <nav
      className="glass-strong fixed inset-x-0 bottom-0 z-40 flex md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={cls(isActive(pathname, t.href))}>
          <span className="text-lg">{t.icon}</span>
          {t.label}
        </Link>
      ))}
      {login ? (
        <Link
          href={`/profile/${login}`}
          className={cls(isActive(pathname, `/profile/${login}`))}
        >
          <span className="text-lg">👤</span>
          Profil
        </Link>
      ) : (
        <form action={signInAction} className="flex flex-1">
          <button type="submit" className={cls(false) + " w-full"}>
            <span className="text-lg">👤</span>
            Profil
          </button>
        </form>
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Monter `BottomNav` dans `src/app/layout.tsx`**

Le layout est un server component : il lit la session et passe `login` + une server action. Ajouter imports et rendu en fin de `<body>` :

```tsx
import { auth, signIn } from "@/lib/auth/config";
import { BottomNav } from "@/components/bottom-nav";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const login = session?.user?.login ?? null;

  return (
    <html
      lang="fr"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pb-20 md:pb-0">
        <AppBackground />
        <SiteHeader />
        {children}
        <BottomNav
          login={login}
          signInAction={async () => {
            "use server";
            await signIn("42");
          }}
        />
      </body>
    </html>
  );
}
```

Note : `RootLayout` devient `async` (lecture de la session). `SiteHeader`/`AuthButton` continuent d'appeler `auth()` de leur côté — c'est déjà le cas et c'est dédupliqué par le cache de requête de Next.

- [ ] **Step 3: Vérifier**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: vert. Visuel mobile (< md) : barre d'onglets glass en bas, 3 entrées, état actif, ≥ 44px.

- [ ] **Step 4: Commit**

```bash
git add src/components/bottom-nav.tsx src/app/layout.tsx
git commit -m "feat(ui): BottomNav mobile (Matchs/Classement/Profil)"
```

---

## Task 5: `auth-button` accent

**Files:**
- Modify: `src/components/auth-button.tsx`

- [ ] **Step 1: Re-styler les boutons dans `src/components/auth-button.tsx`**

Remplacer uniquement les `className` (logique inchangée). Bouton de connexion en accent dégradé :

```tsx
        <button
          type="submit"
          className="rounded-xl bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-transform active:scale-[0.98]"
        >
          Se connecter avec 42
        </button>
```

Et la partie connectée (avatar + login + déconnexion) :

```tsx
  return (
    <div className="flex items-center gap-3">
      {avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={login}
          width={32}
          height={32}
          className="rounded-full ring-1 ring-white/15"
        />
      )}
      <span className="hidden text-sm font-medium sm:inline">{login}</span>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button
          type="submit"
          className="text-sm text-zinc-400 transition-colors hover:text-foreground"
        >
          Déconnexion
        </button>
      </form>
    </div>
  );
```

- [ ] **Step 2: Vérifier**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: vert. Visuel : bouton connexion en dégradé violet, déconnexion discrète.

- [ ] **Step 3: Commit**

```bash
git add src/components/auth-button.tsx
git commit -m "feat(ui): bouton auth en accent dégradé"
```

---

## Task 6: Page `/matches` + `match-row` + `bet-form`

**Files:**
- Modify: `src/app/matches/page.tsx`
- Modify: `src/components/match-row.tsx`
- Modify: `src/components/bet-form.tsx`

- [ ] **Step 1: Cartes glass par jour dans `src/app/matches/page.tsx`**

Remplacer le bloc de rendu (le `<main>` … `</main>`) ; seules les classes et l'enveloppe `glass` changent, la logique data est intacte :

```tsx
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Matchs</h1>

      {days.length === 0 ? (
        <p className="text-zinc-400">Aucun match pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => (
            <section key={day.dayKey} className="rise">
              <h2 className="mb-2 px-1 text-sm font-semibold capitalize text-zinc-400">
                {DAY_FMT.format(new Date(day.matches[0].kickoff_at))}
              </h2>
              <ul className="glass divide-y divide-white/5 overflow-hidden">
                {day.matches.map((match) => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    state={displayState(match, now)}
                    bet={betsByMatch.get(match.id)}
                    isAuthenticated={isAuthenticated}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
```

- [ ] **Step 2: Re-styler `src/components/match-row.tsx`**

Conserver la structure et les 4 états de `BetCell` ; ajuster les classes (couleurs sombres, pill violette pour le prono, points en vert, bouton accent). Remplacer le `return` du `MatchRow` et du `BetCell` :

```tsx
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm sm:gap-4">
      <span className="w-12 shrink-0 tabular-nums text-zinc-400">
        {TIME_FMT.format(new Date(match.kickoff_at))}
      </span>

      <span className="flex-1 text-right font-medium">{match.home_team}</span>

      <span className="w-14 shrink-0 text-center font-bold tabular-nums">
        {isFinished && hasScore
          ? `${match.home_score} - ${match.away_score}`
          : "–"}
      </span>

      <span className="flex-1 font-medium">{match.away_team}</span>

      <span className="flex min-w-[8rem] shrink-0 justify-end text-right text-xs text-zinc-400">
        <BetCell
          match={match}
          state={state}
          bet={bet}
          isAuthenticated={isAuthenticated}
        />
      </span>
    </li>
  );
```

Dans `BetCell`, ajuster les rendus (logique identique) :

- État `upcoming` non authentifié — bouton lien :

```tsx
          <button
            type="submit"
            className="text-accent underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Connecte-toi pour parier
          </button>
```

- État `finished` avec pari — prono + points en vert :

```tsx
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent">
          {bet.home_score}-{bet.away_score}
        </span>
        {bet.points_awarded !== null && (
          <span className="font-bold text-success">+{bet.points_awarded}</span>
        )}
      </span>
```

- État `live` avec pari :

```tsx
      <span className="inline-flex items-center gap-1.5 tabular-nums">
        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent">
          {bet.home_score}-{bet.away_score}
        </span>
        <span className="text-zinc-400">en cours</span>
      </span>
```

(Les branches sans pari — `terminé`, `en cours`, `STATE_LABEL[state]` — restent inchangées.)

- [ ] **Step 3: Re-styler `src/components/bet-form.tsx`**

Ajuster les `className` des inputs et du bouton (logique server-action inchangée). Inputs :

```tsx
        className="w-10 rounded-lg border border-white/15 bg-white/5 px-1 py-1 text-center tabular-nums outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40"
```

(à appliquer aux deux `<input>` score domicile/extérieur). Bouton submit dans `SubmitButton` :

```tsx
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-3 py-1 text-xs font-semibold text-white shadow shadow-accent/30 transition-transform active:scale-[0.98] disabled:opacity-50"
    >
      {pending ? "…" : hasBet ? "Modifier" : "Parier"}
    </button>
```

Message inline : `className="text-xs text-zinc-400"`.

- [ ] **Step 4: Vérifier**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: vert (les tests `match-view`/`points` doivent rester verts). Visuel : cartes glass par jour, prono en pill violette, points en vert, bouton accent.

- [ ] **Step 5: Commit**

```bash
git add src/app/matches/page.tsx src/components/match-row.tsx src/components/bet-form.tsx
git commit -m "feat(ui): page Matchs en cartes glass (états & data inchangés)"
```

---

## Task 7: Page `/leaderboard`

**Files:**
- Modify: `src/app/leaderboard/page.tsx`

- [ ] **Step 1: Re-styler le rendu de `src/app/leaderboard/page.tsx`**

Logique data intacte. Remplacer les enveloppes `border ...` par `glass`, ajuster les couleurs (zinc-400), et accentuer le rang du podium. Bloc « Par coalition » — le `<ul>` :

```tsx
              <ul className="glass divide-y divide-white/5 overflow-hidden">
```

et la cellule du rang coalition + individuel :

```tsx
                    <span className="w-6 shrink-0 text-center font-bold tabular-nums text-zinc-400">
                      {c.rank}
                    </span>
```

Bloc « Individuel » — le `<ul>` :

```tsx
          <ul className="glass divide-y divide-white/5 overflow-hidden">
```

Rang individuel avec accent podium :

```tsx
                <span
                  className={`w-6 shrink-0 text-center font-bold tabular-nums ${
                    e.rank <= 3 ? "text-accent" : "text-zinc-400"
                  }`}
                >
                  {e.rank}
                </span>
```

Avatar fallback : `bg-white/10` au lieu de `bg-zinc-200 dark:bg-zinc-700`. Points individuels en `font-bold` (déjà le cas). Les en-têtes de colonnes : remplacer `text-zinc-400` (inchangé sémantiquement) — garder.

Lien joueur : `className="flex-1 truncate font-medium transition-colors hover:text-accent"`.

- [ ] **Step 2: Vérifier**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: vert (tests `leaderboard` verts). Visuel : sections en cartes glass, podium en violet, badges coalition lisibles sur fond sombre.

- [ ] **Step 3: Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "feat(ui): classement en cartes glass + accent podium"
```

---

## Task 8: Page `/profile/[login]` (+ `StatCard`)

**Files:**
- Modify: `src/app/profile/[login]/page.tsx`

- [ ] **Step 1: Re-styler `src/app/profile/[login]/page.tsx`**

Logique data intacte. En-tête sur panneau glass, avatar avec ring, fallback `bg-white/10`. Remplacer le `<header>` :

```tsx
      <header className="glass mb-6 flex items-center gap-4 p-4">
        {player.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.avatar_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-white/15"
          />
        ) : (
          <span className="h-16 w-16 shrink-0 rounded-full bg-white/10" />
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {player.login}
          </h1>
          <div className="mt-1">
            <CoalitionBadge coalition={player.coalition} size="md" />
          </div>
        </div>
      </header>
```

Timeline — les lignes deviennent glass et les couleurs d'outcome s'adaptent (déjà semi-transparentes, OK sur sombre) ; remplacer la `<li>` :

```tsx
              <li
                key={h.matchId}
                className="glass flex items-center gap-3 px-4 py-3 text-sm"
              >
                <span className="flex-1 truncate">
                  {h.homeTeam} <span className="text-zinc-500">vs</span>{" "}
                  {h.awayTeam}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-400">
                  prono {h.predictedHome}–{h.predictedAway}
                </span>
                <span className="w-14 shrink-0 text-right font-medium tabular-nums">
                  {finished ? `${h.actualHome}–${h.actualAway}` : "—"}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${o.cls}`}
                >
                  {o.label}
                </span>
              </li>
```

- [ ] **Step 2: Re-styler le composant `Stat` en carte glass**

Remplacer la fonction `Stat` en bas du fichier (les 4 stats deviennent des cartes glass) :

```tsx
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass px-2 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 3: Vérifier**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: vert (tests `profile` verts). Visuel : en-tête glass, 4 StatCards, timeline glass, pastilles outcome lisibles.

- [ ] **Step 4: Commit**

```bash
git add "src/app/profile/[login]/page.tsx"
git commit -m "feat(ui): profil en panneaux glass (en-tête, stats, timeline)"
```

---

## Task 9: Home enrichie (`/`)

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Enrichir `src/app/page.tsx`**

Hero glass + 2 cartes (prochains matchs à parier, top 3 classement). Réutilise les fonctions data **existantes** (`listMatches`, `listAllBets`, `listPlayers`, `buildLeaderboard`, `displayState`). Reste server component. Remplacer le fichier :

```tsx
// src/app/page.tsx
import Link from "next/link";

import { auth } from "@/lib/auth/config";
import { listMatches } from "@/lib/matches";
import { displayState } from "@/lib/match-view";
import { listAllBets } from "@/lib/bets";
import { listPlayers } from "@/lib/users";
import { buildLeaderboard } from "@/lib/leaderboard";
import { CoalitionBadge } from "@/components/coalition-badge";

// Points + matchs à venir évoluent en continu : rendu jamais figé.
export const dynamic = "force-dynamic";

const TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Zurich",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function Home() {
  const now = new Date();
  const [session, matches, players, bets] = await Promise.all([
    auth(),
    listMatches(),
    listPlayers(),
    listAllBets(),
  ]);

  const upcoming = matches
    .filter((m) => displayState(m, now) === "upcoming")
    .slice(0, 3);
  const top3 = buildLeaderboard(players, bets).slice(0, 3);
  const login = session?.user?.login ?? null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <section className="glass rise mb-6 p-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          42<span className="text-cyan">Bet</span>
        </h1>
        <p className="mt-2 text-zinc-400">
          Pronostics Coupe du Monde — École 42 Lausanne
        </p>
        {login ? (
          <p className="mt-3">
            Salut <strong>{login}</strong> 👋
          </p>
        ) : (
          <p className="mt-3 text-zinc-300">
            Connecte-toi avec ton compte 42 pour parier.
          </p>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="glass p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">
            Prochains matchs
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-zinc-500">Rien à venir.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {upcoming.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {m.home_team} <span className="text-zinc-500">—</span>{" "}
                    {m.away_team}
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-400">
                    {TIME_FMT.format(new Date(m.kickoff_at))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/matches"
            className="mt-3 inline-block text-sm text-accent hover:underline"
          >
            Voir tous les matchs →
          </Link>
        </section>

        <section className="glass p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-300">
            Top classement
          </h2>
          {top3.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucun pronostic.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {top3.map((e) => (
                <li key={e.login} className="flex items-center gap-2">
                  <span className="w-4 text-center font-bold tabular-nums text-accent">
                    {e.rank}
                  </span>
                  <Link
                    href={`/profile/${e.login}`}
                    className="flex-1 truncate font-medium hover:text-accent"
                  >
                    {e.login}
                  </Link>
                  <CoalitionBadge coalition={e.coalition} size="sm" />
                  <span className="shrink-0 font-semibold tabular-nums">
                    {e.points} pt
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/leaderboard"
            className="mt-3 inline-block text-sm text-accent hover:underline"
          >
            Voir le classement →
          </Link>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Vérifier**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: vert. Visuel : hero glass + 2 cartes (prochains matchs, top 3) avec liens.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): home enrichie — hero + prochains matchs + top classement"
```

---

## Task 10: Passe polish & vérification finale

**Files:**
- Modify (au besoin) : composants listés ci-dessous

- [ ] **Step 1: Micro-interactions cohérentes**

Vérifier que les cartes cliquables/liens ont une transition douce. Ajouter `transition-transform active:scale-[0.98]` aux boutons d'action restants si manquant. Confirmer que `.rise` est utilisé sur les sections de premier niveau de `/`, `/matches` (déjà ajouté Tasks 6 & 9) ; l'ajouter à `/leaderboard` et `/profile` sur le premier conteneur si l'effet manque (classe `rise` sur le `<main>` ou la première section).

- [ ] **Step 2: Vérifier `prefers-reduced-motion`**

Dans les devtools (Rendering → Emulate `prefers-reduced-motion: reduce`), confirmer que les animations `.rise` et transitions sont neutralisées (règle globale Task 1).

- [ ] **Step 3: Revue contraste & responsive**

Parcourir `/`, `/matches`, `/leaderboard`, `/profile/<login>` :
- Desktop (≥ md) : header sticky, pas de BottomNav.
- Mobile (< md) : BottomNav visible, header sans liens, contenu non masqué (padding-bottom OK).
- Texte sur verre lisible (cible AA), badges coalition lisibles.

- [ ] **Step 4: Vérification complète**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: **tout vert**, 75 tests passent.

- [ ] **Step 5: Commit (si des ajustements ont été faits)**

```bash
git add -A
git commit -m "polish(ui): micro-interactions, reduced-motion, revue responsive"
```

- [ ] **Step 6: Mettre à jour le handoff**

Marquer la refonte UI comme livrée dans `docs/handoff.md` (§2) et ajuster le backlog (§4 : home enrichie ✓). Commit :

```bash
git add docs/handoff.md
git commit -m "docs: refonte UI glassy livrée (handoff)"
```

---

## Notes de fin

- **Merge** : suivre AGENTS.md §8 (phase pré-déploiement) — branche feature `feat/ui-glassy`, self-review du diff, vérifs vertes, `git merge --no-ff` dans `main` en local.
- **Skills d'implémentation** disponibles si besoin de polish supplémentaire : `emil-design-eng`, `ui-ux-pro-max`.
- **Rien** dans ce plan ne touche `src/lib/**` (logique métier), les migrations, ou la couche data — uniquement présentation.
