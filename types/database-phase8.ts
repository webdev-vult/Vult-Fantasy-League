import type { Database as Phase7Database, Json } from "@/types/database-phase7";

/**
 * Score and leaderboard-aware database contract generated from the connected
 * Supabase project after the Phase 8 migrations. Earlier phase contracts stay
 * intact so schema evolution remains reviewable.
 */

type RoundScoreTable = {
  Row: {
    chip_used: string | null;
    correction_count: number;
    created_at: string;
    effective_points: number;
    eligibility_note: string | null;
    finalised_at: string | null;
    id: string;
    is_provisional: boolean;
    overall_rank: number | null;
    promoted_at: string | null;
    promoted_by: string | null;
    registration_id: string;
    reported_points: number;
    round_id: string;
    round_rank: number | null;
    rules_version: number;
    score_status: string;
    source_provider_record_id: string | null;
    source_snapshot_id: string | null;
    total_points: number;
    transfer_cost: number;
    updated_at: string;
    weekly_eligible: boolean;
  };
  Insert: {
    chip_used?: string | null;
    correction_count?: number;
    created_at?: string;
    effective_points?: number;
    eligibility_note?: string | null;
    finalised_at?: string | null;
    id?: string;
    is_provisional?: boolean;
    overall_rank?: number | null;
    promoted_at?: string | null;
    promoted_by?: string | null;
    registration_id: string;
    reported_points?: number;
    round_id: string;
    round_rank?: number | null;
    rules_version?: number;
    score_status?: string;
    source_provider_record_id?: string | null;
    source_snapshot_id?: string | null;
    total_points?: number;
    transfer_cost?: number;
    updated_at?: string;
    weekly_eligible?: boolean;
  };
  Update: {
    chip_used?: string | null;
    correction_count?: number;
    created_at?: string;
    effective_points?: number;
    eligibility_note?: string | null;
    finalised_at?: string | null;
    id?: string;
    is_provisional?: boolean;
    overall_rank?: number | null;
    promoted_at?: string | null;
    promoted_by?: string | null;
    registration_id?: string;
    reported_points?: number;
    round_id?: string;
    round_rank?: number | null;
    rules_version?: number;
    score_status?: string;
    source_provider_record_id?: string | null;
    source_snapshot_id?: string | null;
    total_points?: number;
    transfer_cost?: number;
    updated_at?: string;
    weekly_eligible?: boolean;
  };
  Relationships: [
    {
      foreignKeyName: "round_scores_promoted_by_fkey";
      columns: ["promoted_by"];
      isOneToOne: false;
      referencedRelation: "admin_profiles";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "round_scores_registration_id_fkey";
      columns: ["registration_id"];
      isOneToOne: false;
      referencedRelation: "registrations";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "round_scores_round_id_fkey";
      columns: ["round_id"];
      isOneToOne: false;
      referencedRelation: "rounds";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "round_scores_source_provider_record_id_fkey";
      columns: ["source_provider_record_id"];
      isOneToOne: false;
      referencedRelation: "provider_score_records";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "round_scores_source_snapshot_id_fkey";
      columns: ["source_snapshot_id"];
      isOneToOne: false;
      referencedRelation: "score_snapshots";
      referencedColumns: ["id"];
    },
  ];
};

