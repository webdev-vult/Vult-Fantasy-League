import type { Database as Phase8Database, Json } from "@/types/database-phase8";

/**
 * Winner-workflow-aware database contract generated from the connected
 * Supabase project after the Phase 9 migrations. Earlier phase contracts stay
 * intact so schema evolution remains reviewable.
 */

type WinnerCandidateRow = {
  candidate_order: number | null;
  competition_review_notes: string | null;
  competition_review_status: string;
  competition_reviewed_at: string | null;
  competition_reviewed_by: string | null;
  competition_season_id: string;
  compliance_review_notes: string | null;
  compliance_review_status: string;
  compliance_reviewed_at: string | null;
  compliance_reviewed_by: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  display_name_snapshot: string | null;
  eligibility_status: string;
  eligibility_summary: Json;
  generated_at: string;
  generation_run_id: string | null;
  id: string;
  is_current: boolean;
  monthly_period_id: string | null;
  prize_id: string | null;
  prize_position: number | null;
  prize_snapshot: Json;
  provider_entry_id_snapshot: string | null;
  publication_readiness_note: string | null;
  publication_ready: boolean;
  publicity_consent: boolean;
  rank: number;
  registration_id: string;
  rejection_reason: string | null;
  replaced_by_candidate_id: string | null;
  replacement_for_candidate_id: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  round_id: string | null;
  rules_version: number;
  scope: string | null;
  score: number;
  source_monthly_score_id: string | null;
  source_round_score_id: string | null;
  source_season_score_id: string | null;
  status: string;
  team_name_snapshot: string | null;
  tie_break_values: Json;
  updated_at: string;
};

type WinnerCandidateInsert = Partial<WinnerCandidateRow> &
  Pick<
    WinnerCandidateRow,
    "competition_season_id" | "registration_id" | "rules_version" | "score"
  >;

type WinnerGenerationRunRow = {
  competition_season_id: string;
  completed_at: string | null;
  created_at: string;
  eligible_row_count: number;
  error_summary: string | null;
  excluded_row_count: number;
  generated_by: string;
  generated_candidate_count: number;
  id: string;
  metadata: Json;
  monthly_period_id: string | null;
  prize_id: string;
  repeat_weekly_winners_allowed: boolean;
  review_row_count: number;
  round_id: string | null;
  rules_version: number;
  scope: string;
  source_row_count: number;
  started_at: string;
  status: string;
  tie_breakers: Json;
  updated_at: string;
};

type WinnerGenerationRunInsert = Partial<WinnerGenerationRunRow> &
  Pick<
    WinnerGenerationRunRow,
    | "competition_season_id"
    | "generated_by"
    | "prize_id"
    | "rules_version"
    | "scope"
  >;

type WinnerEvaluationRow = {
  checks: Json;
  created_at: string;
  display_name: string;
  eligibility_status: string;
  evaluated_at: string;
  fpl_verified_at: string | null;
  gameweeks_counted: number;
  generation_run_id: string;
  id: string;
  provider_entry_id: string | null;
  provider_total_points: number;
  registered_at: string;
  registration_id: string;
  score: number;
  selected_candidate_id: string | null;
  selection_order: number | null;
  source_monthly_score_id: string | null;
  source_rank: number;
  source_round_score_id: string | null;
  source_season_score_id: string | null;
  team_name: string | null;
  tie_break_values: Json;
  transfer_cost: number;
  weekly_eligible: boolean;
};

type WinnerEvaluationInsert = Partial<WinnerEvaluationRow> &
  Pick<
    WinnerEvaluationRow,
    | "display_name"
    | "eligibility_status"
    | "generation_run_id"
    | "registered_at"
    | "registration_id"
    | "score"
    | "source_rank"
  >;

type WinnerCheckRow = {
  candidate_id: string;
  check_code: string;
  check_status: string;
  details: Json;
  evaluated_at: string;
  id: number;
  is_required: boolean;
  summary: string;
};

type WinnerCheckInsert = Partial<WinnerCheckRow> &
  Pick<WinnerCheckRow, "candidate_id" | "check_code" | "check_status" | "summary">;

type WinnerHistoryRow = {
  action: string;
  actor_user_id: string | null;
  candidate_id: string;
  created_at: string;
  from_status: string | null;
  id: number;
  metadata: Json;
  notes: string | null;
  to_status: string;
};

type WinnerHistoryInsert = Partial<WinnerHistoryRow> &
  Pick<WinnerHistoryRow, "action" | "candidate_id" | "to_status">;

type Phase9Tables = {
  winner_candidates: {
    Row: WinnerCandidateRow;
    Insert: WinnerCandidateInsert;
    Update: Partial<WinnerCandidateRow>;
    Relationships: [];
  };
  winner_generation_runs: {
    Row: WinnerGenerationRunRow;
    Insert: WinnerGenerationRunInsert;
    Update: Partial<WinnerGenerationRunRow>;
    Relationships: [];
  };
  winner_generation_evaluations: {
    Row: WinnerEvaluationRow;
    Insert: WinnerEvaluationInsert;
    Update: Partial<WinnerEvaluationRow>;
    Relationships: [];
  };
  winner_candidate_checks: {
    Row: WinnerCheckRow;
    Insert: WinnerCheckInsert;
    Update: Partial<WinnerCheckRow>;
    Relationships: [];
  };
  winner_candidate_status_history: {
    Row: WinnerHistoryRow;
    Insert: WinnerHistoryInsert;
    Update: Partial<WinnerHistoryRow>;
    Relationships: [];
  };
};

type Phase9Functions = {
  competition_review_winner_candidate: {
    Args: {
      p_candidate_id: string;
      p_decision: string;
      p_notes: string;
      p_requested_by: string;
    };
    Returns: string;
  };
  compliance_review_winner_candidate: {
    Args: {
      p_candidate_id: string;
      p_decision: string;
      p_notes: string;
      p_requested_by: string;
    };
    Returns: string;
  };
  confirm_winner_candidate: {
    Args: {
      p_candidate_id: string;
      p_notes: string;
      p_requested_by: string;
    };
    Returns: string;
  };
  generate_winner_candidate: {
    Args: {
      p_competition_season_id: string;
      p_monthly_period_id: string | null;
      p_prize_id: string;
      p_requested_by: string;
      p_round_id: string | null;
      p_scope: string;
    };
    Returns: string;
  };
  replace_winner_candidate: {
    Args: {
      p_candidate_id: string;
      p_reason: string;
      p_requested_by: string;
    };
    Returns: string;
  };
};

type Phase8Public = Phase8Database["public"];

export type Database = Omit<Phase8Database, "public"> & {
  public: Omit<Phase8Public, "Tables" | "Functions"> & {
    Tables: Omit<Phase8Public["Tables"], keyof Phase9Tables> & Phase9Tables;
    Functions: Omit<Phase8Public["Functions"], keyof Phase9Functions> &
      Phase9Functions;
  };
};

export type { Json } from "@/types/database-phase8";
