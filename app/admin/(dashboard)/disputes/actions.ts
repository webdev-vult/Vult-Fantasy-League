"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const TRIAGE_ROLES = ["super_admin", "support_officer"] as const;
const CASE_ROLES = [
  "super_admin",
  "support_officer",
  "competition_manager",
  "compliance_officer",
  "finance_officer",
] as const;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function required(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function optionalNumber(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${key.replaceAll("_", " ")} is invalid.`);
  return parsed;
}

function caseUrl(
  disputeId: string,
  type: "success" | "error",
  message: string,
): string {
  const params = new URLSearchParams({ [type]: message });
  return `/admin/disputes/${disputeId}?${params.toString()}`;
}

function refreshCase(disputeId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/disputes");
  revalidatePath(`/admin/disputes/${disputeId}`);
  revalidatePath("/admin/communications");
}

export async function assignDisputeAction(formData: FormData) {
  const admin = await requireAdminRole(TRIAGE_ROLES);
  const disputeId = required(formData, "dispute_id", "Dispute");

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("assign_dispute", {
      p_dispute_id: disputeId,
      p_assigned_to: required(formData, "assigned_to", "Assignee"),
      p_priority: required(formData, "priority", "Priority"),
      p_notes: required(formData, "notes", "Assignment notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirect(caseUrl(disputeId, "error", error instanceof Error ? error.message : "Unable to assign case."));
  }

  refreshCase(disputeId);
  redirect(caseUrl(disputeId, "success", "Case assignment recorded."));
}

export async function updateDisputeWorkflowAction(formData: FormData) {
  const admin = await requireAdminRole(CASE_ROLES);
  const disputeId = required(formData, "dispute_id", "Dispute");

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("update_dispute_workflow", {
      p_dispute_id: disputeId,
      p_status: required(formData, "status", "Workflow status"),
      p_escalated_to: text(formData, "escalated_to") || null,
      p_notes: required(formData, "notes", "Workflow notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirect(caseUrl(disputeId, "error", error instanceof Error ? error.message : "Unable to update case workflow."));
  }

  refreshCase(disputeId);
  redirect(caseUrl(disputeId, "success", "Case workflow updated."));
}

export async function addDisputeMessageAction(formData: FormData) {
  const admin = await requireAdminRole(CASE_ROLES);
  const disputeId = required(formData, "dispute_id", "Dispute");

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("add_admin_dispute_message", {
      p_dispute_id: disputeId,
      p_visibility: required(formData, "visibility", "Visibility"),
      p_channel: required(formData, "channel", "Channel"),
      p_message: required(formData, "message", "Message"),
      p_notify_email: formData.get("notify_email") === "on",
      p_notify_whatsapp: formData.get("notify_whatsapp") === "on",
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirect(caseUrl(disputeId, "error", error instanceof Error ? error.message : "Unable to add case message."));
  }

  refreshCase(disputeId);
  redirect(caseUrl(disputeId, "success", "Case message recorded."));
}

export async function addDisputeEvidenceAction(formData: FormData) {
  const admin = await requireAdminRole(CASE_ROLES);
  const disputeId = required(formData, "dispute_id", "Dispute");

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("add_admin_dispute_evidence", {
      p_dispute_id: disputeId,
      p_visibility: required(formData, "visibility", "Visibility"),
      p_evidence_type: required(formData, "evidence_type", "Evidence type"),
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
    redirect(caseUrl(disputeId, "error", error instanceof Error ? error.message : "Unable to add case evidence."));
  }

  refreshCase(disputeId);
  redirect(caseUrl(disputeId, "success", "Evidence reference recorded."));
}

export async function resolveDisputeAction(formData: FormData) {
  const admin = await requireAdminRole(CASE_ROLES);
  const disputeId = required(formData, "dispute_id", "Dispute");

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("resolve_dispute", {
      p_dispute_id: disputeId,
      p_decision: required(formData, "decision", "Decision"),
      p_resolution_summary: required(formData, "resolution_summary", "Resolution summary"),
      p_notify_email: formData.get("notify_email") === "on",
      p_notify_whatsapp: formData.get("notify_whatsapp") === "on",
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirect(caseUrl(disputeId, "error", error instanceof Error ? error.message : "Unable to record the final decision."));
  }

  refreshCase(disputeId);
  redirect(caseUrl(disputeId, "success", "Final case decision recorded."));
}

export async function closeDisputeAction(formData: FormData) {
  const admin = await requireAdminRole(TRIAGE_ROLES);
  const disputeId = required(formData, "dispute_id", "Dispute");

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("close_dispute", {
      p_dispute_id: disputeId,
      p_notes: required(formData, "notes", "Closure notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirect(caseUrl(disputeId, "error", error instanceof Error ? error.message : "Unable to close case."));
  }

  refreshCase(disputeId);
  redirect(caseUrl(disputeId, "success", "Case closed."));
}
