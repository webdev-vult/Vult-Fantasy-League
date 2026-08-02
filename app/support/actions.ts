"use server";

import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function required(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function safeMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const allowed = [
    "registration reference or contact details",
    "case reference or contact details",
    "similar open case",
    "category is invalid",
    "Subject must",
    "Description must",
    "Evidence URL",
    "access link is invalid or expired",
    "closed to participant replies",
    "Reply must",
  ];
  return allowed.some((item) => error.message.toLowerCase().includes(item.toLowerCase()))
    ? error.message
    : fallback;
}

function supportRedirect(message: string, type: "success" | "error" = "error"): never {
  const params = new URLSearchParams({ [type]: message });
  redirect(`/support?${params.toString()}`);
}

export async function submitDisputeAction(formData: FormData) {
  let caseReference = "";
  let accessToken = "";

  try {
    const db = createAdminSupabaseClient() as any;
    const { data, error } = await db.rpc("submit_participant_dispute", {
      p_registration_reference: required(formData, "registration_reference", "Registration reference"),
      p_contact: required(formData, "contact", "Registered email or phone"),
      p_category: required(formData, "category", "Category"),
      p_subject: required(formData, "subject", "Subject"),
      p_description: required(formData, "description", "Description"),
      p_related_reference: text(formData, "related_reference") || null,
      p_evidence_url: text(formData, "evidence_url") || null,
      p_honeypot: text(formData, "website") || null,
    });
    if (error) throw new Error(error.message);
    caseReference = String(data?.case_reference ?? "");
    accessToken = String(data?.access_token ?? "");
    if (!caseReference || !accessToken) throw new Error("The case could not be opened.");
  } catch (error) {
    supportRedirect(safeMessage(error, "Unable to submit the case. Check your details and try again."));
  }

  const params = new URLSearchParams({ access: accessToken, created: "1" });
  redirect(`/support/cases/${encodeURIComponent(caseReference)}?${params.toString()}`);
}

export async function accessDisputeAction(formData: FormData) {
  let caseReference = "";
  let accessToken = "";

  try {
    caseReference = required(formData, "case_reference", "Case reference").toUpperCase();
    const db = createAdminSupabaseClient() as any;
    const { data, error } = await db.rpc("create_dispute_public_access", {
      p_case_reference: caseReference,
      p_contact: required(formData, "contact", "Registered email or phone"),
    });
    if (error) throw new Error(error.message);
    accessToken = String(data?.access_token ?? "");
    caseReference = String(data?.case_reference ?? caseReference);
    if (!accessToken) throw new Error("Unable to create case access.");
  } catch (error) {
    supportRedirect(safeMessage(error, "Unable to find that case. Check the reference and contact details."));
  }

  redirect(`/support/cases/${encodeURIComponent(caseReference)}?access=${encodeURIComponent(accessToken)}`);
}

export async function replyToDisputeAction(formData: FormData) {
  const caseReference = required(formData, "case_reference", "Case reference").toUpperCase();
  const accessToken = required(formData, "access_token", "Access token");

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("reply_to_public_dispute", {
      p_case_reference: caseReference,
      p_access_token: accessToken,
      p_message: required(formData, "message", "Reply"),
      p_evidence_url: text(formData, "evidence_url") || null,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    const params = new URLSearchParams({
      access: accessToken,
      error: safeMessage(error, "Unable to add the reply."),
    });
    redirect(`/support/cases/${encodeURIComponent(caseReference)}?${params.toString()}`);
  }

  const params = new URLSearchParams({ access: accessToken, success: "Reply added successfully." });
  redirect(`/support/cases/${encodeURIComponent(caseReference)}?${params.toString()}`);
}