type Phase8Tables = {
  leaderboard_publications: {
    Row: {
      competition_season_id: string;
      created_at: string;
      id: string;
      is_provisional: boolean;
      metadata: Json;
      monthly_period_id: string | null;
      notes: string | null;
      published_at: string;
      published_by: string;
      revision: number;
      round_id: string | null;
      row_count: number;
      scope: string;
      status: string;
      title: string;
      updated_at: string;
      withdrawn_at: string | null;
      withdrawn_by: string | null;
    };
    Insert: {
      competition_season_id: string;
      created_at?: string;
      id?: string;
      is_provisional?: boolean;
      metadata?: Json;
      monthly_period_id?: string | null;
      notes?: string | null;
      published_at?: string;
      published_by: string;
      revision?: number;
      round_id?: string | null;
      row_count?: number;
      scope: string;
      status?: string;
      title: string;
      updated_at?: string;
      withdrawn_at?: string | null;
      withdrawn_by?: string | null;
    };
    Update: {
      competition_season_id?: string;
      created_at?: string;
      id?: string;
      is_provisional?: boolean;
      metadata?: Json;
      monthly_period_id?: string | null;
      notes?: string | null;
      published_at?: string;
      published_by?: string;
      revision?: number;
      round_id?: string | null;
      row_count?: number;
      scope?: string;
      status?: string;
      title?: string;
      updated_at?: string;
      withdrawn_at?: string | null;
      withdrawn_by?: string | null;
    };
    Relationships: [
      {
        foreignKeyName: "leaderboard_publications_competition_season_id_fkey";
        columns: ["competition_season_id"];
        isOneToOne: false;
        referencedRelation: "competition_seasons";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "leaderboard_publications_monthly_period_id_fkey";
        columns: ["monthly_period_id"];
        isOneToOne: false;
        referencedRelation: "monthly_periods";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "leaderboard_publications_published_by_fkey";
        columns: ["published_by"];
        isOneToOne: false;
        referencedRelation: "admin_profiles";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "leaderboard_publications_round_id_fkey";
        columns: ["round_id"];
        isOneToOne: false;
        referencedRelation: "rounds";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "leaderboard_publications_withdrawn_by_fkey";
        columns: ["withdrawn_by"];
        isOneToOne: false;
        referencedRelation: "admin_profiles";
        referencedColumns: ["id"];
      },
    ];
  };
  monthly_scores: {
    Row: {
      calculated_at: string;
      created_at: string;
      effective_points: number;
      gameweeks_counted: number;
      id: string;
      is_provisional: boolean;
      monthly_period_id: string;
      movement: number;
      previous_rank: number | null;
      provider_total_points: number;
      rank: number | null;
      registration_id: string;
      reported_points: number;
      revision: number;
      transfer_cost: number;
      updated_at: string;
    };
    Insert: {
      calculated_at?: string;
      created_at?: string;
      effective_points?: number;
      gameweeks_counted?: number;
      id?: string;
      is_provisional?: boolean;
      monthly_period_id: string;
      movement?: number;
      previous_rank?: number | null;
      provider_total_points?: number;
      rank?: number | null;
      registration_id: string;
      reported_points?: number;
      revision?: number;
      transfer_cost?: number;
      updated_at?: string;
    };
    Update: {
      calculated_at?: string;
      created_at?: string;
      effective_points?: number;
      gameweeks_counted?: number;
      id?: string;
      is_provisional?: boolean;
      monthly_period_id?: string;
      movement?: number;
      previous_rank?: number | null;
      provider_total_points?: number;
      rank?: number | null;
      registration_id?: string;
      reported_points?: number;
      revision?: number;
      transfer_cost?: number;
      updated_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: "monthly_scores_monthly_period_id_fkey";
        columns: ["monthly_period_id"];
        isOneToOne: false;
        referencedRelation: "monthly_periods";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "monthly_scores_registration_id_fkey";
        columns: ["registration_id"];
        isOneToOne: false;
        referencedRelation: "registrations";
        referencedColumns: ["id"];
      },
    ];
  };
  public_leaderboard_rows: {
    Row: {
      chip_used: string | null;
      created_at: string;
      display_name: string;
      gameweeks_counted: number;
      id: number;
      is_tied: boolean;
      metadata: Json;
      movement: number;
      points: number;
      previous_rank: number | null;
      provider_total_points: number;
      publication_id: string;
      rank: number;
      source_key: string;
      team_name: string | null;
      weekly_eligible: boolean;
    };
    Insert: {
      chip_used?: string | null;
      created_at?: string;
      display_name: string;
      gameweeks_counted?: number;
      id?: number;
      is_tied?: boolean;
      metadata?: Json;
      movement?: number;
      points?: number;
      previous_rank?: number | null;
      provider_total_points?: number;
      publication_id: string;
      rank: number;
      source_key: string;
      team_name?: string | null;
      weekly_eligible?: boolean;
    };
    Update: {
      chip_used?: string | null;
      created_at?: string;
      display_name?: string;
      gameweeks_counted?: number;
      id?: number;
      is_tied?: boolean;
      metadata?: Json;
      movement?: number;
      points?: number;
      previous_rank?: number | null;
      provider_total_points?: number;
      publication_id?: string;
      rank?: number;
      source_key?: string;
      team_name?: string | null;
      weekly_eligible?: boolean;
    };
    Relationships: [
      {
        foreignKeyName: "public_leaderboard_rows_publication_id_fkey";
        columns: ["publication_id"];
        isOneToOne: false;
        referencedRelation: "leaderboard_publications";
        referencedColumns: ["id"];
      },
    ];
  };
  round_scores: RoundScoreTable;
  score_corrections: {
    Row: {
      competition_season_id: string;
      corrected_chip_used: string | null;
      corrected_effective_points: number;
      corrected_reported_points: number;
      corrected_total_points: number;
      corrected_transfer_cost: number;
      corrected_weekly_eligible: boolean;
      created_at: string;
      id: string;
      metadata: Json;
      previous_chip_used: string | null;
      previous_effective_points: number;
      previous_reported_points: number;
      previous_total_points: number;
      previous_transfer_cost: number;
      previous_weekly_eligible: boolean;
      reason: string;
      registration_id: string;
      requested_by: string;
      round_id: string;
      round_score_id: string;
    };
    Insert: {
      competition_season_id: string;
      corrected_chip_used?: string | null;
      corrected_effective_points: number;
      corrected_reported_points: number;
      corrected_total_points: number;
      corrected_transfer_cost: number;
      corrected_weekly_eligible: boolean;
      created_at?: string;
      id?: string;
      metadata?: Json;
      previous_chip_used?: string | null;
      previous_effective_points: number;
      previous_reported_points: number;
      previous_total_points: number;
      previous_transfer_cost: number;
      previous_weekly_eligible: boolean;
      reason: string;
      registration_id: string;
      requested_by: string;
      round_id: string;
      round_score_id: string;
    };
    Update: {
      competition_season_id?: string;
      corrected_chip_used?: string | null;
      corrected_effective_points?: number;
      corrected_reported_points?: number;
      corrected_total_points?: number;
      corrected_transfer_cost?: number;
      corrected_weekly_eligible?: boolean;
      created_at?: string;
      id?: string;
      metadata?: Json;
      previous_chip_used?: string | null;
      previous_effective_points?: number;
      previous_reported_points?: number;
      previous_total_points?: number;
      previous_transfer_cost?: number;
      previous_weekly_eligible?: boolean;
      reason?: string;
      registration_id?: string;
      requested_by?: string;
      round_id?: string;
      round_score_id?: string;
    };
    Relationships: [
      {
        foreignKeyName: "score_corrections_competition_season_id_fkey";
        columns: ["competition_season_id"];
        isOneToOne: false;
        referencedRelation: "competition_seasons";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "score_corrections_registration_id_fkey";
        columns: ["registration_id"];
        isOneToOne: false;
        referencedRelation: "registrations";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "score_corrections_requested_by_fkey";
        columns: ["requested_by"];
        isOneToOne: false;
        referencedRelation: "admin_profiles";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "score_corrections_round_id_fkey";
        columns: ["round_id"];
        isOneToOne: false;
        referencedRelation: "rounds";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "score_corrections_round_score_id_fkey";
        columns: ["round_score_id"];
        isOneToOne: false;
        referencedRelation: "round_scores";
        referencedColumns: ["id"];
      },
    ];
  };
  score_promotion_runs: {
    Row: {
      competition_season_id: string;
      completed_at: string | null;
      created_at: string;
      error_summary: string | null;
      id: string;
      include_transfer_deductions: boolean;
      metadata: Json;
      promoted_record_count: number;
      provider_sync_run_id: string;
      rejected_record_count: number;
      requested_by: string;
      round_id: string;
      rules_version: number;
      source_record_count: number;
      started_at: string;
      status: string;
      updated_at: string;
      weekly_chip_policy: string;
    };
    Insert: {
      competition_season_id: string;
      completed_at?: string | null;
      created_at?: string;
      error_summary?: string | null;
      id?: string;
      include_transfer_deductions: boolean;
      metadata?: Json;
      promoted_record_count?: number;
      provider_sync_run_id: string;
      rejected_record_count?: number;
      requested_by: string;
      round_id: string;
      rules_version: number;
      source_record_count?: number;
      started_at?: string;
      status?: string;
      updated_at?: string;
      weekly_chip_policy: string;
    };
    Update: {
      competition_season_id?: string;
      completed_at?: string | null;
      created_at?: string;
      error_summary?: string | null;
      id?: string;
      include_transfer_deductions?: boolean;
      metadata?: Json;
      promoted_record_count?: number;
      provider_sync_run_id?: string;
      rejected_record_count?: number;
      requested_by?: string;
      round_id?: string;
      rules_version?: number;
      source_record_count?: number;
      started_at?: string;
      status?: string;
      updated_at?: string;
      weekly_chip_policy?: string;
    };
    Relationships: [
      {
        foreignKeyName: "score_promotion_runs_competition_season_id_fkey";
        columns: ["competition_season_id"];
        isOneToOne: false;
        referencedRelation: "competition_seasons";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "score_promotion_runs_provider_sync_run_id_fkey";
        columns: ["provider_sync_run_id"];
        isOneToOne: false;
        referencedRelation: "provider_sync_runs";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "score_promotion_runs_requested_by_fkey";
        columns: ["requested_by"];
        isOneToOne: false;
        referencedRelation: "admin_profiles";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "score_promotion_runs_round_id_fkey";
        columns: ["round_id"];
        isOneToOne: false;
        referencedRelation: "rounds";
        referencedColumns: ["id"];
      },
    ];
  };
  season_scores: {
    Row: {
      calculated_at: string;
      competition_season_id: string;
      created_at: string;
      effective_points: number;
      gameweeks_counted: number;
      id: string;
      is_provisional: boolean;
      movement: number;
      previous_rank: number | null;
      provider_total_points: number;
      rank: number | null;
      registration_id: string;
      reported_points: number;
      revision: number;
      transfer_cost: number;
      updated_at: string;
    };
    Insert: {
      calculated_at?: string;
      competition_season_id: string;
      created_at?: string;
      effective_points?: number;
      gameweeks_counted?: number;
      id?: string;
      is_provisional?: boolean;
      movement?: number;
      previous_rank?: number | null;
      provider_total_points?: number;
      rank?: number | null;
      registration_id: string;
      reported_points?: number;
      revision?: number;
      transfer_cost?: number;
      updated_at?: string;
    };
    Update: {
      calculated_at?: string;
      competition_season_id?: string;
      created_at?: string;
      effective_points?: number;
      gameweeks_counted?: number;
      id?: string;
      is_provisional?: boolean;
      movement?: number;
      previous_rank?: number | null;
      provider_total_points?: number;
      rank?: number | null;
      registration_id?: string;
      reported_points?: number;
      revision?: number;
      transfer_cost?: number;
      updated_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: "season_scores_competition_season_id_fkey";
        columns: ["competition_season_id"];
        isOneToOne: false;
        referencedRelation: "competition_seasons";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "season_scores_registration_id_fkey";
        columns: ["registration_id"];
        isOneToOne: false;
        referencedRelation: "registrations";
        referencedColumns: ["id"];
      },
    ];
  };
};

