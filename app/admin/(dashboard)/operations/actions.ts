"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const MANAGEMENT_ROLES = ["super_admin", "competition_manager"] as const;
const PRIZE_ROLES = ["super_admin", "competition_manager", "finance_officer"] as const;

const ROUND_STATUSES = [
  "scheduled",
  "live",
  "awaiting_finalisation",
  "final",
  "locked",
  "cancelled",
] as const;
const PERIOD_STATUSES = ["draft", "active", "completed", "locked"] as const;
const PRIZE_FREQUENCIES = ["weekly", "monthly", "overall", "special"] as const;
const PRIZE_TYPES = ["cash", "non_cash", "mixed"] as const;
const CHIP_POLICIES = ["allow_all", "exclude_score_affecting_chips"] as const;

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

function integer(formData: FormData, key: string, label: string, minimum = 0) {
  const value = Number.parseInt(text(formData, key), 10);
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be ${minimum} or greater.`);
  }
  return value;
}

function decimal(formData: FormData, key: string, label: string, minimum = 0) {
  const value = Number.parseFloat(text(formData, key));
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be ${minimum} or greater.`);
  }
  return value;
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function optionalIsoDateTime(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is invalid.`);
  return parsed.toISOString();
}

function assertAllowed<T extends readonly string[]>(value: string, allowed: T, label: string): T[number] {
  if (!allowed.includes(value)) throw new Error(`${label} is invalid.`);
  return value as T[number];
}

function prizeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function redirectWithMessage(type: "success" | "error", message: string, seasonId?: string): never {
  const params = new URLSearchParams({ [type]: message });
  if (seasonId) params.set("season", seasonId);
  redirect(`/admin/operations?${params.toString()}`);
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

  if (error) console.error("Unable to write operations audit log", error.message);
}

function refreshOperations() {
  revalidatePath("/admin");
  revalidatePath("/admin/operations");
}

export async function seedRoundsAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);
  const competitionSeasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const totalRounds = integer(formData, "total_rounds", "Total rounds", 1);
    if (totalRounds > 60) throw new Error("Total rounds cannot exceed 60.");

    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const rows = Array.from({ length: totalRounds }, (_, index) => ({
      competition_season_id: competitionSeasonId,
      external_round_id: index + 1,
      name: `Gameweek ${index + 1}`,
    }));

    const { error } = await db
      .from("rounds")
      .upsert(rows, { onConflict: "competition_season_id,external_round_id" });

    if (error) throw new Error(error.message);

    await writeAuditLog(admin.id, "seed_rounds", "competition_season", competitionSeasonId, {
      total_rounds: totalRounds,
    });
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to create rounds.",
      competitionSeasonId,
    );
  }

  refreshOperations();
  redirectWithMessage("success", "Rounds created successfully.", competitionSeasonId);
}

export async function updateRoundAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);
  const competitionSeasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const id = requiredText(formData, "id", "Round");
    const status = assertAllowed(requiredText(formData, "status", "Round status"), ROUND_STATUSES, "Round status");
    const deadlineAt = optionalIsoDateTime(formData, "deadline_at", "Round deadline");
    const isCurrent = checked(formData, "is_current");
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;

    const { data: existing, error: existingError } = await db
      .from("rounds")
      .select("id, name, status, is_current, is_final, finalised_at, locked_at")
      .eq("id", id)
      .eq("competition_season_id", competitionSeasonId)
      .single();

    if (existingError || !existing) throw new Error(existingError?.message ?? "Round not found.");

    if (existing.status === "locked" && status !== "locked" && admin.role !== "super_admin") {
      throw new Error("Only a Super Admin can reopen a locked round.");
    }

    if (isCurrent) {
      const { error: clearError } = await db
        .from("rounds")
        .update({ is_current: false })
        .eq("competition_season_id", competitionSeasonId)
        .neq("id", id)
        .eq("is_current", true);
      if (clearError) throw new Error(clearError.message);
    }

    const now = new Date().toISOString();
    const isFinal = status === "final" || status === "locked";
    const { data, error } = await db
      .from("rounds")
      .update({
        status,
        deadline_at: deadlineAt,
        is_current: isCurrent,
        is_final: isFinal,
        finalised_at: isFinal ? existing.finalised_at ?? now : null,
        locked_at: status === "locked" ? existing.locked_at ?? now : null,
        locked_by: status === "locked" ? admin.id : null,
      })
      .eq("id", id)
      .eq("competition_season_id", competitionSeasonId)
      .select("id, name, status, is_current, is_final")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Unable to update the round.");

    await writeAuditLog(admin.id, "update_round", "round", data.id, {
      name: data.name,
      previous_status: existing.status,
      status: data.status,
      is_current: data.is_current,
      is_final: data.is_final,
    });
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to update the round.",
      competitionSeasonId,
    );
  }

  refreshOperations();
  redirectWithMessage("success", "Round updated successfully.", competitionSeasonId);
}

export async function createMonthlyPeriodAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);
  const competitionSeasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const name = requiredText(formData, "name", "Period name");
    const startRound = integer(formData, "start_round", "Start round", 1);
    const endRound = integer(formData, "end_round", "End round", 1);
    const status = assertAllowed(requiredText(formData, "status", "Period status"), PERIOD_STATUSES, "Period status");
    if (endRound < startRound) throw new Error("End round cannot be before the start round.");

    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const { data: lastRound } = await db
      .from("rounds")
      .select("external_round_id")
      .eq("competition_season_id", competitionSeasonId)
      .order("external_round_id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastRound && endRound > lastRound.external_round_id) {
      throw new Error(`End round cannot exceed Gameweek ${lastRound.external_round_id}.`);
    }

    const { data: overlap, error: overlapError } = await db
      .from("monthly_periods")
      .select("id, name, start_round, end_round")
      .eq("competition_season_id", competitionSeasonId)
      .lte("start_round", endRound)
      .gte("end_round", startRound)
      .limit(1)
      .maybeSingle();

    if (overlapError) throw new Error(overlapError.message);
    if (overlap) throw new Error(`This range overlaps ${overlap.name} (GW${overlap.start_round}–GW${overlap.end_round}).`);

    const { data, error } = await db
      .from("monthly_periods")
      .insert({
        competition_season_id: competitionSeasonId,
        name,
        description: optionalText(formData, "description"),
        start_round: startRound,
        end_round: endRound,
        status,
      })
      .select("id, name, start_round, end_round, status")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Unable to create the monthly period.");

    await writeAuditLog(admin.id, "create_monthly_period", "monthly_period", data.id, {
      name: data.name,
      start_round: data.start_round,
      end_round: data.end_round,
      status: data.status,
    });
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to create the monthly period.",
      competitionSeasonId,
    );
  }

  refreshOperations();
  redirectWithMessage("success", "Monthly period created successfully.", competitionSeasonId);
}

export async function updateMonthlyPeriodAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);
  const competitionSeasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const id = requiredText(formData, "id", "Monthly period");
    const status = assertAllowed(requiredText(formData, "status", "Period status"), PERIOD_STATUSES, "Period status");
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const { data, error } = await db
      .from("monthly_periods")
      .update({ status })
      .eq("id", id)
      .eq("competition_season_id", competitionSeasonId)
      .select("id, name, status")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Unable to update the monthly period.");
    await writeAuditLog(admin.id, "update_monthly_period", "monthly_period", data.id, {
      name: data.name,
      status: data.status,
    });
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to update the monthly period.",
      competitionSeasonId,
    );
  }

  refreshOperations();
  redirectWithMessage("success", "Monthly period updated successfully.", competitionSeasonId);
}

export async function createRuleVersionAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);
  const competitionSeasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const chipPolicy = assertAllowed(
      requiredText(formData, "weekly_chip_policy", "Weekly chip policy"),
      CHIP_POLICIES,
      "Weekly chip policy",
    );
    const countries = requiredText(formData, "eligible_country_codes", "Eligible countries")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    const tieBreakers = requiredText(formData, "tie_breakers", "Tie-breakers")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const disqualificationRules = text(formData, "disqualification_rules")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!countries.length) throw new Error("At least one eligible country is required.");
    if (!tieBreakers.length) throw new Error("At least one tie-breaker is required.");

    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const { data: latest, error: latestError } = await db
      .from("competition_rules")
      .select("version")
      .eq("competition_season_id", competitionSeasonId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw new Error(latestError.message);

    const version = (latest?.version ?? 0) + 1;
    const { data, error } = await db
      .from("competition_rules")
      .insert({
        competition_season_id: competitionSeasonId,
        version,
        title: requiredText(formData, "title", "Rule title"),
        minimum_age: integer(formData, "minimum_age", "Minimum age", 0),
        eligible_country_codes: countries,
        requires_vult_account: checked(formData, "requires_vult_account"),
        one_entry_per_participant: checked(formData, "one_entry_per_participant"),
        employees_eligible: checked(formData, "employees_eligible"),
        weekly_chip_policy: chipPolicy,
        include_transfer_deductions: checked(formData, "include_transfer_deductions"),
        repeat_weekly_winners_allowed: checked(formData, "repeat_weekly_winners_allowed"),
        dispute_window_hours: integer(formData, "dispute_window_hours", "Dispute window", 1),
        tie_breakers: tieBreakers,
        disqualification_rules: disqualificationRules,
        notes: optionalText(formData, "notes"),
        effective_at: optionalIsoDateTime(formData, "effective_at", "Effective date"),
        created_by: admin.id,
      })
      .select("id, version, title, status")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Unable to create the rule version.");
    await writeAuditLog(admin.id, "create_rule_version", "competition_rule", data.id, {
      version: data.version,
      title: data.title,
      status: data.status,
    });
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to create the rule version.",
      competitionSeasonId,
    );
  }

  refreshOperations();
  redirectWithMessage("success", "Draft rule version created successfully.", competitionSeasonId);
}

export async function publishRuleVersionAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);
  const competitionSeasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const ruleId = requiredText(formData, "rule_id", "Rule version");
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const { data: rule, error: ruleError } = await db
      .from("competition_rules")
      .select("id, version, title, status")
      .eq("id", ruleId)
      .eq("competition_season_id", competitionSeasonId)
      .single();
    if (ruleError || !rule) throw new Error(ruleError?.message ?? "Rule version not found.");

    const { error: supersedeError } = await db
      .from("competition_rules")
      .update({ status: "superseded" })
      .eq("competition_season_id", competitionSeasonId)
      .eq("status", "published")
      .neq("id", ruleId);
    if (supersedeError) throw new Error(supersedeError.message);

    const publishedAt = new Date().toISOString();
    const { error: publishError } = await db
      .from("competition_rules")
      .update({ status: "published", published_at: publishedAt })
      .eq("id", ruleId);
    if (publishError) throw new Error(publishError.message);

    const { error: seasonError } = await db
      .from("competition_seasons")
      .update({ rules_version: rule.version })
      .eq("id", competitionSeasonId);
    if (seasonError) throw new Error(seasonError.message);

    await writeAuditLog(admin.id, "publish_rule_version", "competition_rule", rule.id, {
      version: rule.version,
      title: rule.title,
      published_at: publishedAt,
    });
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to publish the rule version.",
      competitionSeasonId,
    );
  }

  refreshOperations();
  revalidatePath("/admin/competitions");
  redirectWithMessage("success", "Rule version published successfully.", competitionSeasonId);
}

export async function createPrizeAction(formData: FormData) {
  const admin = await requireAdminRole(PRIZE_ROLES);
  const competitionSeasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const code = prizeCode(requiredText(formData, "code", "Prize code"));
    if (!code) throw new Error("Prize code is invalid.");
    const frequency = assertAllowed(requiredText(formData, "frequency", "Frequency"), PRIZE_FREQUENCIES, "Frequency");
    const prizeType = assertAllowed(requiredText(formData, "prize_type", "Prize type"), PRIZE_TYPES, "Prize type");
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const { data, error } = await db
      .from("prizes")
      .insert({
        competition_season_id: competitionSeasonId,
        code,
        name: requiredText(formData, "name", "Prize name"),
        description: optionalText(formData, "description"),
        frequency,
        position: integer(formData, "position", "Position", 1),
        amount: decimal(formData, "amount", "Amount", 0),
        currency: requiredText(formData, "currency", "Currency").toUpperCase(),
        prize_type: prizeType,
        non_cash_description: optionalText(formData, "non_cash_description"),
        payment_method: requiredText(formData, "payment_method", "Payment method"),
        payment_deadline_days: integer(formData, "payment_deadline_days", "Payment deadline", 1),
        is_active: true,
      })
      .select("id, code, name, frequency, position, amount, currency")
      .single();

    if (error || !data) throw new Error(error?.message ?? "Unable to create the prize.");
    await writeAuditLog(admin.id, "create_prize", "prize", data.id, {
      code: data.code,
      name: data.name,
      frequency: data.frequency,
      position: data.position,
      amount: data.amount,
      currency: data.currency,
    });
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to create the prize.",
      competitionSeasonId,
    );
  }

  refreshOperations();
  redirectWithMessage("success", "Prize created successfully.", competitionSeasonId);
}

export async function togglePrizeAction(formData: FormData) {
  const admin = await requireAdminRole(PRIZE_ROLES);
  const competitionSeasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const id = requiredText(formData, "id", "Prize");
    const isActive = text(formData, "is_active") === "true";
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const { data, error } = await db
      .from("prizes")
      .update({ is_active: isActive })
      .eq("id", id)
      .eq("competition_season_id", competitionSeasonId)
      .select("id, code, name, is_active")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Unable to update the prize.");

    await writeAuditLog(admin.id, "toggle_prize", "prize", data.id, {
      code: data.code,
      name: data.name,
      is_active: data.is_active,
    });
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to update the prize.",
      competitionSeasonId,
    );
  }

  refreshOperations();
  redirectWithMessage("success", "Prize status updated successfully.", competitionSeasonId);
}
