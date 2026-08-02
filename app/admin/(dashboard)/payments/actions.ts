"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const FINANCE_ROLES = ["super_admin", "finance_officer"] as const;
const DESTINATION_ROLES = ["super_admin", "compliance_officer"] as const;
const EVIDENCE_ROLES = ["super_admin", "finance_officer", "compliance_officer"] as const;
const SUPER_ADMIN_ROLES = ["super_admin"] as const;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function optionalNumber(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${key.replaceAll("_", " ")} is invalid.`);
  }
  return number;
}

function paymentUrl(
  type: "success" | "error",
  message: string,
  seasonId?: string,
  paymentId?: string,
) {
  const params = new URLSearchParams({ [type]: message });
  if (seasonId) params.set("season", seasonId);
  return paymentId
    ? `/admin/payments/${paymentId}?${params.toString()}`
    : `/admin/payments?${params.toString()}`;
}

function redirectWithMessage(
  type: "success" | "error",
  message: string,
  seasonId?: string,
  paymentId?: string,
): never {
  redirect(paymentUrl(type, message, seasonId, paymentId));
}

function refreshPayments(paymentId?: string, candidateId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/winners");
  if (paymentId) revalidatePath(`/admin/payments/${paymentId}`);
  if (candidateId) revalidatePath(`/admin/winners/${candidateId}`);
}

export async function preparePrizePaymentAction(formData: FormData) {
  const admin = await requireAdminRole(FINANCE_ROLES);
  const candidateId = requiredText(formData, "candidate_id", "Winner candidate");
  const seasonId = text(formData, "competition_season_id") || undefined;
  let paymentId = "";

  try {
    const db = createAdminSupabaseClient();
    const { data, error } = await db.rpc("prepare_prize_payment", {
      p_candidate_id: candidateId,
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Payment preparation did not return a settlement.");
    paymentId = String(data);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to prepare the prize settlement.",
      seasonId,
    );
  }

  refreshPayments(paymentId, candidateId);
  redirectWithMessage("success", "Prize settlement prepared successfully.", seasonId, paymentId);
}

export async function reviewPaymentDestinationAction(formData: FormData) {
  const admin = await requireAdminRole(DESTINATION_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.rpc("review_prize_payment_destination", {
      p_payment_id: paymentId,
      p_decision: requiredText(formData, "decision", "Decision"),
      p_destination_reference: requiredText(
        formData,
        "destination_reference",
        "Destination reference",
      ),
      p_notes: requiredText(formData, "notes", "Review notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to review the payment destination.",
      seasonId,
      paymentId,
    );
  }

  refreshPayments(paymentId);
  redirectWithMessage("success", "Destination review recorded.", seasonId, paymentId);
}

export async function financeReviewPaymentAction(formData: FormData) {
  const admin = await requireAdminRole(FINANCE_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.rpc("finance_review_prize_payment", {
      p_payment_id: paymentId,
      p_decision: requiredText(formData, "decision", "Decision"),
      p_notes: requiredText(formData, "notes", "Finance notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to complete finance review.",
      seasonId,
      paymentId,
    );
  }

  refreshPayments(paymentId);
  redirectWithMessage("success", "Finance review recorded.", seasonId, paymentId);
}

export async function startPaymentAttemptAction(formData: FormData) {
  const admin = await requireAdminRole(FINANCE_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.rpc("start_prize_payment_attempt", {
      p_payment_id: paymentId,
      p_processor: requiredText(formData, "processor", "Processor"),
      p_idempotency_key: requiredText(formData, "idempotency_key", "Idempotency key"),
      p_notes: requiredText(formData, "notes", "Attempt notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to start the payment attempt.",
      seasonId,
      paymentId,
    );
  }

  refreshPayments(paymentId);
  redirectWithMessage("success", "Payment attempt started.", seasonId, paymentId);
}

export async function completePaymentAttemptAction(formData: FormData) {
  const admin = await requireAdminRole(FINANCE_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");
  const seasonId = text(formData, "competition_season_id") || undefined;
  const outcome = requiredText(formData, "outcome", "Outcome");

  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.rpc("complete_prize_payment_attempt", {
      p_attempt_id: requiredText(formData, "attempt_id", "Payment attempt"),
      p_outcome: outcome,
      p_transaction_reference: text(formData, "transaction_reference") || null,
      p_evidence_path: text(formData, "evidence_path") || null,
      p_failure_code: text(formData, "failure_code") || null,
      p_failure_reason: text(formData, "failure_reason") || null,
      p_notes: requiredText(formData, "notes", "Completion notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to complete the payment attempt.",
      seasonId,
      paymentId,
    );
  }

  refreshPayments(paymentId);
  redirectWithMessage(
    "success",
    outcome === "succeeded" ? "Payment recorded as successful." : "Payment failure recorded.",
    seasonId,
    paymentId,
  );
}

export async function cancelPrizePaymentAction(formData: FormData) {
  const admin = await requireAdminRole(FINANCE_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.rpc("cancel_prize_payment", {
      p_payment_id: paymentId,
      p_reason: requiredText(formData, "reason", "Cancellation reason"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to cancel the prize settlement.",
      seasonId,
      paymentId,
    );
  }

  refreshPayments(paymentId);
  redirectWithMessage("success", "Prize settlement cancelled.", seasonId, paymentId);
}

export async function reopenPrizePaymentAction(formData: FormData) {
  const admin = await requireAdminRole(SUPER_ADMIN_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.rpc("reopen_prize_payment", {
      p_payment_id: paymentId,
      p_reason: requiredText(formData, "reason", "Reopen reason"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to reopen the prize settlement.",
      seasonId,
      paymentId,
    );
  }

  refreshPayments(paymentId);
  redirectWithMessage("success", "Prize settlement reopened.", seasonId, paymentId);
}

export async function addPaymentEvidenceAction(formData: FormData) {
  const admin = await requireAdminRole(EVIDENCE_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.rpc("add_prize_payment_evidence", {
      p_payment_id: paymentId,
      p_attempt_id: text(formData, "attempt_id") || null,
      p_evidence_type: requiredText(formData, "evidence_type", "Evidence type"),
      p_storage_path: text(formData, "storage_path") || null,
      p_external_url: text(formData, "external_url") || null,
      p_file_name: text(formData, "file_name") || null,
      p_mime_type: text(formData, "mime_type") || null,
      p_size_bytes: optionalNumber(formData, "size_bytes"),
      p_notes: text(formData, "notes") || null,
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to record payment evidence.",
      seasonId,
      paymentId,
    );
  }

  refreshPayments(paymentId);
  redirectWithMessage("success", "Payment evidence recorded.", seasonId, paymentId);
}

export async function requestPaymentReversalAction(formData: FormData) {
  const admin = await requireAdminRole(FINANCE_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.rpc("request_prize_payment_reversal", {
      p_payment_id: paymentId,
      p_reason: requiredText(formData, "reason", "Reversal reason"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to request the reversal.",
      seasonId,
      paymentId,
    );
  }

  refreshPayments(paymentId);
  redirectWithMessage("success", "Reversal submitted for Super Admin review.", seasonId, paymentId);
}

export async function reviewPaymentReversalAction(formData: FormData) {
  const admin = await requireAdminRole(SUPER_ADMIN_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.rpc("review_prize_payment_reversal", {
      p_reversal_id: requiredText(formData, "reversal_id", "Reversal"),
      p_decision: requiredText(formData, "decision", "Decision"),
      p_notes: requiredText(formData, "notes", "Review notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to review the reversal.",
      seasonId,
      paymentId,
    );
  }

  refreshPayments(paymentId);
  redirectWithMessage("success", "Reversal review recorded.", seasonId, paymentId);
}

export async function startPaymentReversalAction(formData: FormData) {
  const admin = await requireAdminRole(FINANCE_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.rpc("start_prize_payment_reversal", {
      p_reversal_id: requiredText(formData, "reversal_id", "Reversal"),
      p_notes: requiredText(formData, "notes", "Processing notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to start reversal processing.",
      seasonId,
      paymentId,
    );
  }

  refreshPayments(paymentId);
  redirectWithMessage("success", "Reversal processing started.", seasonId, paymentId);
}

export async function completePaymentReversalAction(formData: FormData) {
  const admin = await requireAdminRole(FINANCE_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");
  const seasonId = text(formData, "competition_season_id") || undefined;
  const outcome = requiredText(formData, "outcome", "Outcome");

  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.rpc("complete_prize_payment_reversal", {
      p_reversal_id: requiredText(formData, "reversal_id", "Reversal"),
      p_outcome: outcome,
      p_transaction_reference: text(formData, "transaction_reference") || null,
      p_evidence_path: text(formData, "evidence_path") || null,
      p_failure_reason: text(formData, "failure_reason") || null,
      p_notes: requiredText(formData, "notes", "Completion notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to complete the reversal.",
      seasonId,
      paymentId,
    );
  }

  refreshPayments(paymentId);
  redirectWithMessage(
    "success",
    outcome === "completed" ? "Reversal completed." : "Reversal failure recorded.",
    seasonId,
    paymentId,
  );
}

export async function reconcilePrizePaymentAction(formData: FormData) {
  const admin = await requireAdminRole(FINANCE_ROLES);
  const paymentId = requiredText(formData, "payment_id", "Prize settlement");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient();
    const { error } = await db.rpc("reconcile_prize_payment", {
      p_payment_id: paymentId,
      p_status: requiredText(formData, "status", "Reconciliation status"),
      p_external_reference: text(formData, "external_reference") || null,
      p_matched_amount: optionalNumber(formData, "matched_amount"),
      p_matched_currency: text(formData, "matched_currency") || null,
      p_statement_date: text(formData, "statement_date") || null,
      p_notes: requiredText(formData, "notes", "Reconciliation notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to record reconciliation.",
      seasonId,
      paymentId,
    );
  }

  refreshPayments(paymentId);
  redirectWithMessage("success", "Reconciliation review recorded.", seasonId, paymentId);
}
