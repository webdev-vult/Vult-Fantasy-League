import type { Database as BaseDatabase, Json } from "@/types/database";

/**
 * Provider-aware database contract generated from the connected Supabase
 * project after the Phase 7 migrations. The earlier base file remains intact
 * for migration history; every Supabase client imports this merged contract.
 */

type ProviderTables = {
  fantasy_provider_settings: {
    Row: {
      competition_season_id: string;
      config: Json;
      created_at: string;
      created_by: string | null;
      id: string;
      is_enabled: boolean;
      last_failed_sync_at: string | null;
      last_successful_sync_at: string | null;
      max_attempts: number;
      provider: string;
      request_timeout_seconds: number;
      schedule_cron: string | null;
      sync_mode: string;
      updated_at: string;
      updated_by: string | null;
    };
    Insert: {
      competition_season_id: string;
      config?: Json;
      created_at?: string;
      created_by?: string | null;
      id?: string;
      is_enabled?: boolean;
      last_failed_sync_at?: string | null;
      last_successful_sync_at?: string | null;
      max_attempts?: number;
      provider?: string;
      request_timeout_seconds?: number;
      schedule_cron?: string | null;
      sync_mode?: string;
      updated_at?: string;
      updated_by?: string | null;
    };
    Update: {
      competition_season_id?: string;
      config?: Json;
      created_at?: string;
      created_by?: string | null;
      id?: string;
      is_enabled?: boolean;
      last_failed_sync_at?: string | null;
      last_successful_sync_at?: string | null;
      max_attempts?: number;
      provider?: string;
      request_timeout_seconds?: number;
      schedule_cron?: string | null;
      sync_mode?: string;
      updated_at?: string;
      updated_by?: string | null;
    };
    Relationships: [
      {
        foreignKeyName: "fantasy_provider_settings_competition_season_id_fkey";
        columns: ["competition_season_id"];
        isOneToOne: true;
        referencedRelation: "competition_seasons";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "fantasy_provider_settings_created_by_fkey";
        columns: ["created_by"];
        isOneToOne: false;
        referencedRelation: "admin_profiles";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "fantasy_provider_settings_updated_by_fkey";
        columns: ["updated_by"];
        isOneToOne: false;
        referencedRelation: "admin_profiles";
        referencedColumns: ["id"];
      },
    ];
  };
  provider_score_records: {
    Row: {
      chip_used: string | null;
      competition_season_id: string;
      external_round_id: number | null;
      fantasy_entry_id: string | null;
      id: string;
      imported_at: string;
      is_provisional: boolean;
      manager_name: string | null;
      overall_rank: number | null;
      provider: string;
      provider_entry_id: string | null;
      raw_record: Json;
      registration_id: string | null;
      reported_points: number | null;
      round_id: string | null;
      round_rank: number | null;
      snapshot_id: string;
      sync_run_id: string;
      team_name: string | null;
      total_points: number | null;
      transfer_cost: number;
      validation_errors: Json;
      validation_status: string;
    };
    Insert: {
      chip_used?: string | null;
      competition_season_id: string;
      external_round_id?: number | null;
      fantasy_entry_id?: string | null;
      id?: string;
      imported_at?: string;
      is_provisional?: boolean;
      manager_name?: string | null;
      overall_rank?: number | null;
      provider: string;
      provider_entry_id?: string | null;
      raw_record: Json;
      registration_id?: string | null;
      reported_points?: number | null;
      round_id?: string | null;
      round_rank?: number | null;
      snapshot_id: string;
      sync_run_id: string;
      team_name?: string | null;
      total_points?: number | null;
      transfer_cost?: number;
      validation_errors?: Json;
      validation_status: string;
    };
    Update: {
      chip_used?: string | null;
      competition_season_id?: string;
      external_round_id?: number | null;
      fantasy_entry_id?: string | null;
      id?: string;
      imported_at?: string;
      is_provisional?: boolean;
      manager_name?: string | null;
      overall_rank?: number | null;
      provider?: string;
      provider_entry_id?: string | null;
      raw_record?: Json;
      registration_id?: string | null;
      reported_points?: number | null;
      round_id?: string | null;
      round_rank?: number | null;
      snapshot_id?: string;
      sync_run_id?: string;
      team_name?: string | null;
      total_points?: number | null;
      transfer_cost?: number;
      validation_errors?: Json;
      validation_status?: string;
    };
    Relationships: [
      {
        foreignKeyName: "provider_score_records_competition_season_id_fkey";
        columns: ["competition_season_id"];
        isOneToOne: false;
        referencedRelation: "competition_seasons";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "provider_score_records_fantasy_entry_id_fkey";
        columns: ["fantasy_entry_id"];
        isOneToOne: false;
        referencedRelation: "fantasy_entries";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "provider_score_records_registration_id_fkey";
        columns: ["registration_id"];
        isOneToOne: false;
        referencedRelation: "registrations";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "provider_score_records_round_id_fkey";
        columns: ["round_id"];
        isOneToOne: false;
        referencedRelation: "rounds";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "provider_score_records_snapshot_id_fkey";
        columns: ["snapshot_id"];
        isOneToOne: false;
        referencedRelation: "score_snapshots";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "provider_score_records_sync_run_id_fkey";
        columns: ["sync_run_id"];
        isOneToOne: false;
        referencedRelation: "provider_sync_runs";
        referencedColumns: ["id"];
      },
    ];
  };
  provider_sync_errors: {
    Row: {
      attempt_number: number;
      competition_season_id: string;
      created_at: string;
      details: Json;
      error_code: string;
      external_round_id: number | null;
      id: number;
      message: string;
      provider: string;
      provider_entry_id: string | null;
      retriable: boolean;
      stage: string;
      sync_run_id: string;
    };
    Insert: {
      attempt_number?: number;
      competition_season_id: string;
      created_at?: string;
      details?: Json;
      error_code: string;
      external_round_id?: number | null;
      id?: number;
      message: string;
      provider: string;
      provider_entry_id?: string | null;
      retriable?: boolean;
      stage: string;
      sync_run_id: string;
    };
    Update: {
      attempt_number?: number;
      competition_season_id?: string;
      created_at?: string;
      details?: Json;
      error_code?: string;
      external_round_id?: number | null;
      id?: number;
      message?: string;
      provider?: string;
      provider_entry_id?: string | null;
      retriable?: boolean;
      stage?: string;
      sync_run_id?: string;
    };
    Relationships: [
      {
        foreignKeyName: "provider_sync_errors_competition_season_id_fkey";
        columns: ["competition_season_id"];
        isOneToOne: false;
        referencedRelation: "competition_seasons";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "provider_sync_errors_sync_run_id_fkey";
        columns: ["sync_run_id"];
        isOneToOne: false;
        referencedRelation: "provider_sync_runs";
        referencedColumns: ["id"];
      },
    ];
  };
  provider_sync_runs: {
    Row: {
      accepted_record_count: number;
      attempt_number: number;
      competition_season_id: string;
      completed_at: string | null;
      created_at: string;
      error_summary: string | null;
      id: string;
      idempotency_key: string;
      metadata: Json;
      parent_run_id: string | null;
      provider: string;
      raw_record_count: number;
      rejected_record_count: number;
      requested_by: string | null;
      response_hash: string | null;
      source_label: string | null;
      started_at: string;
      status: string;
      trigger_source: string;
      updated_at: string;
      warning_count: number;
    };
    Insert: {
      accepted_record_count?: number;
      attempt_number?: number;
      competition_season_id: string;
      completed_at?: string | null;
      created_at?: string;
      error_summary?: string | null;
      id?: string;
      idempotency_key: string;
      metadata?: Json;
      parent_run_id?: string | null;
      provider: string;
      raw_record_count?: number;
      rejected_record_count?: number;
      requested_by?: string | null;
      response_hash?: string | null;
      source_label?: string | null;
      started_at?: string;
      status?: string;
      trigger_source: string;
      updated_at?: string;
      warning_count?: number;
    };
    Update: {
      accepted_record_count?: number;
      attempt_number?: number;
      competition_season_id?: string;
      completed_at?: string | null;
      created_at?: string;
      error_summary?: string | null;
      id?: string;
      idempotency_key?: string;
      metadata?: Json;
      parent_run_id?: string | null;
      provider?: string;
      raw_record_count?: number;
      rejected_record_count?: number;
      requested_by?: string | null;
      response_hash?: string | null;
      source_label?: string | null;
      started_at?: string;
      status?: string;
      trigger_source?: string;
      updated_at?: string;
      warning_count?: number;
    };
    Relationships: [
      {
        foreignKeyName: "provider_sync_runs_competition_season_id_fkey";
        columns: ["competition_season_id"];
        isOneToOne: false;
        referencedRelation: "competition_seasons";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "provider_sync_runs_parent_run_id_fkey";
        columns: ["parent_run_id"];
        isOneToOne: false;
        referencedRelation: "provider_sync_runs";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "provider_sync_runs_requested_by_fkey";
        columns: ["requested_by"];
        isOneToOne: false;
        referencedRelation: "admin_profiles";
        referencedColumns: ["id"];
      },
    ];
  };
  score_snapshots: {
    Row: {
      competition_season_id: string;
      fetched_at: string;
      http_status: number | null;
      id: string;
      metadata: Json;
      payload_type: string;
      provider: string;
      request_key: string;
      response_data: Json;
      response_hash: string | null;
      source_endpoint: string;
      sync_run_id: string | null;
      validated_at: string | null;
      validation_status: string;
    };
    Insert: {
      competition_season_id: string;
      fetched_at?: string;
      http_status?: number | null;
      id?: string;
      metadata?: Json;
      payload_type?: string;
      provider?: string;
      request_key: string;
      response_data: Json;
      response_hash?: string | null;
      source_endpoint: string;
      sync_run_id?: string | null;
      validated_at?: string | null;
      validation_status?: string;
    };
    Update: {
      competition_season_id?: string;
      fetched_at?: string;
      http_status?: number | null;
      id?: string;
      metadata?: Json;
      payload_type?: string;
      provider?: string;
      request_key?: string;
      response_data?: Json;
      response_hash?: string | null;
      source_endpoint?: string;
      sync_run_id?: string | null;
      validated_at?: string | null;
      validation_status?: string;
    };
    Relationships: [
      {
        foreignKeyName: "score_snapshots_competition_season_id_fkey";
        columns: ["competition_season_id"];
        isOneToOne: false;
        referencedRelation: "competition_seasons";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "score_snapshots_sync_run_id_fkey";
        columns: ["sync_run_id"];
        isOneToOne: false;
        referencedRelation: "provider_sync_runs";
        referencedColumns: ["id"];
      },
    ];
  };
};

type ProviderFunctions = {
  persist_provider_batch: {
    Args: {
      p_competition_season_id: string;
      p_errors?: Json;
      p_idempotency_key: string;
      p_parent_run_id?: string;
      p_provider: string;
      p_records: Json;
      p_requested_by?: string;
      p_response_data: Json;
      p_response_hash: string;
      p_source_endpoint: string;
      p_source_label: string;
      p_trigger_source: string;
    };
    Returns: string;
  };
};

type BasePublic = BaseDatabase["public"];

export type Database = Omit<BaseDatabase, "public"> & {
  public: Omit<BasePublic, "Tables" | "Functions"> & {
    Tables: Omit<BasePublic["Tables"], keyof ProviderTables> & ProviderTables;
    Functions: Omit<BasePublic["Functions"], keyof ProviderFunctions> &
      ProviderFunctions;
  };
};

export type { Json } from "@/types/database";
