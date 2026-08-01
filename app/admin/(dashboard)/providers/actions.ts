"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  CsvFantasyProvider,
  MockFantasyProvider,
  PROVIDER_KINDS,
  validateProviderRecords,
  type PreparedProviderBatch,
  type ProviderEntryContext,
  type ProviderKind,
  type ProviderRecordInput,
  type ProviderRoundContext,
} from "@/lib/fantasy-providers";

const MANAGEMENT_ROLES = ["super_admin", "competition_manager"] as const;
const SYNC_MODES = ["manual", "scheduled"] as const;
const MOCK_ALLOWED_SEASON_STATUSES = ["draft", "registration_open", "registration_closed"];

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function boundedInteger(formData: FormData, key: string, label: string, minimum: number, maximum: number) {
  const value = Number.parseInt(text(formData, key), 10);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

function assertAllowed<T extends readonly string[]>(value: string, allowed: T, label: string): T[number] {
  if (!allowed.includes(value)) throw new Error(`${label} is invalid.`);
  return value as T[number];
}

function redirectWithMessage(type: "success" | "error", message: string, seasonId?: string, runId?: string): never {
  const params = new URLSearchParams({ [type]: message });
  if (seasonId) params.set("season", seasonId);
  if (runId) params.set("run", runId);
  redirect(`/admin/providers?${params.toString()}`);
}

function hashPayload(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function refreshProviders() {
  revalidatePath("/admin");
  revalidatePath("/admin/providers");
}

type ProviderContext = {
  season: { id: string; name: string; status: string; data_provider: ProviderKind };
  settings: {
    provider: ProviderKind;
    is_enabled: boolean;
    max_attempts: number;
    sync_mode: string;
  };
  entries: ProviderEntryContext[];
  rounds: ProviderRoundContext[];
};

async function loadProviderContext(db: any, competitionSeasonId: string): Promise<ProviderContext> {
  const [seasonResult, settingsResult, entriesResult, roundsResult] = await Promise.all([
    db
      .from("competition_seasons")
      .select("id, name, status, data_provider")
      .eq("id", competitionSeasonId)
      .single(),
    db
      .from("fantasy_provider_settings")
      .select("provider, is_enabled, max_attempts, sync_mode")
      .eq("competition_season_id", competitionSeasonId)
      .single(),
    db
      .from("fantasy_entries")
      .select(
        "id, registration_id, provider_entry_id, manager_name, team_name, registration:registrations!fantasy_entries_registration_id_fkey(status, eligibility_status)",
      )
      .eq("competition_season_id", competitionSeasonId),
    db
      .from("rounds")
      .select("id, external_round_id, name, status")
      .eq("competition_season_id", competitionSeasonId)
      .order("external_round_id"),
  ]);

  if (seasonResult.error || !seasonResult.data) {
    throw new Error(seasonResult.error?.message ?? "Competition season not found.");
  }
  if (settingsResult.error || !settingsResult.data) {
    throw new Error(settingsResult.error?.message ?? "Provider settings not found.");
  }
  if (entriesResult.error) throw new Error(entriesResult.error.message);
  if (roundsResult.error) throw new Error(roundsResult.error.message);

  const entries = (entriesResult.data ?? []).map((row: any) => ({
    id: row.id,
    registration_id: row.registration_id,
    provider_entry_id: row.provider_entry_id,
    manager_name: row.manager_name,
    team_name: row.team_name,
    registration_status: row.registration?.status ?? "unknown",
    eligibility_status: row.registration?.eligibility_status ?? "unknown",
  }));

  return {
    season: seasonResult.data,
    settings: settingsResult.data,
    entries,
    rounds: roundsResult.data ?? [],
  };
}

async function persistPreparedBatch(
  db: any,
  context: ProviderContext,
  provider: ProviderKind,
  triggerSource: "manual" | "csv_upload" | "retry",
  batch: PreparedProviderBatch,
  idempotencyKey: string,
  responseHash: string,
  parentRunId: string | null = null,
) {
  if (!context.settings.is_enabled) throw new Error("Provider ingestion is disabled for this season.");
  if (context.season.data_provider !== provider || context.settings.provider !== provider) {
    throw new Error("The selected provider does not match the competition-season configuration.");
  }
  if (!context.rounds.length) throw new Error("Create the competition rounds before importing provider data.");
  if (!context.entries.length) throw new Error("No fantasy entries exist for this competition season.");

  const validation = validateProviderRecords(batch.records, context.entries, context.rounds);
  const { data, error } = await db.rpc("persist_provider_batch", {
    p_competition_season_id: context.season.id,
    p_provider: provider,
    p_trigger_source: triggerSource,
    p_source_label: batch.sourceLabel,
    p_source_endpoint: batch.sourceEndpoint,
    p_idempotency_key: idempotencyKey,
    p_response_hash: responseHash,
    p_response_data: batch.responseData,
    p_records: validation.records,
    p_errors: validation.issues,
    p_parent_run_id: parentRunId,
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("The provider sync completed without a run reference.");
  return String(data);
}

export async function updateProviderSettingsAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);
  const competitionSeasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const provider = assertAllowed(requiredText(formData, "provider", "Provider"), PROVIDER_KINDS, "Provider");
    const syncMode = assertAllowed(requiredText(formData, "sync_mode", "Sync mode"), SYNC_MODES, "Sync mode");
    const scheduleCron = text(formData, "schedule_cron") || null;
    const maxAttempts = boundedInteger(formData, "max_attempts", "Maximum attempts", 1, 10);
    const timeoutSeconds = boundedInteger(formData, "request_timeout_seconds", "Request timeout", 5, 120);
    const isEnabled = formData.get("is_enabled") === "on";

    if (provider === "csv" && syncMode !== "manual") {
      throw new Error("CSV providers support manual uploads only.");
    }
    if (syncMode === "scheduled") {
      if (!scheduleCron || scheduleCron.split(/\s+/).length !== 5) {
        throw new Error("Scheduled mode requires a standard five-part cron expression.");
      }
      if (!["mock", "approved_fpl", "licensed"].includes(provider)) {
        throw new Error("This provider cannot run on a schedule.");
      }
    }

    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const { error: seasonError } = await db
      .from("competition_seasons")
      .update({ data_provider: provider })
      .eq("id", competitionSeasonId);
    if (seasonError) throw new Error(seasonError.message);

    const { error: settingsError } = await db.from("fantasy_provider_settings").upsert(
      {
        competition_season_id: competitionSeasonId,
        provider,
        is_enabled: isEnabled,
        sync_mode: provider === "csv" ? "manual" : syncMode,
        schedule_cron: provider === "csv" || syncMode === "manual" ? null : scheduleCron,
        max_attempts: maxAttempts,
        request_timeout_seconds: timeoutSeconds,
        updated_by: admin.id,
        created_by: admin.id,
        config: {
          scheduler_activation: "pending_cron_secret",
          credentials_location: "server_environment_or_supabase_vault",
        },
      },
      { onConflict: "competition_season_id" },
    );
    if (settingsError) throw new Error(settingsError.message);

    const { error: auditError } = await db.from("audit_logs").insert({
      actor_user_id: admin.id,
      action: "update_provider_settings",
      entity_type: "competition_season",
      entity_id: competitionSeasonId,
      metadata: {
        provider,
        is_enabled: isEnabled,
        sync_mode: provider === "csv" ? "manual" : syncMode,
        schedule_cron: provider === "csv" || syncMode === "manual" ? null : scheduleCron,
        max_attempts: maxAttempts,
        request_timeout_seconds: timeoutSeconds,
      },
    });
    if (auditError) console.error("Unable to write provider settings audit log", auditError.message);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to update provider settings.",
      competitionSeasonId,
    );
  }

  refreshProviders();
  redirectWithMessage("success", "Provider settings updated.", competitionSeasonId);
}

