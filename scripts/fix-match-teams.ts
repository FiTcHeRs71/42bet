// scripts/fix-match-teams.ts — OUTIL DEV. Renseigne les équipes d'un match KO
// dont l'affiche est connue avant que football-data.org ne l'ait résolue, et
// POSE le verrou teams_locked pour que le cron d'ingestion (upsert_matches) ne
// la réécrase plus en « À déterminer » au prochain passage.
//
// Dry-run par défaut. Passer --yes pour écrire. Backup avant écriture.
// Usage : node --env-file=.env.local --import tsx scripts/fix-match-teams.ts \
//           <fdId> "<home>" "<away>" [--home-crest URL] [--away-crest URL] [--yes]
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import type { Database } from "@/lib/database.types";

const db = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as unknown as typeof WebSocket } },
);

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const [fdArg, home, away] = process.argv.slice(2);
  const fdId = Number(fdArg);
  const execute = process.argv.includes("--yes");
  if (!Number.isInteger(fdId) || !home || !away) {
    console.error(
      'Usage: ... fix-match-teams.ts <fdId> "<home>" "<away>" [--home-crest URL] [--away-crest URL] [--yes]',
    );
    process.exit(1);
  }
  const homeCrest = flag("--home-crest") ?? null;
  const awayCrest = flag("--away-crest") ?? null;

  // 1. Match actuel.
  const { data: m, error: mErr } = await db
    .from("matches")
    .select("id, home_team, away_team, stage, status, teams_locked")
    .eq("football_data_id", fdId)
    .single();
  if (mErr) throw mErr;

  console.log(
    `MATCH #${fdId} [${m.stage ?? "?"}] : ${m.home_team} - ${m.away_team} → ${home} - ${away}`,
  );
  console.log(`teams_locked : ${m.teams_locked} → true`);

  if (!execute) {
    console.log("\n[DRY-RUN] Relancer avec --yes pour écrire.");
    return;
  }

  // 2. Backup AVANT écriture.
  mkdirSync("backups", { recursive: true });
  const path = `backups/teams-${fdId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(path, JSON.stringify({ match: m }, null, 2));
  console.log(`Backup : ${path}`);

  // 3. Renseigner les équipes et poser le verrou.
  const { error } = await db
    .from("matches")
    .update({
      home_team: home,
      away_team: away,
      home_crest_url: homeCrest,
      away_crest_url: awayCrest,
      teams_locked: true,
    })
    .eq("football_data_id", fdId);
  if (error) throw error;
  console.log("✓ équipes renseignées et verrou posé (teams_locked=true)");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
