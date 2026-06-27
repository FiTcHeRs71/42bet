// scripts/fix-match-score.ts — OUTIL DEV jetable. Corrige un score erroné déjà
// scoré en prod, de façon sûre et idempotente : backup → annule l'ancien scoring
// (points_awarded = NULL + décrémente les totaux) → rappelle le VRAI RPC
// score_match avec le bon score (re-score + re-bump propre, logique testée).
//
// Dry-run par défaut. Passer `-- --yes` pour exécuter.
// Usage : node --env-file=.env.local --import tsx scripts/fix-match-score.ts <fdId> <home> <away> [--yes]
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import type { Database } from "@/lib/database.types";
import { scoreBets, type BetRow } from "@/lib/sync";

const db = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as unknown as typeof WebSocket } },
);

async function main() {
  const [fdArg, hArg, aArg] = process.argv.slice(2);
  const fdId = Number(fdArg);
  const home = Number(hArg);
  const away = Number(aArg);
  const execute = process.argv.includes("--yes");
  if (![fdId, home, away].every(Number.isInteger)) {
    console.error("Usage: ... fix-match-score.ts <fdId> <home> <away> [--yes]");
    process.exit(1);
  }

  // 1. Match + paris actuels.
  const { data: m, error: mErr } = await db
    .from("matches")
    .select("id, home_team, away_team, home_score, away_score, status")
    .eq("football_data_id", fdId)
    .single();
  if (mErr) throw mErr;
  const { data: bets, error: bErr } = await db
    .from("bets")
    .select("id, user_id, home_score, away_score, points_awarded")
    .eq("match_id", m.id);
  if (bErr) throw bErr;

  // 2. Ancien total de points par user (à retrancher).
  const oldByUser: Record<string, number> = {};
  for (const b of bets ?? []) {
    const p = b.points_awarded ?? 0;
    if (p) oldByUser[b.user_id] = (oldByUser[b.user_id] ?? 0) + p;
  }
  const newScored = scoreBets((bets ?? []) as BetRow[], { homeScore: home, awayScore: away });

  console.log(`MATCH ${m.home_team}-${m.away_team} : ${m.home_score}-${m.away_score} → ${home}-${away}`);
  console.log(`Paris : ${bets?.length ?? 0} | ancien total ${Object.values(oldByUser).reduce((a, b) => a + b, 0)} → nouveau ${newScored.reduce((a, s) => a + s.points, 0)}`);

  if (!execute) {
    console.log("\n[DRY-RUN] Relancer avec --yes pour écrire.");
    return;
  }

  // 3. Backup AVANT toute écriture.
  const userIds = [...new Set((bets ?? []).map((b) => b.user_id))];
  const { data: usersBefore } = await db
    .from("users")
    .select("id, login, total_points")
    .in("id", userIds);
  mkdirSync("backups", { recursive: true });
  const path = `backups/fix-${fdId}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(path, JSON.stringify({ match: m, bets, usersBefore }, null, 2));
  console.log(`Backup : ${path}`);

  // 4. Annuler l'ancien scoring : décrémenter les totaux, remettre points_awarded à NULL.
  for (const [userId, oldPts] of Object.entries(oldByUser)) {
    const u = usersBefore?.find((x) => x.id === userId);
    const next = (u?.total_points ?? 0) - oldPts;
    const { error } = await db.from("users").update({ total_points: next }).eq("id", userId);
    if (error) throw error;
  }
  const { error: resetErr } = await db
    .from("bets")
    .update({ points_awarded: null })
    .eq("match_id", m.id);
  if (resetErr) throw resetErr;
  console.log("✓ ancien scoring annulé (points_awarded=NULL, totaux décrémentés)");

  // 5. Re-scorer proprement via le VRAI RPC (atomique, testé, idempotent) ET
  //    poser le verrou (p_lock) pour que le cron ne réécrive plus ce score
  //    corrigé avec la valeur erronée de l'API au prochain passage.
  const { data, error } = await db.rpc("score_match", {
    p_fd_id: fdId,
    p_home: home,
    p_away: away,
    p_scored: newScored.map((s) => ({ bet_id: s.betId, points: s.points })),
    p_lock: true,
  });
  if (error) throw error;
  console.log("✓ score_match (verrouillé) :", JSON.stringify(data));
}
main().catch((e) => { console.error(e); process.exit(1); });
