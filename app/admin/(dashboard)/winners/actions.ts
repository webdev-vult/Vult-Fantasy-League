"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const GENERATION_ROLES = ["super_admin", "competition_manager"] as const;
const COMPETITION_REVIEW_ROLES = ["super_admin", "competition_manager"] as const;
const COMPLIANCE_REVIEW_ROLES = ["super_admin", "compliance_officer"] as const;
const CONFIRMATION_ROLES = ["super_admin"] as const;
const SCOPES = ["round", "monthly", "overall"] as const;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function winnerUrl(
  type: "success" | "error",
  message: string,
  seasonId?: string,
  candidateId?: string,
) {
  const params = new URLSearchParams({ [type]: message });
  if (seasonId) params.set("season", seasonId);
  return candidateId
    ? `/admin/winners/${candidateId}?${params.toString()}`
    : `/admin/winners?${params.toString()}`;
}

function redirectWithMessage(
  type: "success" | "error",
  message: string,
  seasonId?: string,
  candidateId?: string,
): never {
  redirect(winnerUrl(type, message, seasonId, candidateId));
}

function refreshWinners(candidateId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/winners");
  if (candidateId) revalidatePath(`/admin/winners/${candidateId}`);
}

export async function generateWinnerCandidateAction(formData: FormData) {
  const admin = await requireAdminRole(GENERATION_ROLES);
  const seasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const scope = requiredText(formData, "scope", "Winner scope");
    if (!SCOPES.includes(scope as (typeof SCOPES)[number])) {
      throw new Error("Winner scope is invalid.");
    }

    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("generate_winner_candidate", {
      p_competition_season_id: seasonId,
      p_prize_id: requiredText(formData, "prize_id", "Prize"),
      p_scope: scope,
      p_round_id: scope === "round" ? requiredText(formData, "round_id", "Gameweek") : null,
      p_monthly_period_id:
        scope === "monthly"
          ? requiredText(formData, "monthly_period_id", "Monthly period")
          : null,
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to generate the winner candidate.",
      seasonId,
    );
  }

  refreshWinners();
  redirectWithMessage("success", "Winner generation completed.", seasonId);
}

export async function competitionReviewWinnerAction(formData: FormData) {
  const admin = await requireAdminRole(COMPETITION_REVIEW_ROLES);
  const candidateId = requiredText(formData, "candidate_id", "Winner candidate");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("competition_review_winner_candidate", {
      p_candidate_id: candidateId,
      p_decision: requiredText(formData, "decision", "Decision"),
      p_notes: requiredText(formData, "notes", "Review notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to complete competition review.",
      seasonId,
      candidateId,
    );
  }

  refreshWinners(candidateId);
  redirectWithMessage("success", "Competition review recorded.", seasonId, candidateId);
}

export async function complianceReviewWinnerAction(formData: FormData) {
  const admin = await requireAdminRole(COMPLIANCE_REVIEW_ROLES);
  const candidateId = requiredText(formData, "candidate_id", "Winner candidate");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("compliance_review_winner_candidate", {
      p_candidate_id: candidateId,
      p_decision: requiredText(formData, "decision", "Decision"),
      p_notes: requiredText(formData, "notes", "Review notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to complete compliance review.",
      seasonId,
      candidateId,
    );
  }

  refreshWinners(candidateId);
  redirectWithMessage("success", "Compliance review recorded.", seasonId, candidateId);
}

export async function confirmWinnerAction(formData: FormData) {
  const admin = await requireAdminRole(CONFIRMATION_ROLES);
  const candidateId = requiredText(formData, "candidate_id", "Winner candidate");
  const seasonId = text(formData, "competition_season_id") || undefined;

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("confirm_winner_candidate", {
      p_candidate_id: candidateId,
      p_notes: requiredText(formData, "notes", "Confirmation notes"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to confirm the winner.",
      seasonId,
      candidateId,
    );
  }

  refreshWinners(candidateId);
  redirectWithMessage("success", "Winner confirmed successfully.", seasonId, candidateId);
}

export async function replaceWinnerCandidateAction(formData: FormData) {
  const admin = await requireAdminRole(GENERATION_ROLES);
  const candidateId = requiredText(formData, "candidate_id", "Winner candidate");
  const seasonId = text(formData, "competition_season_id") || undefined;
  let replacementCandidateId = "";

  try {
    const db = createAdminSupabaseClient() as any;
    const { data, error } = await db.rpc("replace_winner_candidate", {
      p_candidate_id: candidateId,
      p_reason: requiredText(formData, "reason", "Replacement reason"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("The replacement workflow did not return a candidate.");
    replacementCandidateId = String(data);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to generate a replacement candidate.",
      seasonId,
      candidateId,
    );
  }

  refreshWinners(candidateId);
  refreshWinners(replacementCandidateId);
  redirectWithMessage(
    "success",
    "Replacement candidate generated successfully.",
    seasonId,
    replacementCandidateId,
  );
}
