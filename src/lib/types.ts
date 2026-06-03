// src/lib/types.ts
// Domain row/enum types — thin aliases over the generated Database types
// (src/lib/database.types.ts), so there is a single source of truth derived
// from the real schema. Regenerate database.types.ts with:
//   npx supabase gen types typescript --linked > src/lib/database.types.ts

import type { Enums, Tables } from "@/lib/database.types";

export type Coalition = Tables<"coalitions">;
export type User = Tables<"users">;
export type Match = Tables<"matches">;
export type Bet = Tables<"bets">;

export type MatchStatus = Enums<"match_status">;