export async function uploadCsvProviderAction(formData: FormData) {
  await requireAdminRole(MANAGEMENT_ROLES);
  const competitionSeasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const file = formData.get("csv_file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Select a CSV file to upload.");
    if (file.size > 2 * 1024 * 1024) throw new Error("The CSV file cannot exceed 2 MB.");
    if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Only CSV files are accepted.");

    const contents = await file.text();
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const context = await loadProviderContext(db, competitionSeasonId);
    if (context.season.data_provider !== "csv") {
      throw new Error("Change this competition season to the CSV provider before uploading a file.");
    }

    const batch = new CsvFantasyProvider().prepare({ text: contents, fileName: file.name });
    const responseHash = hashPayload(contents);
    const runId = await persistPreparedBatch(
      db,
      context,
      "csv",
      "csv_upload",
      batch,
      `csv:${competitionSeasonId}:${responseHash}`,
      responseHash,
    );

    refreshProviders();
    redirectWithMessage("success", "CSV provider batch imported and validated.", competitionSeasonId, runId);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to import the CSV provider batch.",
      competitionSeasonId,
    );
  }
}

export async function runMockProviderAction(formData: FormData) {
  await requireAdminRole(MANAGEMENT_ROLES);
  const competitionSeasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const roundId = requiredText(formData, "round_id", "Round");
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const context = await loadProviderContext(db, competitionSeasonId);
    if (context.season.data_provider !== "mock") {
      throw new Error("Change this competition season to the mock provider before running a mock sync.");
    }
    if (!MOCK_ALLOWED_SEASON_STATUSES.includes(context.season.status)) {
      throw new Error("Mock score generation is blocked after the competition becomes active.");
    }

    const round = context.rounds.find((item) => item.id === roundId);
    if (!round) throw new Error("The selected round was not found.");
    const approvedEntries = context.entries.filter(
      (entry) => entry.registration_status === "approved" && entry.eligibility_status === "eligible",
    );
    const batch = new MockFantasyProvider().prepare({ entries: approvedEntries, round });
    const serialized = JSON.stringify(batch.responseData);
    const responseHash = hashPayload(serialized);
    const runId = await persistPreparedBatch(
      db,
      context,
      "mock",
      "manual",
      batch,
      `mock:${competitionSeasonId}:${round.external_round_id}:${randomUUID()}`,
      responseHash,
    );

    refreshProviders();
    redirectWithMessage("success", "Mock provider batch generated and staged.", competitionSeasonId, runId);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to run the mock provider.",
      competitionSeasonId,
    );
  }
}

