"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const VERIFICATION_ROLES = [
  "super_admin",
  "competition_manager",
  "compliance_officer",
] as const;
const NOTE_ROLES = [
  "super_admin",
  "competition_manager",
  "compliance_officer",
  "support_officer",
] as const;
const VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "failed",
  "review_required",
  "not_required",
] as const;
const REGISTRATION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "suspended",
  "disqualified",
] as const;
const NOTE_TYPES = ["internal", "verification", "compliance", "support"] as const;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function optionalText(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function assertAllowed<T extends readonly string[]>(
  value: string,
  allowed: T,
  label: string,
): T[number] {
  if (!allowed.includes(value)) throw new Error(`${label} is invalid.`);
  return value as T[number];
}

function redirectToRegistration(
  registrationId: string,
  type: "success" | "error",
  message: string,
): never {
  const params = new URLSearchParams({ [type]: message });
  redirect(`/admin/participants/${registrationId}?${params.toString()}`);
}

function refreshParticipantRoutes(registrationId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/participants");
  revalidatePath(`/admin/participants/${registrationId}`);
}

async function writeAuditLog(
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Json,
) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("audit_logs").insert({
    actor_user_id: actorUserId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });

  if (error) console.error("Unable to write participant audit log", error.message);
}

export async function updateParticipantProfileAction(formData: FormData) {
  const admin = await requireAdminRole(VERIFICATION_ROLES);
  const registrationId = requiredText(formData, "registration_id", "Registration");

  try {
    const participantId = requiredText(formData, "participant_id", "Participant");
    const fullName = requiredText(formData, "full_name", "Full name");
    const phone = requiredText(formData, "phone", "Vult phone number");
    const country = requiredText(formData, "country", "Country").toUpperCase();

    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const { data: existing, error: existingError } = await db
      .from("participants")
      .select("id, full_name, email, phone, whatsapp_phone, country")
      .eq("id", participantId)
      .single();

    if (existingError || !existing) {
      throw new Error(existingError?.message ?? "Participant not found.");
    }

    const updates = {
      full_name: fullName,
      email: optionalText(formData, "email"),
      phone,
      whatsapp_phone: optionalText(formData, "whatsapp_phone"),
      country,
    };

    const { error } = await db.from("participants").update(updates).eq("id", participantId);
    if (error) {
      if (error.code === "23505") {
        throw new Error("The Vult phone number or email address is already used by another participant.");
      }
      throw new Error(error.message);
    }

    await writeAuditLog(admin.id, "participant_profile_updated", "participant", participantId, {
      registration_id: registrationId,
      previous: existing,
      updated: updates,
    });
  } catch (error) {
    redirectToRegistration(
      registrationId,
      "error",
      error instanceof Error ? error.message : "Unable to update participant details.",
    );
  }

  refreshParticipantRoutes(registrationId);
  redirectToRegistration(registrationId, "success", "Participant details updated.");
}

// Kept as a protected exception workflow for authorised administrators.
// Normal registrations are automatically FPL-verified when the official
// Vult mini-league lookup resolves Team + Manager to a numeric Entry ID.
export async function updateFplVerificationAction(formData: FormData) {
  const admin = await requireAdminRole(VERIFICATION_ROLES);
  const registrationId = requiredText(formData, "registration_id", "Registration");

  try {
    const status = assertAllowed(
      requiredText(formData, "fpl_status", "FPL status"),
      VERIFICATION_STATUSES,
      "FPL status",
    );
    const entryId = optionalText(formData, "fpl_verified_entry_id");
    const managerName = optionalText(formData, "fpl_manager_name");
    const teamName = optionalText(formData, "fpl_team_name");

    if (status === "verified" && (!entryId || !/^\d{1,12}$/.test(entryId))) {
      throw new Error("A valid numeric FPL Entry ID is required for verification.");
    }

    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const now = new Date().toISOString();
    const { error } = await db.from("registration_verifications").upsert(
      {
        registration_id: registrationId,
        fpl_status: status,
        fpl_verified_entry_id: entryId,
        fpl_manager_name: managerName,
        fpl_team_name: teamName,
        fpl_notes: optionalText(formData, "fpl_notes"),
        fpl_checked_at: now,
        fpl_checked_by: admin.id,
      },
      { onConflict: "registration_id" },
    );

    if (error) throw new Error(error.message);

    const { error: entryError } = await db
      .from("fantasy_entries")
      .update({
        provider_entry_id: entryId ?? undefined,
        manager_name: managerName,
        team_name: teamName,
        verified_at: status === "verified" ? now : null,
      })
      .eq("registration_id", registrationId);

    if (entryError) throw new Error(entryError.message);

    const { error: riskError } = await db.rpc("refresh_registration_duplicate_risk", {
      p_registration_id: registrationId,
    });
    if (riskError) throw new Error(riskError.message);

    await writeAuditLog(admin.id, "fpl_verification_updated", "registration", registrationId, {
      status,
      verified_entry_id: entryId,
      manager_name: managerName,
      team_name: teamName,
      source: "admin_exception_workflow",
    });
  } catch (error) {
    redirectToRegistration(
      registrationId,
      "error",
      error instanceof Error ? error.message : "Unable to update FPL verification.",
    );
  }

  refreshParticipantRoutes(registrationId);
  redirectToRegistration(registrationId, "success", "FPL verification updated.");
}

