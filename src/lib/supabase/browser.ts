import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { requireEnv } from "@/lib/env";

/**
 * Browser Supabase client using the anon (publishable) key. Read-only access to
 * public data (leaderboard, matches, coalitions) enforced by RLS + grants.
 * Never touches the service_role key.
 */
export const supabaseBrowser = createClient<Database>(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
