// scripts/resync-coalition.ts
// OUTIL DEV — jamais importé par l'app. Force la coalition des chefs de piscine
// (cf. PISCINE_CHEFS dans @/lib/coalitions) sur leur coalition de piscine, sans
// attendre qu'ils se reconnectent. AUCUN appel API 42 : la cible vient de la map
// en dur. Idempotent : ré-exécuter laisse le même état.
//
// Crée son PROPRE client service_role (n'importe PAS @/lib/supabase/server ni
// @/lib/api-42, qui chargent `server-only` et lèveraient hors runtime Next).
// N'importe que la map pure PISCINE_CHEFS. Path alias @ résolus par tsx.
//
// Usage : npm run resync-coalition

import { createClient } from "@supabase/supabase-js";
import ws from "ws";

import type { Database } from "@/lib/database.types";
import { PISCINE_CHEFS } from "@/lib/coalitions";

// Node 20 has no native WebSocket — pass ws as transport so supabase-js
// doesn't throw at createClient() time (realtime is unused here).
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as unknown as typeof WebSocket } },
);

async function main() {
  for (const [login, piscineFtId] of Object.entries(PISCINE_CHEFS)) {
    // 1. uuid interne de la coalition de piscine cible.
    const { data: coal, error: cErr } = await supabaseAdmin
      .from("coalitions")
      .select("id, name")
      .eq("ft_id", piscineFtId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!coal) {
      console.warn(`⚠️  coalition ft_id=${piscineFtId} introuvable — ${login} ignoré`);
      continue;
    }

    // 2. état courant du joueur (pour logguer avant/après et l'idempotence).
    const { data: user, error: uErr } = await supabaseAdmin
      .from("users")
      .select("coalition_id")
      .eq("login", login)
      .maybeSingle();
    if (uErr) throw uErr;
    if (!user) {
      console.warn(`⚠️  user login=${login} introuvable — ignoré`);
      continue;
    }
    if (user.coalition_id === coal.id) {
      console.log(`✓ ${login} déjà sur ${coal.name} (rien à faire)`);
      continue;
    }

    // 3. bascule.
    const { error: upErr } = await supabaseAdmin
      .from("users")
      .update({ coalition_id: coal.id })
      .eq("login", login);
    if (upErr) throw upErr;
    console.log(`→ ${login} : ${user.coalition_id ?? "∅"} → ${coal.name} (${coal.id})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
