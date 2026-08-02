"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const SCORE_ROLES = ["super_admin", "competition_manager"] as const;
const PUBLICATION_ROLES = ["super_admin", "competition_manager", "content_manager"] as const;
const SCOPES = ["round", "monthly", "overall"] as const;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function integer(formData: FormData, key: string, label: string, minimum?: number) {
  const value = Number.parseInt(requiredText(formData, key, label), 10);
  if (!Number.isInteger(value) || (minimum !== undefined && value < minimum)) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function redirectWithMessage(
  type: "success" | "error",
  message: string,
  seasonId?: string,
  roundId?: string,
): never {
  const params = new URLSearchParams({ [type]: message });
  if (seasonId) params.set("season", seasonId);
  if (roundId) params.set("round", roundId);
  redirect(`/admin/leaderboards?${params.toString()}`);
}

function refreshLeaderboards() {
  revalidatePath("/admin");
  revalidatePath("/admin/leaderboards");
  revalidatePath("/leaderboards");
}

export async function promoteScoresAction(formData: FormData) {
  const admin = await requireAdminRole(SCORE_ROLES);
  const seasonId = requiredText(formData, "competition_season_id", "Competition season");
  const roundId = requiredText(formData, "round_id", "Gameweek");

  try {
    const syncRunId = requiredText(formData, "provider_sync_run_id", "Provider run");
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("promote_provider_scores", {
      p_competition_season_id: seasonId,
      p_round_id: roundId,
      p_provider_sync_run_id: syncRunId,
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to promote provider scores.",
      seasonId,
      roundId,
    );
  }

  refreshLeaderboards();
  redirectWithMessage("success", "Provider scores promoted and rankings recalculated.", seasonId, roundId);
}

export async function refreshScoreboardsAction(formData: FormData) {
  const admin = await requireAdminRole(SCORE_ROLES);
  const seasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("refresh_scoreboards", {
      p_competition_season_id: seasonId,
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to refresh scoreboards.",
      seasonId,
    );
  }

  refreshLeaderboards();
  redirectWithMessage("success", "Gameweek, monthly and overall rankings refreshed.", seasonId);
}

export async function setRoundFinalityAction(formData: FormData) {
  const admin = await requireAdminRole(SCORE_ROLES);
  const seasonId = requiredText(formData, "competition_season_id", "Competition season");
  const roundId = requiredText(formData, "round_id", "Gameweek");
  const final = text(formData, "final") === "true";

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("set_round_scores_finality", {
      p_round_id: roundId,
      p_final: final,
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to update score finality.",
      seasonId,
      roundId,
    );
  }

  refreshLeaderboards();
  redirectWithMessage(
    "success",
    final ? "Gameweek scores finalised." : "Gameweek scores reopened as provisional.",
    seasonId,
    roundId,
  );
}

export async function correctScoreAction(formData: FormData) {
  const admin = await requireAdminRole(SCORE_ROLES);
  const seasonId = requiredText(formData, "competition_season_id", "Competition season");
  const roundId = requiredText(formData, "round_id", "Gameweek");

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("apply_round_score_correction", {
      p_round_score_id: requiredText(formData, "round_score_id", "Score record"),
      p_reported_points: integer(formData, "reported_points", "Reported points"),
      p_total_points: integer(formData, "total_points", "Total points"),
      p_transfer_cost: integer(formData, "transfer_cost", "Transfer cost", 0),
      p_chip_used: text(formData, "chip_used") || null,
      p_reason: requiredText(formData, "reason", "Correction reason"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to correct the score.",
      seasonId,
      roundId,
    );
  }

  refreshLeaderboards();
  redirectWithMessage("success", "Score corrected and all rankings recalculated.", seasonId, roundId);
}

export async function publishLeaderboardAction(formData: FormData) {
  const admin = await requireAdminRole(PUBLICATION_ROLES);
  const seasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const scope = requiredText(formData, "scope", "Leaderboard scope");
    if (!SCOPES.includes(scope as (typeof SCOPES)[number])) {
      throw new Error("Leaderboard scope is invalid.");
    }

    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("publish_leaderboard", {
      p_competition_season_id: seasonId,
      p_scope: scope,
      p_round_id: scope === "round" ? requiredText(formData, "round_id", "Gameweek") : null,
      p_monthly_period_id:
        scope === "monthly" ? requiredText(formData, "monthly_period_id", "Monthly period") : null,
      p_title: requiredText(formData, "title", "Publication title"),
      p_notes: text(formData, "notes") || null,
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to publish the leaderboard.",
      seasonId,
    );
  }

  refreshLeaderboards();
  redirectWithMessage("success", "Leaderboard snapshot published successfully.", seasonId);
}

export async function withdrawLeaderboardAction(formData: FormData) {
  const admin = await requireAdminRole(PUBLICATION_ROLES);
  const seasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const db = createAdminSupabaseClient() as any;
    const { error } = await db.rpc("withdraw_leaderboard", {
      p_publication_id: requiredText(formData, "publication_id", "Publication"),
      p_reason: requiredText(formData, "reason", "Withdrawal reason"),
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to withdraw the leaderboard.",
      seasonId,
    );
  }

  refreshLeaderboards();
  redirectWithMessage("success", "Leaderboard publication withdrawn.", seasonId);
}
