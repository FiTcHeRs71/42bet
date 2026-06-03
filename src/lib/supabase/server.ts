import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { requireEnv } from "@/lib/env";

/**
 * Server-only Supabase client using the service_role key (bypasses RLS).
 *
 * NEVER import this from a "use client" component — the `server-only` import
 * above turns that into a build error, keeping the service_role key off the
 * client (AGENTS.md rule #3). Use it for all writes and for private reads
 * (e.g. `bets`), after verifying the NextAuth session.
 */
export const supabaseAdmin = createClient<Database>(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