type Phase8Functions = {
  apply_round_score_correction: {
    Args: {
      p_chip_used: string | null;
      p_reason: string;
      p_reported_points: number;
      p_requested_by: string;
      p_round_score_id: string;
      p_total_points: number;
      p_transfer_cost: number;
    };
    Returns: string;
  };
  promote_provider_scores: {
    Args: {
      p_competition_season_id: string;
      p_provider_sync_run_id: string;
      p_requested_by: string;
      p_round_id: string;
    };
    Returns: string;
  };
  publish_leaderboard: {
    Args: {
      p_competition_season_id: string;
      p_monthly_period_id: string | null;
      p_notes: string | null;
      p_requested_by: string;
      p_round_id: string | null;
      p_scope: string;
      p_title: string;
    };
    Returns: string;
  };
  refresh_scoreboards: {
    Args: { p_competition_season_id: string; p_requested_by: string };
    Returns: undefined;
  };
  set_round_scores_finality: {
    Args: { p_final: boolean; p_requested_by: string; p_round_id: string };
    Returns: undefined;
  };
  withdraw_leaderboard: {
    Args: { p_publication_id: string; p_reason: string; p_requested_by: string };
    Returns: undefined;
  };
};

type Phase7Public = Phase7Database["public"];

export type Database = Omit<Phase7Database, "public"> & {
  public: Omit<Phase7Public, "Tables" | "Functions"> & {
    Tables: Omit<Phase7Public["Tables"], keyof Phase8Tables> & Phase8Tables;
    Functions: Omit<Phase7Public["Functions"], keyof Phase8Functions> & Phase8Functions;
  };
};

export type { Json } from "@/types/database-phase7";
