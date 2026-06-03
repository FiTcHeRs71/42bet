// src/lib/types.ts
// Database row types — field names mirror the SQL columns (snake_case) so they
// match exactly what supabase-js returns. Source of truth: supabase/migrations/.
// NOTE: src/lib/points.ts defines its own minimal camelCase Bet/MatchResult
// types for the pure scoring function — those are deliberately separate.

export type MatchStatus =
  | "scheduled"
  | "live"
  | "finished"
  | "postponed"
  | "cancelled";

export interface Coalition {
  id: string;
  ft_id: number;
  name: string;
  color: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  ft_id: number;
  login: string;
  avatar_url: string | null;
  coalition_id: string | null;
  total_points: number;
  created_at: string;
  updated_at: string;
}

export interface Match {
  id: string;
  football_data_id: number;
  home_team: string;
  away_team: string;
  home_crest_url: string | null;
  away_crest_url: string | null;
  stage: string | null;
  kickoff_at: string;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface BetRow {
  id: string;
  user_id: string;
  match_id: string;
  home_score: number;
  away_score: number;
  points_awarded: number | null;
  created_at: string;
  updated_at: string;
}
