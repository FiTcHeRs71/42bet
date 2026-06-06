// scripts/simulate-score.ts
// OUTIL DEV — jamais importé par l'app. Simule l'attribution de points sur un
// match en appelant le VRAI RPC Postgres score_match (persistance + idempotence
// réelles). Réutilise scoreBets (logique de points centralisée, AGENTS.md §7).
//
// Crée son PROPRE client service_role (n'importe PAS @/lib/supabase/server, qui
// charge `server-only` et lèverait hors runtime Next). N'importe que de la
// logique pure (scoreBets) + les types. Path alias @ résolus par tsx (tsconfig).
//
// Usage : npm run simulate-score -- <footballDataId> <home> <away>
//   ex.  npm run simulate-score -- 537327 2 1

import { createClient } from "@supabase/supabase-js";
import ws from "ws";

import type { Database } from "@/lib/database.types";
import { scoreBets, type BetRow } from "@/lib/sync";

// Node 20 has no native WebSocket — pass ws as transport so supabase-js
// doesn't throw at createClient() time (realtime is unused here).
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as unknown as typeof WebSocket } },
);

async function main() {
  const [fdArg, homeArg, awayArg] = process.argv.slice(2);
  const fdId = Number(fdArg);
  const home = Number(homeArg);
  const away = Number(awayArg);

  if (![fdId, home, away].every(Number.isInteger)) {
    console.error(
      "Usage: npm run simulate-score -- <footballDataId> <home> <away>",
    );
    process.exit(1);
  }

  // 1. Retrouver le match par son id football-data.
  const { data: match, error: mErr } = await supabaseAdmin
    .from("matches")
    .select("id, home_team, away_team")
    .eq("football_data_id", fdId)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!match) {
    console.error(`Match football_data_id=${fdId} introuvable.`);
    process.exit(1);
  }

  // 2. Charger les paris non encore scorés (même requête que le cron réel).
  const { data: bets, error: bErr } = await supabaseAdmin
    .from("bets")
    .select("id, user_id, home_score, away_score")
    .eq("match_id", match.id)
    .is("points_awarded", null);
  if (bErr) throw bErr;

  // 3. Calculer les points (logique centralisée) puis appeler le vrai RPC.
  const scored = scoreBets((bets ?? []) as BetRow[], {
    homeScore: home,
    awayScore: away,
  });
  const { data, error } = await supabaseAdmin.rpc("score_match", {
    p_fd_id: fdId,
    p_home: home,
    p_away: away,
    p_scored: scored.map((s) => ({ bet_id: s.betId, points: s.points })),
  });
  if (error) throw error;

  console.log(`Match : ${match.home_team} – ${match.away_team} → ${home}-${away}`);
  console.log(`Paris à scorer : ${scored.length}`);
  console.table(scored);
  console.log("Résultat score_match :", data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