export async function retryProviderRunAction(formData: FormData) {
  await requireAdminRole(MANAGEMENT_ROLES);
  const competitionSeasonId = requiredText(formData, "competition_season_id", "Competition season");

  try {
    const runId = requiredText(formData, "run_id", "Sync run");
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const context = await loadProviderContext(db, competitionSeasonId);
    const [runResult, recordsResult] = await Promise.all([
      db
        .from("provider_sync_runs")
        .select("id, provider, status, attempt_number, source_label")
        .eq("id", runId)
        .eq("competition_season_id", competitionSeasonId)
        .single(),
      db
        .from("provider_score_records")
        .select(
          "provider_entry_id, external_round_id, manager_name, team_name, reported_points, total_points, transfer_cost, chip_used, round_rank, overall_rank, is_provisional, raw_record",
        )
        .eq("sync_run_id", runId)
        .order("imported_at"),
    ]);

    if (runResult.error || !runResult.data) throw new Error(runResult.error?.message ?? "Sync run not found.");
    if (recordsResult.error) throw new Error(recordsResult.error.message);
    if (!["failed", "partial"].includes(runResult.data.status)) {
      throw new Error("Only failed or partial sync runs can be retried.");
    }
    if (runResult.data.attempt_number >= context.settings.max_attempts) {
      throw new Error("The maximum retry attempts have been reached.");
    }

    const records: ProviderRecordInput[] = (recordsResult.data ?? []).map((row: any) => ({
      provider_entry_id: row.provider_entry_id,
      external_round_id: row.external_round_id,
      manager_name: row.manager_name,
      team_name: row.team_name,
      reported_points: row.reported_points,
      total_points: row.total_points,
      transfer_cost: row.transfer_cost,
      chip_used: row.chip_used,
      round_rank: row.round_rank,
      overall_rank: row.overall_rank,
      is_provisional: row.is_provisional,
      raw_record: row.raw_record ?? {},
    }));
    if (!records.length) throw new Error("This sync run has no staged records to retry.");

    const responseData = { parent_run_id: runId, records: records.map((record) => record.raw_record) };
    const serialized = JSON.stringify(responseData);
    const responseHash = hashPayload(serialized);
    const batch: PreparedProviderBatch = {
      records,
      sourceLabel: `Retry of ${runResult.data.source_label ?? runId}`,
      sourceEndpoint: `retry://${runId}`,
      responseData,
    };
    const newRunId = await persistPreparedBatch(
      db,
      context,
      runResult.data.provider,
      "retry",
      batch,
      `retry:${runId}:${runResult.data.attempt_number + 1}:${responseHash}`,
      responseHash,
      runId,
    );

    refreshProviders();
    redirectWithMessage("success", "Provider sync retry completed.", competitionSeasonId, newRunId);
  } catch (error) {
    redirectWithMessage(
      "error",
      error instanceof Error ? error.message : "Unable to retry the provider sync.",
      competitionSeasonId,
    );
  }
}
