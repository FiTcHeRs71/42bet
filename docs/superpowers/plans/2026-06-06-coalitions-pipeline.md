# Coalitions Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renseigner la coalition d'un joueur (`users.coalition_id`) et remplir la table `coalitions` à chaque connexion 42, en un seul appel API, sans cron ni batch.

**Architecture:** Trois briques dans l'esprit pur/I-O du projet : `pickUserCoalition` (pur), un wrapper `fetch42()` server-only (token applicatif caché + throttle ≤ 2 req/s + `Api42Error`), et une extension best-effort de `upsertPlayer` (DI via `UpsertDeps`) câblée dans la config NextAuth. Aucune migration : le schéma `coalitions` / `users.coalition_id` existe déjà.

**Tech Stack:** TypeScript strict, Next.js 16 (App Router), NextAuth v5, Supabase (service_role), Vitest. Spec : `docs/superpowers/specs/2026-06-06-coalitions-pipeline-design.md`.

---

## File Structure

- **Create** `src/lib/coalitions.ts` — `pickUserCoalition` (pur) + types `Ft42Coalition` / `CoalitionRef`.
- **Create** `tests/coalitions.test.ts` — tests de `pickUserCoalition`.
- **Create** `src/lib/api-42.ts` — `fetch42`, `Api42Error`, `getApi42Token`, `nextDelay` (server-only).
- **Create** `tests/api-42.test.ts` — tests de `nextDelay` (pur) + `fetch42` (fetch mické).
- **Modify** `src/lib/auth/upsert-player.ts` — étend `UpsertDeps`, ajoute la branche best-effort coalition.
- **Modify** `tests/auth-upsert-player.test.ts` — met à jour les deps + cas coalition.
- **Modify** `src/lib/auth/config.ts` — câble les implémentations réelles (fetch42 + supabaseAdmin).
- **Modify** `docs/api-42.md` — §4 : retirer « le wrapper n'existe pas encore ».

---

## Task 1: `pickUserCoalition` (fonction pure)

**Files:**
- Create: `src/lib/coalitions.ts`
- Test: `tests/coalitions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/coalitions.test.ts
import { describe, it, expect } from "vitest";

import { pickUserCoalition } from "@/lib/coalitions";

describe("pickUserCoalition", () => {
  it("returns null when the user has no coalition", () => {
    expect(pickUserCoalition([])).toBeNull();
  });

  it("normalises the first coalition", () => {
    expect(
      pickUserCoalition([
        { id: 42, name: "The Order", color: "#3fb27f", image_url: "https://x/o.svg" },
        { id: 99, name: "The Alliance", color: "#9b3fb2", image_url: null },
      ]),
    ).toEqual({
      ftId: 42,
      name: "The Order",
      color: "#3fb27f",
      imageUrl: "https://x/o.svg",
    });
  });

  it("falls back to a neutral colour when color is missing", () => {
    expect(pickUserCoalition([{ id: 7, name: "No Colour" }])).toEqual({
      ftId: 7,
      name: "No Colour",
      color: "#64748b",
      imageUrl: null,
    });
  });

  it("treats empty/whitespace color as missing", () => {
    expect(pickUserCoalition([{ id: 7, name: "X", color: "  " }])?.color).toBe(
      "#64748b",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coalitions.test.ts`
Expected: FAIL — `pickUserCoalition` not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/coalitions.ts
// Pur : sélectionne et normalise la coalition d'un joueur depuis la réponse
// GET /v2/users/:id/coalitions de l'API 42. Aucun I/O, aucun import server-only.

/** Sous-ensemble utile d'un élément de GET /v2/users/:id/coalitions. */
export interface Ft42Coalition {
  id: number;
  name: string;
  color?: string | null;
  image_url?: string | null;
}

/** Coalition normalisée, prête à upserter dans public.coalitions. */
export interface CoalitionRef {
  ftId: number;
  name: string;
  color: string; // fallback gris neutre si l'API ne fournit rien
  imageUrl: string | null;
}

/** Couleur neutre lisible (slate-500) quand l'intra ne renvoie pas de couleur. */
const FALLBACK_COLOR = "#64748b";

