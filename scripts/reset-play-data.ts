// scripts/reset-play-data.ts
// OUTIL DEV — jamais importé par l'app. Remet la base en « ardoise vierge » pour
// le lancement réel : supprime tous les matchs (les paris tombent en cascade),
// remet tous les total_points à 0, et reclasse les 3 testeurs sur leur coalition
// de cursus (l'exception piscine ayant été retirée — cf. Volet 1).
//
// Dry-run par défaut : affiche les compteurs et ce qui SERAIT fait, sans rien
// modifier. Passer `-- --yes` pour exécuter réellement. Un backup JSON horodaté
// est écrit dans backups/ AVANT toute écriture.
//
// Crée son PROPRE client service_role (n'importe PAS @/lib/supabase/server ni
// rien de `server-only`). Path alias @ résolus par tsx.
//
// Usage : npm run reset-play-data            (dry-run)
//         npm run reset-play-data -- --yes   (exécution réelle)

import { mkdirSync, writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import ws from "ws";

import type { Database } from "@/lib/database.types";

// Reclassement cursus des testeurs (ft_id vérifiés via l'API 42, cf. spec).
// login → ft_id de la coalition de CURSUS. sweinber est déjà sur 193 (no-op réel).
const CURSUS_TARGET: Record<string, number> = {
  ludebarn: 191, // House of Cores
  jturrel: 191, // House of Cores
  sweinber: 193, // House of Processes
};

const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as unknown as typeof WebSocket } },
);

async function counts() {
  const { count: matches } = await supabaseAdmin
    .from("matches")
    .select("*", { count: "exact", head: true });
  const { count: bets } = await supabaseAdmin
    .from("bets")
    .select("*", { count: "exact", head: true });
  const { data: pts } = await supabaseAdmin
    .from("users")
    .select("login, total_points")
    .gt("total_points", 0)
    .order("total_points", { ascending: false });
  return { matches: matches ?? 0, bets: bets ?? 0, usersWithPoints: pts ?? [] };
}

async function backup() {
  const [{ data: matches }, { data: bets }, { data: users }] = await Promise.all([
    supabaseAdmin.from("matches").select("*"),
    supabaseAdmin.from("bets").select("*"),
    supabaseAdmin.from("users").select("*"),
  ]);
  mkdirSync("backups", { recursive: true });
  const path = `backups/reset-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(path, JSON.stringify({ matches, bets, users }, null, 2));
  return path;
}

async function main() {
  const execute = process.argv.includes("--yes");

  const before = await counts();
  console.log("AVANT:", JSON.stringify(before, null, 2));

  if (!execute) {
    console.log("\n[DRY-RUN] Aucune modification. Avec --yes, le script ferait :");
    console.log(`  - delete from matches (${before.matches} matchs, ${before.bets} paris en cascade)`);
    console.log("  - update users set total_points = 0");
    console.log(`  - reclassement cursus : ${JSON.stringify(CURSUS_TARGET)}`);
    console.log("\nRelancer avec : npm run reset-play-data -- --yes");
    return;
  }

  const path = await backup();
  console.log(`\nBackup écrit : ${path}`);

  // 1. Supprimer tous les matchs ; les paris tombent en cascade.
  const { error: mErr } = await supabaseAdmin
    .from("matches")
    .delete()
    .not("id", "is", null);
  if (mErr) throw mErr;
  console.log("✓ matchs supprimés (paris en cascade)");

  // 2. Remettre tous les scores à 0.
  const { error: uErr } = await supabaseAdmin
    .from("users")
    .update({ total_points: 0 })
    .gt("total_points", 0);
  if (uErr) throw uErr;
  console.log("✓ total_points remis à 0");

  // 3. Reclasser les testeurs sur leur coalition de cursus.
  for (const [login, ftId] of Object.entries(CURSUS_TARGET)) {
    const { data: coal, error: cErr } = await supabaseAdmin
      .from("coalitions")
      .select("id, name")
      .eq("ft_id", ftId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!coal) {
      console.warn(`⚠️  coalition cursus ft_id=${ftId} introuvable — ${login} ignoré`);
      continue;
    }
    const { error: rErr } = await supabaseAdmin
      .from("users")
      .update({ coalition_id: coal.id })
      .eq("login", login);
    if (rErr) throw rErr;
    console.log(`✓ ${login} → ${coal.name} (cursus)`);
  }

  const after = await counts();
  console.log("\nAPRÈS:", JSON.stringify(after, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
