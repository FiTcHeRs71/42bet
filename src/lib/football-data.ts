// src/lib/football-data.ts
import "server-only";

import { requireEnv } from "@/lib/env";
import { ThrottledError } from "@/lib/sync";
import type { WorldCupMatchesResponse } from "@/lib/match-sync";

// World Cup competition code is `WC`. One global call per cron tick (never a
// per-match loop — skill football-data-sync rule #3 / anti-patterns).
const WC_MATCHES_URL = "https://api.football-data.org/v4/competitions/WC/matches";

export async function fetchWorldCupMatches(): Promise<WorldCupMatchesResponse> {
  const res = await fetch(WC_MATCHES_URL, {
    headers: { "X-Auth-Token": requireEnv("FOOTBALL_DATA_API_KEY") },
    cache: "no-store",
  });

  // Throttling: respect the API's reserve. We only make one request per tick,
  // so the practical action on exhaustion is to abort this tick cleanly.
  const available = res.headers.get("x-requests-available-minute");
  if (res.status === 429) {
    console.warn(`football-data: throttled (available=${available ?? "?"})`);
    throw new ThrottledError("football-data rate limit reached");
  }
  if (!res.ok) {
    throw new Error(`football-data: HTTP ${res.status}`);
  }

  return (await res.json()) as WorldCupMatchesResponse;
}
