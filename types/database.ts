export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      admin_profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          is_active: boolean;
          role: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          id: string;
          is_active?: boolean;
          role: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_user_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: number;
          metadata: Json;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: number;
          metadata?: Json;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: number;
          metadata?: Json;
        };
        Relationships: [];
      };
      competition_seasons: {
        Row: {
          competition_id: string;
          created_at: string;
          data_provider: string;
          ends_at: string | null;
          external_league_id: string | null;
          id: string;
          name: string;
          registration_closes_at: string | null;
          registration_opens_at: string | null;
          rules_version: number;
          season_id: string;
          settings: Json;
          slug: string;
          starts_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          competition_id: string;
          created_at?: string;
          data_provider?: string;
          ends_at?: string | null;
          external_league_id?: string | null;
          id?: string;
          name: string;
          registration_closes_at?: string | null;
          registration_opens_at?: string | null;
          rules_version?: number;
          season_id: string;
          settings?: Json;
          slug: string;
          starts_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          competition_id?: string;
          created_at?: string;
          data_provider?: string;
          ends_at?: string | null;
          external_league_id?: string | null;
          id?: string;
          name?: string;
          registration_closes_at?: string | null;
          registration_opens_at?: string | null;
          rules_version?: number;
          season_id?: string;
          settings?: Json;
          slug?: string;
          starts_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "competition_seasons_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competition_seasons_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      competitions: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fantasy_entries: {
        Row: {
          competition_season_id: string;
          created_at: string;
          id: string;
          last_synced_at: string | null;
          manager_name: string | null;
          provider: string;
          provider_entry_id: string;
          registration_id: string;
          team_name: string | null;
          updated_at: string;
          verified_at: string | null;
        };
        Insert: {
          competition_season_id: string;
          created_at?: string;
          id?: string;
          last_synced_at?: string | null;
          manager_name?: string | null;
          provider?: string;
          provider_entry_id: string;
          registration_id: string;
          team_name?: string | null;
          updated_at?: string;
          verified_at?: string | null;
        };
        Update: {
          competition_season_id?: string;
          created_at?: string;
          id?: string;
          last_synced_at?: string | null;
          manager_name?: string | null;
          provider?: string;
          provider_entry_id?: string;
          registration_id?: string;
          team_name?: string | null;
          updated_at?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fantasy_entries_competition_season_id_fkey";
            columns: ["competition_season_id"];
            isOneToOne: false;
            referencedRelation: "competition_seasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fantasy_entries_registration_id_fkey";
            columns: ["registration_id"];
            isOneToOne: true;
            referencedRelation: "registrations";
            referencedColumns: ["id"];
          },
        ];
      };
      monthly_periods: {
        Row: {
          competition_season_id: string;
          created_at: string;
          end_round: number;
          id: string;
          name: string;
          start_round: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          competition_season_id: string;
          created_at?: string;
          end_round: number;
          id?: string;
          name: string;
          start_round: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          competition_season_id?: string;
          created_at?: string;
          end_round?: number;
          id?: string;
          name?: string;
          start_round?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monthly_periods_competition_season_id_fkey";
            columns: ["competition_season_id"];
            isOneToOne: false;
            referencedRelation: "competition_seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      participants: {
        Row: {
          auth_user_id: string | null;
          city: string | null;
          country: string;
          created_at: string;
          date_of_birth: string | null;
          email: string | null;
          full_name: string;
          id: string;
          phone: string;
          status: string;
          updated_at: string;
          vult_customer_ref: string | null;
          whatsapp_phone: string | null;
        };
        Insert: {
          auth_user_id?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          date_of_birth?: string | null;
          email?: string | null;
          full_name: string;
          id?: string;
          phone: string;
          status?: string;
          updated_at?: string;
          vult_customer_ref?: string | null;
          whatsapp_phone?: string | null;
        };
        Update: {
          auth_user_id?: string | null;
          city?: string | null;
          country?: string;
          created_at?: string;
          date_of_birth?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          phone?: string;
          status?: string;
          updated_at?: string;
          vult_customer_ref?: string | null;
          whatsapp_phone?: string | null;
        };
        Relationships: [];
      };
      prize_payments: {
        Row: {
          amount: number;
          approved_by: string | null;
          created_at: string;
          currency: string;
          destination_reference: string | null;
          evidence_path: string | null;
          id: string;
          notes: string | null;
          paid_at: string | null;
          paid_by: string | null;
          participant_id: string;
          prize_id: string | null;
          status: string;
          transaction_reference: string | null;
          updated_at: string;
          winner_candidate_id: string;
        };
        Insert: {
          amount: number;
          approved_by?: string | null;
          created_at?: string;
          currency?: string;
          destination_reference?: string | null;
          evidence_path?: string | null;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          paid_by?: string | null;
          participant_id: string;
          prize_id?: string | null;
          status?: string;
          transaction_reference?: string | null;
          updated_at?: string;
          winner_candidate_id: string;
        };
        Update: {
          amount?: number;
          approved_by?: string | null;
          created_at?: string;
          currency?: string;
          destination_reference?: string | null;
          evidence_path?: string | null;
          id?: string;
          notes?: string | null;
          paid_at?: string | null;
          paid_by?: string | null;
          participant_id?: string;
          prize_id?: string | null;
          status?: string;
          transaction_reference?: string | null;
          updated_at?: string;
          winner_candidate_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prize_payments_participant_id_fkey";
            columns: ["participant_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prize_payments_prize_id_fkey";
            columns: ["prize_id"];
            isOneToOne: false;
            referencedRelation: "prizes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prize_payments_winner_candidate_id_fkey";
            columns: ["winner_candidate_id"];
            isOneToOne: true;
            referencedRelation: "winner_candidates";
            referencedColumns: ["id"];
          },
        ];
      };
      prizes: {
        Row: {
          amount: number;
          code: string;
          competition_season_id: string;
          created_at: string;
          currency: string;
          frequency: string;
          id: string;
          is_active: boolean;
          name: string;
          position: number;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          code: string;
          competition_season_id: string;
          created_at?: string;
          currency?: string;
          frequency: string;
          id?: string;
          is_active?: boolean;
          name: string;
          position?: number;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          code?: string;
          competition_season_id?: string;
          created_at?: string;
          currency?: string;
          frequency?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          position?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prizes_competition_season_id_fkey";
            columns: ["competition_season_id"];
            isOneToOne: false;
            referencedRelation: "competition_seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      registrations: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          competition_season_id: string;
          created_at: string;
          eligibility_status: string;
          id: string;
          metadata: Json;
          participant_id: string;
          registered_at: string;
          rejection_reason: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          competition_season_id: string;
          created_at?: string;
          eligibility_status?: string;
          id?: string;
          metadata?: Json;
          participant_id: string;
          registered_at?: string;
          rejection_reason?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          competition_season_id?: string;
          created_at?: string;
          eligibility_status?: string;
          id?: string;
          metadata?: Json;
          participant_id?: string;
          registered_at?: string;
          rejection_reason?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "registrations_competition_season_id_fkey";
            columns: ["competition_season_id"];
            isOneToOne: false;
            referencedRelation: "competition_seasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registrations_participant_id_fkey";
            columns: ["participant_id"];
            isOneToOne: false;
            referencedRelation: "participants";
            referencedColumns: ["id"];
          },
        ];
      };
      round_scores: {
        Row: {
          chip_used: string | null;
          created_at: string;
          effective_points: number;
          finalised_at: string | null;
          id: string;
          is_provisional: boolean;
          overall_rank: number | null;
          registration_id: string;
          reported_points: number;
          round_id: string;
          round_rank: number | null;
          source_snapshot_id: string | null;
          total_points: number;
          transfer_cost: number;
          updated_at: string;
        };
        Insert: {
          chip_used?: string | null;
          created_at?: string;
          effective_points?: number;
          finalised_at?: string | null;
          id?: string;
          is_provisional?: boolean;
          overall_rank?: number | null;
          registration_id: string;
          reported_points?: number;
          round_id: string;
          round_rank?: number | null;
          source_snapshot_id?: string | null;
          total_points?: number;
          transfer_cost?: number;
          updated_at?: string;
        };
        Update: {
          chip_used?: string | null;
          created_at?: string;
          effective_points?: number;
          finalised_at?: string | null;
          id?: string;
          is_provisional?: boolean;
          overall_rank?: number | null;
          registration_id?: string;
          reported_points?: number;
          round_id?: string;
          round_rank?: number | null;
          source_snapshot_id?: string | null;
          total_points?: number;
          transfer_cost?: number;
          updated_at?: string;
        };
        Relationships: [
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
            foreignKeyName: "round_scores_source_snapshot_id_fkey";
            columns: ["source_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "score_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
      rounds: {
        Row: {
          competition_season_id: string;
          created_at: string;
          deadline_at: string | null;
          external_round_id: number;
          id: string;
          is_current: boolean;
          is_final: boolean;
          name: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          competition_season_id: string;
          created_at?: string;
          deadline_at?: string | null;
          external_round_id: number;
          id?: string;
          is_current?: boolean;
          is_final?: boolean;
          name: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          competition_season_id?: string;
          created_at?: string;
          deadline_at?: string | null;
          external_round_id?: number;
          id?: string;
          is_current?: boolean;
          is_final?: boolean;
          name?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rounds_competition_season_id_fkey";
            columns: ["competition_season_id"];
            isOneToOne: false;
            referencedRelation: "competition_seasons";
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
          request_key: string;
          response_data: Json;
          response_hash: string | null;
          source_endpoint: string;
        };
        Insert: {
          competition_season_id: string;
          fetched_at?: string;
          http_status?: number | null;
          id?: string;
          request_key: string;
          response_data: Json;
          response_hash?: string | null;
          source_endpoint: string;
        };
        Update: {
          competition_season_id?: string;
          fetched_at?: string;
          http_status?: number | null;
          id?: string;
          request_key?: string;
          response_data?: Json;
          response_hash?: string | null;
          source_endpoint?: string;
        };
        Relationships: [
          {
            foreignKeyName: "score_snapshots_competition_season_id_fkey";
            columns: ["competition_season_id"];
            isOneToOne: false;
            referencedRelation: "competition_seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      seasons: {
        Row: {
          code: string;
          created_at: string;
          ends_on: string | null;
          id: string;
          name: string;
          starts_on: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          name: string;
          starts_on?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          name?: string;
          starts_on?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      winner_candidates: {
        Row: {
          competition_season_id: string;
          created_at: string;
          generated_at: string;
          id: string;
          monthly_period_id: string | null;
          prize_id: string | null;
          rank: number;
          registration_id: string;
          review_notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          round_id: string | null;
          rules_version: number;
          score: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          competition_season_id: string;
          created_at?: string;
          generated_at?: string;
          id?: string;
          monthly_period_id?: string | null;
          prize_id?: string | null;
          rank?: number;
          registration_id: string;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          round_id?: string | null;
          rules_version: number;
          score: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          competition_season_id?: string;
          created_at?: string;
          generated_at?: string;
          id?: string;
          monthly_period_id?: string | null;
          prize_id?: string | null;
          rank?: number;
          registration_id?: string;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          round_id?: string | null;
          rules_version?: number;
          score?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "winner_candidates_competition_season_id_fkey";
            columns: ["competition_season_id"];
            isOneToOne: false;
            referencedRelation: "competition_seasons";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "winner_candidates_monthly_period_id_fkey";
            columns: ["monthly_period_id"];
            isOneToOne: false;
            referencedRelation: "monthly_periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "winner_candidates_prize_id_fkey";
            columns: ["prize_id"];
            isOneToOne: false;
            referencedRelation: "prizes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "winner_candidates_registration_id_fkey";
            columns: ["registration_id"];
            isOneToOne: false;
            referencedRelation: "registrations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "winner_candidates_round_id_fkey";
            columns: ["round_id"];
            isOneToOne: false;
            referencedRelation: "rounds";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<
  TableName extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][TableName]["Row"];

export type TablesInsert<
  TableName extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][TableName]["Insert"];

export type TablesUpdate<
  TableName extends keyof Database["public"]["Tables"],
> = Database["public"]["Tables"][TableName]["Update"];