export async function updateVultVerificationAction(formData: FormData) {
  const admin = await requireAdminRole(VERIFICATION_ROLES);
  const registrationId = requiredText(formData, "registration_id", "Registration");

  try {
    const status = assertAllowed(
      requiredText(formData, "vult_status", "Vult status"),
      VERIFICATION_STATUSES,
      "Vult status",
    );

    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const { data: registration, error: registrationError } = await db
      .from("registrations")
      .select("participant_id")
      .eq("id", registrationId)
      .single();

    if (registrationError || !registration) {
      throw new Error(registrationError?.message ?? "Registration not found.");
    }

    const { data: participant, error: participantError } = await db
      .from("participants")
      .select("phone")
      .eq("id", registration.participant_id)
      .single();

    if (participantError || !participant) {
      throw new Error(participantError?.message ?? "Participant not found.");
    }

    const vultPhone = String(participant.phone ?? "").trim();
    if (status === "verified" && !vultPhone) {
      throw new Error("A Vult phone number is required before Vult verification can be completed.");
    }

    const checkedAt = new Date().toISOString();
    const { error } = await db.from("registration_verifications").upsert(
      {
        registration_id: registrationId,
        vult_status: status,
        // Legacy column retained for compatibility; it now stores the verified Vult phone number.
        vult_verified_reference: status === "verified" ? vultPhone : null,
        vult_notes: optionalText(formData, "vult_notes"),
        vult_checked_at: checkedAt,
        vult_checked_by: admin.id,
      },
      { onConflict: "registration_id" },
    );

    if (error) throw new Error(error.message);

    await writeAuditLog(admin.id, "vult_verification_updated", "registration", registrationId, {
      status,
      vult_phone_number: status === "verified" ? vultPhone : null,
      verification_source: "vult_phone_lookup",
      checked_at: checkedAt,
    });
  } catch (error) {
    redirectToRegistration(
      registrationId,
      "error",
      error instanceof Error ? error.message : "Unable to update Vult verification.",
    );
  }

  refreshParticipantRoutes(registrationId);
  redirectToRegistration(registrationId, "success", "Vult verification updated.");
}

export async function refreshDuplicateRiskAction(formData: FormData) {
  await requireAdminRole(VERIFICATION_ROLES);
  const registrationId = requiredText(formData, "registration_id", "Registration");

  try {
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const { error } = await db.rpc("refresh_registration_duplicate_risk", {
      p_registration_id: registrationId,
    });

    if (error) throw new Error(error.message);
  } catch (error) {
    redirectToRegistration(
      registrationId,
      "error",
      error instanceof Error ? error.message : "Unable to refresh duplicate risk.",
    );
  }

  refreshParticipantRoutes(registrationId);
  redirectToRegistration(registrationId, "success", "Duplicate-risk check refreshed.");
}

export async function transitionRegistrationStatusAction(formData: FormData) {
  await requireAdminRole(VERIFICATION_ROLES);
  const registrationId = requiredText(formData, "registration_id", "Registration");

  try {
    const status = assertAllowed(
      requiredText(formData, "new_status", "Registration status"),
      REGISTRATION_STATUSES,
      "Registration status",
    );
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const { error } = await db.rpc("transition_registration_status", {
      p_registration_id: registrationId,
      p_new_status: status,
      p_reason: optionalText(formData, "reason"),
    });

    if (error) throw new Error(error.message);
  } catch (error) {
    redirectToRegistration(
      registrationId,
      "error",
      error instanceof Error ? error.message : "Unable to change registration status.",
    );
  }

  refreshParticipantRoutes(registrationId);
  redirectToRegistration(registrationId, "success", "Registration status updated.");
}

export async function addRegistrationNoteAction(formData: FormData) {
  const admin = await requireAdminRole(NOTE_ROLES);
  const registrationId = requiredText(formData, "registration_id", "Registration");

  try {
    const noteType = assertAllowed(
      requiredText(formData, "note_type", "Note type"),
      NOTE_TYPES,
      "Note type",
    );
    const body = requiredText(formData, "body", "Note");
    if (body.length > 2000) throw new Error("Note cannot exceed 2,000 characters.");

    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const { data, error } = await db
      .from("registration_notes")
      .insert({
        registration_id: registrationId,
        author_user_id: admin.id,
        note_type: noteType,
        body,
        is_pinned: formData.get("is_pinned") === "on",
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Unable to add note.");

    await writeAuditLog(admin.id, "registration_note_added", "registration_note", data.id, {
      registration_id: registrationId,
      note_type: noteType,
      is_pinned: formData.get("is_pinned") === "on",
    });
  } catch (error) {
    redirectToRegistration(
      registrationId,
      "error",
      error instanceof Error ? error.message : "Unable to add note.",
    );
  }

  refreshParticipantRoutes(registrationId);
  redirectToRegistration(registrationId, "success", "Internal note added.");
}
