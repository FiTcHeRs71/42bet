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
