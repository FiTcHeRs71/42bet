// src/app/api/cron/sync-matches/route.ts
// Ingestion des fixtures CM depuis football-data.org vers la table `matches`.
// Pattern identique à sync-results : auth CRON_SECRET d'abord, I/O server-only,
// écriture atomique via la fonction Postgres upsert_matches.

import { fetchWorldCupMatches } from "@/lib/football-data";
import { parseMatchesForUpsert } from "@/lib/match-sync";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ThrottledError } from "@/lib/sync";

export const dynamic = "force-dynamic"; // never cache

export async function GET(req: Request) {
  // 1. Auth — checked first.
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Fetch (one global request per tick), tolérant au throttling.
  let res;
  try {
    res = await fetchWorldCupMatches();
  } catch (err) {
    if (err instanceof ThrottledError) {
      return Response.json({ ok: true, throttled: true });
    }
    throw err;
  }

  // 3. Parse pur → upsert atomique.
  const rows = parseMatchesForUpsert(res);
  const { data, error } = await supabaseAdmin.rpc("upsert_matches", {
    p_matches: rows,
  });
  if (error) throw error;

  return Response.json({ ok: true, ...(data as object) });
}