/** Prend la première coalition (ou null si le joueur n'en a aucune). */
export function pickUserCoalition(raw: Ft42Coalition[]): CoalitionRef | null {
  const first = raw[0];
  if (!first) return null;
  const color = first.color?.trim() ? first.color.trim() : FALLBACK_COLOR;
  return {
    ftId: first.id,
    name: first.name,
    color,
    imageUrl: first.image_url ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/coalitions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coalitions.ts tests/coalitions.test.ts
git commit -m "feat(coalitions): pickUserCoalition pur (normalise /v2/users/:id/coalitions)"
```

---

## Task 2: wrapper `fetch42()` + `Api42Error` + throttle

**Files:**
- Create: `src/lib/api-42.ts`
- Test: `tests/api-42.test.ts`

> Note : `nextDelay` est exportée pour être testée **purement** (la logique de
> timing est le point risqué) ; le câblage `setTimeout` n'est pas testé.

- [ ] **Step 1: Write the failing test**

```ts
// tests/api-42.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { nextDelay } from "@/lib/api-42";

function tokenResponse(token: string) {
  return new Response(JSON.stringify({ access_token: token, expires_in: 7200 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
/** Recharge le module pour repartir d'un cache token / throttle vierge. */
async function loadFresh() {
  vi.resetModules();
  return import("@/lib/api-42");
}

beforeEach(() => {
  process.env.FT_API_UID = "uid";
  process.env.FT_API_SECRET = "secret";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nextDelay (pur)", () => {
  it("0 quand jamais envoyé", () => {
    expect(nextDelay(null, 1000, 500)).toBe(0);
  });
  it("0 quand l'intervalle est écoulé", () => {
    expect(nextDelay(0, 600, 500)).toBe(0);
  });
  it("le reste quand c'est trop tôt", () => {
    expect(nextDelay(1000, 1200, 500)).toBe(300);
  });
});

describe("fetch42", () => {
  it("rejette les chemins hors /v2/", async () => {
    const { fetch42 } = await loadFresh();
    await expect(fetch42("/v3/nope")).rejects.toThrow(/\/v2\//);
  });

  it("lève Api42Error sur statut non-2xx", async () => {
    const { fetch42, Api42Error } = await loadFresh();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(tokenResponse("t"))
        .mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500)),
    );
    await expect(fetch42("/v2/coalitions")).rejects.toBeInstanceOf(Api42Error);
  });

  it("envoie le bearer token et renvoie le JSON parsé", async () => {
    const { fetch42 } = await loadFresh();
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("tok-xyz"))
      .mockResolvedValueOnce(jsonResponse([{ id: 1, name: "Order" }]));
    vi.stubGlobal("fetch", f);
    const data = await fetch42<{ id: number; name: string }[]>(
      "/v2/users/42/coalitions",
    );
    expect(data).toEqual([{ id: 1, name: "Order" }]);
    const headers = (f.mock.calls[1][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer tok-xyz");
  });

  it("réutilise le token caché sur plusieurs appels", async () => {
    const { fetch42 } = await loadFresh();
    const f = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("t1"))
      .mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", f);
    await fetch42("/v2/coalitions");
    await fetch42("/v2/coalitions");
    const tokenCalls = f.mock.calls.filter((c) =>
      String(c[0]).includes("/oauth/token"),
    );
    expect(tokenCalls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/api-42.test.ts`
Expected: FAIL — module `@/lib/api-42` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/api-42.ts
// Wrapper standard de l'API 42 (skill 42api-fetch). Server-only : la clé secret
// OAuth ne doit jamais fuiter côté client. Token applicatif (client_credentials)
// caché en mémoire, throttle ≤ 2 req/s, erreurs typées Api42Error.
import "server-only";

import { requireEnv } from "@/lib/env";

const BASE = "https://api.intra.42.fr";
const MIN_INTERVAL_MS = 500; // 2 req/s

export class Api42Error extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API 42 error ${status}`);
    this.name = "Api42Error";
  }
}

/** Pur : ms à attendre avant la prochaine requête (throttle). */
export function nextDelay(
  lastSentAt: number | null,
  now: number,
  minIntervalMs: number = MIN_INTERVAL_MS,
): number {
  if (lastSentAt === null) return 0;
  const elapsed = now - lastSentAt;
  return elapsed >= minIntervalMs ? 0 : minIntervalMs - elapsed;
}

let tokenCache: { token: string; expiresAt: number } | null = null;
let lastSentAt: number | null = null;
let queue: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Token applicatif client_credentials, caché (~2h) avec marge de sécurité. */
async function getApi42Token(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;
  const res = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: requireEnv("FT_API_UID"),
      client_secret: requireEnv("FT_API_SECRET"),
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Api42Error(res.status, await res.text());
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return tokenCache.token;
}

/** Appel bas niveau : sérialise + throttle ≤ 2 req/s + auth + typage d'erreur. */
export async function fetch42<T>(path: string, init?: RequestInit): Promise<T> {
  if (!path.startsWith("/v2/")) {
    throw new Error(`fetch42: le chemin doit commencer par /v2/ (reçu ${path})`);
  }
  const run = queue.then(async () => {
    const wait = nextDelay(lastSentAt, Date.now());
    if (wait > 0) await sleep(wait);
    const token = await getApi42Token();
    lastSentAt = Date.now();
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Api42Error(res.status, await res.text());
    return (await res.json()) as T;
  });
  // Garde la chaîne vivante même si un appel échoue (ne bloque pas les suivants).
  queue = run.catch(() => undefined);
  return run as Promise<T>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/api-42.test.ts`
Expected: PASS (7 tests). Le test « token caché » dure ~0,5 s (throttle réel), normal.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-42.ts tests/api-42.test.ts
git commit -m "feat(api-42): wrapper fetch42 (token applicatif caché + throttle 2 req/s + Api42Error)"
```

---

## Task 3: extension best-effort de `upsertPlayer`

**Files:**
- Modify: `src/lib/auth/upsert-player.ts`
- Test: `tests/auth-upsert-player.test.ts`

- [ ] **Step 1: Write the failing test (remplace tout le fichier)**

```ts
// tests/auth-upsert-player.test.ts
import { describe, it, expect, vi } from "vitest";

import { upsertPlayer, type UpsertDeps } from "@/lib/auth/upsert-player";

const profile = {
  ftId: 42,
  login: "fducrot",
  avatarUrl: "https://cdn.intra.42.fr/users/fducrot.jpg",
};

/** Deps par défaut : upsert OK, aucune coalition. */
function baseDeps(over: Partial<UpsertDeps> = {}): UpsertDeps {
  return {
    upsertUser: vi.fn().mockResolvedValue({ error: null }),
    fetchUserCoalitions: vi.fn().mockResolvedValue([]),
    upsertCoalition: vi.fn().mockResolvedValue({ id: null, error: null }),
    setCoalition: vi.fn().mockResolvedValue({ error: null }),
    ...over,
  };
}

describe("upsertPlayer", () => {
  it("passes a snake_case row to the injected upsert", async () => {
    const deps = baseDeps();
    await upsertPlayer(profile, deps);
    expect(deps.upsertUser).toHaveBeenCalledWith({
      ft_id: 42,
      login: "fducrot",
      avatar_url: "https://cdn.intra.42.fr/users/fducrot.jpg",
    });
  });

  it("throws (mentioning the login) when the user upsert returns an error", async () => {
    const deps = baseDeps({
      upsertUser: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
    });
    await expect(upsertPlayer(profile, deps)).rejects.toThrow(/fducrot/);
  });

  it("upserts the coalition then links it to the player", async () => {
    const deps = baseDeps({
      fetchUserCoalitions: vi
        .fn()
        .mockResolvedValue([{ id: 7, name: "Order", color: "#3fb27f" }]),
      upsertCoalition: vi.fn().mockResolvedValue({ id: "coal-uuid", error: null }),
    });
    await upsertPlayer(profile, deps);
    expect(deps.upsertCoalition).toHaveBeenCalledWith({
      ftId: 7,
      name: "Order",
      color: "#3fb27f",
      imageUrl: null,
    });
    expect(deps.setCoalition).toHaveBeenCalledWith(42, "coal-uuid");
  });

  it("does not touch coalition when the player has none", async () => {
    const deps = baseDeps();
    await upsertPlayer(profile, deps);
    expect(deps.upsertCoalition).not.toHaveBeenCalled();
    expect(deps.setCoalition).not.toHaveBeenCalled();
  });

  it("never fails login when the coalition fetch throws", async () => {
    const deps = baseDeps({
      fetchUserCoalitions: vi.fn().mockRejectedValue(new Error("42 api down")),
    });
    await expect(upsertPlayer(profile, deps)).resolves.toBeUndefined();
    expect(deps.upsertUser).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/auth-upsert-player.test.ts`
Expected: FAIL — `UpsertDeps` n'a pas encore `fetchUserCoalitions` / la branche coalition n'existe pas.

- [ ] **Step 3: Write the implementation (remplace tout le fichier)**

```ts
// src/lib/auth/upsert-player.ts
// Persistance de la fiche joueur via injection de dépendances : aucune
// référence directe à Supabase ici, donc testable avec des fakes. L'appelant
// (config NextAuth) fournit les implémentations réelles (supabaseAdmin + fetch42).
// L'assignation de coalition est BEST-EFFORT : elle ne casse jamais le login.

import type { PlayerProfile } from "@/lib/auth/profile";
import {
  pickUserCoalition,
  type CoalitionRef,
  type Ft42Coalition,
} from "@/lib/coalitions";

/** Ligne `public.users` que l'on insère/maj (colonnes générées snake_case). */
export interface PlayerRow {
  ft_id: number;
  login: string;
  avatar_url: string | null;
}

export interface UpsertDeps {
  /** Upsert on conflict (ft_id). Renvoie l'erreur Postgrest éventuelle. */
  upsertUser(row: PlayerRow): Promise<{ error: unknown }>;
  /** GET /v2/users/:id/coalitions (token applicatif). */
  fetchUserCoalitions(ftId: number): Promise<Ft42Coalition[]>;
  /** Upsert la coalition (on conflict ft_id) et renvoie son uuid interne. */
  upsertCoalition(ref: CoalitionRef): Promise<{ id: string | null; error: unknown }>;
  /** Lie la coalition au joueur (update users.coalition_id by ft_id). */
  setCoalition(ftId: number, coalitionId: string): Promise<{ error: unknown }>;
}

export async function upsertPlayer(
  profile: PlayerProfile,
  deps: UpsertDeps,
): Promise<void> {
  const { error } = await deps.upsertUser({
    ft_id: profile.ftId,
    login: profile.login,
    avatar_url: profile.avatarUrl,
  });
  if (error) {
    throw new Error(`Failed to upsert player ${profile.login}`);
  }

  // Best-effort : un échec coalition n'altère jamais le succès du login.
  try {
    const raw = await deps.fetchUserCoalitions(profile.ftId);
    const ref = pickUserCoalition(raw);
    if (!ref) return;

    const { id, error: upsertErr } = await deps.upsertCoalition(ref);
    if (upsertErr || !id) {
      console.warn(`coalition upsert failed for ${profile.login}`);
      return;
    }

    const { error: linkErr } = await deps.setCoalition(profile.ftId, id);
    if (linkErr) console.warn(`coalition link failed for ${profile.login}`);
  } catch (err) {
    console.warn(`coalition sync skipped for ${profile.login}:`, err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/auth-upsert-player.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/upsert-player.ts tests/auth-upsert-player.test.ts
git commit -m "feat(coalitions): assignation best-effort de la coalition dans upsertPlayer"
```

---

## Task 4: câblage des deps réelles dans `config.ts`

**Files:**
- Modify: `src/lib/auth/config.ts`

> Module `server-only` câblant l'I/O réel — non testé unitairement (plomberie).
> Filet : `typecheck` + `lint` + `build`.

- [ ] **Step 1: Mettre à jour les imports**

Dans `src/lib/auth/config.ts`, sous les imports existants, ajouter :

```ts
import { fetch42 } from "@/lib/api-42";
import type { Ft42Coalition } from "@/lib/coalitions";
```

- [ ] **Step 2: Remplacer l'objet `upsertDeps`**

Remplacer le bloc :

```ts
const upsertDeps: UpsertDeps = {
  async upsertUser(row) {
    const { error } = await supabaseAdmin
      .from("users")
      .upsert(row, { onConflict: "ft_id" });
    return { error };
  },
};
```

par :

```ts
const upsertDeps: UpsertDeps = {
  async upsertUser(row) {
    const { error } = await supabaseAdmin
      .from("users")
      .upsert(row, { onConflict: "ft_id" });
    return { error };
  },
  async fetchUserCoalitions(ftId) {
    return fetch42<Ft42Coalition[]>(`/v2/users/${ftId}/coalitions`);
  },
  async upsertCoalition(ref) {
    const { data, error } = await supabaseAdmin
      .from("coalitions")
      .upsert(
        {
          ft_id: ref.ftId,
          name: ref.name,
          color: ref.color,
          image_url: ref.imageUrl,
        },
        { onConflict: "ft_id" },
      )
      .select("id")
      .single();
    return { id: data?.id ?? null, error };
  },
  async setCoalition(ftId, coalitionId) {
    const { error } = await supabaseAdmin
      .from("users")
      .update({ coalition_id: coalitionId })
      .eq("ft_id", ftId);
    return { error };
  },
};
```

- [ ] **Step 3: Vérifier les gates**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: aucune erreur (les 2 crons toujours enregistrés au build).

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/config.ts
git commit -m "feat(coalitions): câble fetch42 + upsert coalition dans la config NextAuth"
```

---

## Task 5: mise à jour de la doc

**Files:**
- Modify: `docs/api-42.md`

- [ ] **Step 1: Remplacer le §4**

Dans `docs/api-42.md`, remplacer le titre et le 1er paragraphe du §4 :

```markdown
## 4. Pas (encore) implémenté : le wrapper `fetch42()`

La skill [`42api-fetch`](../skills/42api-fetch/SKILL.md) décrit un wrapper
`fetch42()` **server-only, rate-limité (2 req/s), token applicatif**, à utiliser
pour tout appel « au nom de l'app ». **Ce wrapper n'existe pas encore** dans le
code (`src/lib/api-42.ts` est absent) parce qu'aucune feature n'en a eu besoin :
l'auth passe par NextAuth.
```

par :

```markdown
## 4. Le wrapper `fetch42()` (token applicatif)

`src/lib/api-42.ts` implémente `fetch42<T>(path)` (server-only) conforme à la
skill [`42api-fetch`](../skills/42api-fetch/SKILL.md) : token applicatif
`client_credentials` caché en mémoire (~2h), throttle ≤ 2 req/s (`nextDelay`
pur + queue), erreurs typées `Api42Error`. Premier usage : le **pipeline
coalitions** (assignation au sign-in, cf. `auth/upsert-player.ts`).

Endpoint utilisé : `GET /v2/users/:id/coalitions` (récupère la coalition du
joueur connecté ; sert aussi à remplir la table `coalitions`).

Pas encore implémenté (YAGNI, backlog) : `fetch42Paginated`,
`GET /v2/coalitions` (coalitions sans joueur), batch `/v2/campus/33/users`.
```

- [ ] **Step 2: Nettoyer la table des futurs endpoints**

Dans la table « Endpoint visé » du §4, **supprimer la ligne
`GET /v2/users/:id/coalitions`** (désormais *utilisé*, mentionné dans le
paragraphe ci-dessus). Conserver les lignes `GET /v2/coalitions` et
`GET /v2/campus/:campus_id/users` (toujours au backlog).

- [ ] **Step 3: Commit**

```bash
git add docs/api-42.md
git commit -m "docs(api-42): fetch42 livré (pipeline coalitions)"
```

---

## Final verification

- [ ] `npm test` → tous verts (86 existants + nouveaux).
- [ ] `npm run typecheck` → 0 erreur.
- [ ] `npm run lint` → 0 erreur.
- [ ] `npm run build` → OK, 2 crons enregistrés.
- [ ] Ouvrir une PR `feat/coalitions-pipeline` → `main` (template `pr-template`), review croisée, merge squash.

---

## Self-review (rempli par l'auteur du plan)

- **Spec coverage** : fetch42 (T2) ✓ · pickUserCoalition (T1) ✓ · intégration best-effort (T3) ✓ · câblage réel (T4) ✓ · gestion d'erreur best-effort (T3 test + impl) ✓ · tests des 3 unités (T1/T2/T3) ✓ · critère doc §8.5 (T5) ✓. Pas de migration (schéma existant) — conforme spec §3.3.
- **Placeholders** : aucun — chaque step contient le code/commande réels.
- **Type consistency** : `UpsertDeps` (T3) = `{ upsertUser, fetchUserCoalitions, upsertCoalition, setCoalition }` réutilisé tel quel en T4 ; `CoalitionRef`/`Ft42Coalition` (T1) consommés en T3/T4 ; `fetch42<T>` (T2) appelé en T4. `nextDelay(lastSentAt, now, minIntervalMs)` cohérent test/impl.
