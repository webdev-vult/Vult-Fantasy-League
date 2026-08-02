import type { Database as Phase9Database, Json } from "@/types/database-phase9";

/**
 * Prize-settlement-aware database contract generated from the connected
 * Supabase project after the Phase 10 migrations. Earlier phase contracts stay
 * intact so schema evolution remains reviewable.
 */

type PrizePaymentRow = {
  amount: number;
  approved_at: string | null;
  approved_by: string | null;
  attempt_count: number;
  award_reference: string;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  competition_season_id: string;
  created_at: string;
  currency: string;
  current_attempt_id: string | null;
  destination_reference: string | null;
  destination_snapshot: Json;
  destination_status: string;
  destination_verification_notes: string | null;
  destination_verified_at: string | null;
  destination_verified_by: string | null;
  evidence_path: string | null;
  failed_at: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  finance_review_notes: string | null;
  finance_review_status: string;
  finance_reviewed_at: string | null;
  finance_reviewed_by: string | null;
  id: string;
  metadata: Json;
  non_cash_description: string | null;
  notes: string | null;
  paid_at: string | null;
  paid_by: string | null;
  participant_id: string;
  payment_deadline_at: string | null;
  payment_method: string;
  prize_id: string;
  prize_snapshot: Json;
  prize_type: string;
  processing_started_at: string | null;
  reconciliation_status: string;
  reversal_status: string;
  status: string;
  transaction_reference: string | null;
  updated_at: string;
  winner_candidate_id: string;
  winner_snapshot: Json;
};

type PrizePaymentInsert = Partial<PrizePaymentRow> &
  Pick<
    PrizePaymentRow,
    | "amount"
    | "competition_season_id"
    | "participant_id"
    | "prize_id"
    | "winner_candidate_id"
  >;

type PaymentAttemptRow = {
  amount: number;
  attempt_number: number;
  completed_at: string | null;
  created_at: string;
  currency: string;
  destination_reference: string | null;
  evidence_path: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  id: string;
  idempotency_key: string;
  metadata: Json;
  notes: string | null;
  payment_id: string;
  processor: string;
  requested_by: string;
  started_at: string;
  status: string;
  transaction_reference: string | null;
  updated_at: string;
};

type PaymentAttemptInsert = Partial<PaymentAttemptRow> &
  Pick<
    PaymentAttemptRow,
    | "amount"
    | "attempt_number"
    | "currency"
    | "idempotency_key"
    | "payment_id"
    | "requested_by"
  >;

type PaymentHistoryRow = {
  action: string;
  actor_user_id: string | null;
  created_at: string;
  from_status: string | null;
  id: number;
  metadata: Json;
  notes: string | null;
  payment_id: string;
  to_status: string;
};

type PaymentHistoryInsert = Partial<PaymentHistoryRow> &
  Pick<PaymentHistoryRow, "action" | "payment_id" | "to_status">;

type PaymentEvidenceRow = {
  attempt_id: string | null;
  created_at: string;
  evidence_type: string;
  external_url: string | null;
  file_name: string | null;
  id: string;
  mime_type: string | null;
  notes: string | null;
  payment_id: string;
  size_bytes: number | null;
  storage_path: string | null;
  uploaded_by: string;
};

type PaymentEvidenceInsert = Partial<PaymentEvidenceRow> &
  Pick<PaymentEvidenceRow, "evidence_type" | "payment_id" | "uploaded_by">;

type PaymentReversalRow = {
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  evidence_path: string | null;
  failure_reason: string | null;
  id: string;
  metadata: Json;
  payment_id: string;
  reason: string;
  requested_at: string;
  requested_by: string;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  status: string;
  transaction_reference: string | null;
  updated_at: string;
};

type PaymentReversalInsert = Partial<PaymentReversalRow> &
  Pick<PaymentReversalRow, "payment_id" | "reason" | "requested_by">;

type PaymentReconciliationRow = {
  created_at: string;
  external_reference: string | null;
  id: string;
  matched_amount: number | null;
  matched_currency: string | null;
  metadata: Json;
  notes: string;
  payment_id: string;
  reviewed_by: string;
  statement_date: string | null;
  status: string;
};

type PaymentReconciliationInsert = Partial<PaymentReconciliationRow> &
  Pick<
    PaymentReconciliationRow,
    "notes" | "payment_id" | "reviewed_by" | "status"
  >;

type Phase10Tables = {
  prize_payments: {
    Row: PrizePaymentRow;
    Insert: PrizePaymentInsert;
    Update: Partial<PrizePaymentRow>;
    Relationships: [];
  };
  prize_payment_attempts: {
    Row: PaymentAttemptRow;
    Insert: PaymentAttemptInsert;
    Update: Partial<PaymentAttemptRow>;
    Relationships: [];
  };
  prize_payment_status_history: {
    Row: PaymentHistoryRow;
    Insert: PaymentHistoryInsert;
    Update: Partial<PaymentHistoryRow>;
    Relationships: [];
  };
  prize_payment_evidence: {
    Row: PaymentEvidenceRow;
    Insert: PaymentEvidenceInsert;
    Update: Partial<PaymentEvidenceRow>;
    Relationships: [];
  };
  prize_payment_reversals: {
    Row: PaymentReversalRow;
    Insert: PaymentReversalInsert;
    Update: Partial<PaymentReversalRow>;
    Relationships: [];
  };
  prize_payment_reconciliations: {
    Row: PaymentReconciliationRow;
    Insert: PaymentReconciliationInsert;
    Update: Partial<PaymentReconciliationRow>;
    Relationships: [];
  };
};

type Phase10Functions = {
  prepare_prize_payment: {
    Args: { p_candidate_id: string; p_requested_by: string };
    Returns: string;
  };
  review_prize_payment_destination: {
    Args: {
      p_decision: string;
      p_destination_reference: string;
      p_notes: string;
      p_payment_id: string;
      p_requested_by: string;
    };
    Returns: string;
  };
  finance_review_prize_payment: {
    Args: {
      p_decision: string;
      p_notes: string;
      p_payment_id: string;
      p_requested_by: string;
    };
    Returns: string;
  };
  start_prize_payment_attempt: {
    Args: {
      p_idempotency_key: string;
      p_notes: string;
      p_payment_id: string;
      p_processor: string;
      p_requested_by: string;
    };
    Returns: string;
  };
  complete_prize_payment_attempt: {
    Args: {
      p_attempt_id: string;
      p_evidence_path: string | null;
      p_failure_code: string | null;
      p_failure_reason: string | null;
      p_notes: string;
      p_outcome: string;
      p_requested_by: string;
      p_transaction_reference: string | null;
    };
    Returns: string;
  };
  cancel_prize_payment: {
    Args: { p_payment_id: string; p_reason: string; p_requested_by: string };
    Returns: string;
  };
  reopen_prize_payment: {
    Args: { p_payment_id: string; p_reason: string; p_requested_by: string };
    Returns: string;
  };
  add_prize_payment_evidence: {
    Args: {
      p_attempt_id: string | null;
      p_evidence_type: string;
      p_external_url: string | null;
      p_file_name: string | null;
      p_mime_type: string | null;
      p_notes: string | null;
      p_payment_id: string;
      p_requested_by: string;
      p_size_bytes: number | null;
      p_storage_path: string | null;
    };
    Returns: string;
  };
  request_prize_payment_reversal: {
    Args: { p_payment_id: string; p_reason: string; p_requested_by: string };
    Returns: string;
  };
  review_prize_payment_reversal: {
    Args: {
      p_decision: string;
      p_notes: string;
      p_requested_by: string;
      p_reversal_id: string;
    };
    Returns: string;
  };
  start_prize_payment_reversal: {
    Args: { p_notes: string; p_requested_by: string; p_reversal_id: string };
    Returns: string;
  };
  complete_prize_payment_reversal: {
    Args: {
      p_evidence_path: string | null;
      p_failure_reason: string | null;
      p_notes: string;
      p_outcome: string;
      p_requested_by: string;
      p_reversal_id: string;
      p_transaction_reference: string | null;
    };
    Returns: string;
  };
  reconcile_prize_payment: {
    Args: {
      p_external_reference: string | null;
      p_matched_amount: number | null;
      p_matched_currency: string | null;
      p_notes: string;
      p_payment_id: string;
      p_requested_by: string;
      p_statement_date: string | null;
      p_status: string;
    };
    Returns: string;
  };
};

type Phase9Public = Phase9Database["public"];

export type Database = Omit<Phase9Database, "public"> & {
  public: Omit<Phase9Public, "Tables" | "Functions"> & {
    Tables: Omit<Phase9Public["Tables"], keyof Phase10Tables> & Phase10Tables;
    Functions: Omit<Phase9Public["Functions"], keyof Phase10Functions> &
      Phase10Functions;
  };
};

export type { Json } from "@/types/database-phase9";