"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/admin";
import {
  ApprovedFplProvider,
  testApprovedFplConnection,
  validateProviderRecords,
  type ProviderEntryContext,
  type ProviderRecordInput,
  type ProviderRoundContext,
} from "@/lib/fantasy-providers";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/lib/supabase/server";

const MANAGEMENT_ROLES = ["super_admin", "competition_manager"] as const;
const FPL_BASE_URL = "https://fantasy.premierleague.com/api";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function required(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function redirectToFpl(type: "success" | "error", message: string, seasonId?: string, runId?: string): never {
  const params = new URLSearchParams({ [type]: message });
  if (seasonId) params.set("season", seasonId);
  if (runId) params.set("run", runId);
  redirect(`/admin/providers/fpl?${params.toString()}`);
}

function isRedirectSignal(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: unknown }).digest ?? "").startsWith("NEXT_REDIRECT")
  );
}

function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function refresh() {
  revalidatePath("/admin");
  revalidatePath("/admin/providers");
  revalidatePath("/admin/providers/fpl");
}

type FplContext = {
  season: {
    id: string;
    name: string;
    status: string;
    data_provider: string;
    external_league_id: string | null;
  };
  settings: {
    provider: string;
    is_enabled: boolean;
    request_timeout_seconds: number;
    config: Record<string, unknown> | null;
  };
  entries: ProviderEntryContext[];
  rounds: ProviderRoundContext[];
};

function configuredLeagueId(context: FplContext) {
  const configured = context.season.external_league_id ?? context.settings.config?.league_numeric_id;
  if (configured === null || configured === undefined || String(configured).trim() === "") return null;
  const value = String(configured).trim();
  if (!/^\d+$/.test(value) || Number.parseInt(value, 10) < 1) {
    throw new Error("The configured FPL classic league ID must be a positive integer.");
  }
  return value;
}

async function loadContext(db: any, seasonId: string): Promise<FplContext> {
  const [seasonResult, settingsResult, entriesResult, roundsResult] = await Promise.all([
    db
      .from("competition_seasons")
      .select("id, name, status, data_provider, external_league_id")
      .eq("id", seasonId)
      .single(),
    db
      .from("fantasy_provider_settings")
      .select("provider, is_enabled, request_timeout_seconds, config")
      .eq("competition_season_id", seasonId)
      .maybeSingle(),
    db
      .from("fantasy_entries")
      .select(
        "id, registration_id, provider_entry_id, manager_name, team_name, registration:registrations!fantasy_entries_registration_id_fkey(status, eligibility_status)",
      )
      .eq("competition_season_id", seasonId),
    db
      .from("rounds")
      .select("id, external_round_id, name, status")
      .eq("competition_season_id", seasonId)
      .order("external_round_id"),
  ]);

  if (seasonResult.error || !seasonResult.data) {
    throw new Error(seasonResult.error?.message ?? "Competition season not found.");
  }
  if (settingsResult.error) throw new Error(settingsResult.error.message);
  if (entriesResult.error) throw new Error(entriesResult.error.message);
  if (roundsResult.error) throw new Error(roundsResult.error.message);

  const entries = (entriesResult.data ?? []).map((row: any) => ({
    id: row.id,
    registration_id: row.registration_id,
    provider_entry_id: String(row.provider_entry_id ?? ""),
    manager_name: row.manager_name,
    team_name: row.team_name,
    registration_status: row.registration?.status ?? "unknown",
    eligibility_status: row.registration?.eligibility_status ?? "unknown",
  }));

  return {
    season: seasonResult.data,
    settings: settingsResult.data ?? {
      provider: seasonResult.data.data_provider,
      is_enabled: false,
      request_timeout_seconds: 30,
      config: null,
    },
    entries,
    rounds: roundsResult.data ?? [],
  };
}

export async function enableReadOnlyFplAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);
  const seasonId = required(formData, "competition_season_id", "Competition season");

  try {
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const [{ data: existing }, { data: season, error: seasonLookupError }] = await Promise.all([
      db
        .from("fantasy_provider_settings")
        .select("config")
        .eq("competition_season_id", seasonId)
        .maybeSingle(),
      db
        .from("competition_seasons")
        .select("external_league_id")
        .eq("id", seasonId)
        .single(),
    ]);
    if (seasonLookupError || !season) {
      throw new Error(seasonLookupError?.message ?? "Competition season not found.");
    }

    const leagueId = season.external_league_id
      ? String(season.external_league_id)
      : existing?.config?.league_numeric_id
        ? String(existing.config.league_numeric_id)
        : null;

    const { error: seasonError } = await db
      .from("competition_seasons")
      .update({ data_provider: "approved_fpl" })
      .eq("id", seasonId);
    if (seasonError) throw new Error(seasonError.message);

    const { error: settingsError } = await db.from("fantasy_provider_settings").upsert(
      {
        competition_season_id: seasonId,
        provider: "approved_fpl",
        is_enabled: true,
        sync_mode: "manual",
        schedule_cron: null,
        max_attempts: 3,
        request_timeout_seconds: 30,
        created_by: admin.id,
        updated_by: admin.id,
        config: {
          ...(existing?.config ?? {}),
          base_url: FPL_BASE_URL,
          connector_mode: "read_only_public",
          contract_version: "2026.27.1",
          max_concurrency: 3,
          authenticated_endpoints_enabled: false,
          league_numeric_id: leagueId,
          league_standings_enabled: Boolean(leagueId),
          require_official_league_membership: Boolean(leagueId),
          allowed_endpoints: [
            "/bootstrap-static/",
            "/event-status/",
            "/entry/{entryId}/",
            "/entry/{entryId}/history/",
            "/entry/{entryId}/event/{eventId}/picks/",
            "/leagues-classic/{leagueId}/standings/",
          ],
        },
      },
      { onConflict: "competition_season_id" },
    );
    if (settingsError) throw new Error(settingsError.message);

    await db.from("audit_logs").insert({
      actor_user_id: admin.id,
      action: "enable_read_only_fpl_provider",
      entity_type: "competition_season",
      entity_id: seasonId,
      metadata: {
        provider: "approved_fpl",
        base_url: FPL_BASE_URL,
        read_only: true,
        contract_version: "2026.27.1",
        authenticated_endpoints_enabled: false,
        league_numeric_id: leagueId,
        require_official_league_membership: Boolean(leagueId),
      },
    });
  } catch (error) {
    redirectToFpl("error", error instanceof Error ? error.message : "Unable to enable the FPL connector.", seasonId);
  }

  refresh();
  redirectToFpl("success", "Read-only FPL connector enabled for this season.", seasonId);
}

export async function testReadOnlyFplAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);
  const seasonId = required(formData, "competition_season_id", "Competition season");

  try {
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const context = await loadContext(db, seasonId);
    const leagueId = configuredLeagueId(context);
    const health = await testApprovedFplConnection({
      timeoutSeconds: context.settings.request_timeout_seconds,
      baseUrl: FPL_BASE_URL,
      leagueId,
    });

    await db.from("audit_logs").insert({
      actor_user_id: admin.id,
      action: "test_read_only_fpl_connection",
      entity_type: "competition_season",
      entity_id: seasonId,
      metadata: health,
    });

    const current = health.currentEvent ? ` Current Gameweek: ${health.currentEvent}.` : "";
    const league = health.league
      ? ` Official league: ${health.league.name ?? health.league.id} (${health.league.id}).`
      : " No numeric league ID is configured.";
    redirectToFpl(
      "success",
      `FPL connection succeeded with ${health.eventCount} Gameweeks.${current}${league}`,
      seasonId,
    );
  } catch (error) {
    if (isRedirectSignal(error)) throw error;
    redirectToFpl("error", error instanceof Error ? error.message : "FPL connection test failed.", seasonId);
  }
}

export async function runReadOnlyFplSyncAction(formData: FormData) {
  const admin = await requireAdminRole(MANAGEMENT_ROLES);
  const seasonId = required(formData, "competition_season_id", "Competition season");

  try {
    const roundId = required(formData, "round_id", "Gameweek");
    const supabase = await createServerSupabaseClient();
    const db = supabase as any;
    const context = await loadContext(db, seasonId);

    if (context.season.data_provider !== "approved_fpl" || context.settings.provider !== "approved_fpl") {
      throw new Error("Enable the read-only FPL connector before running a sync.");
    }
    if (!context.settings.is_enabled) throw new Error("FPL provider ingestion is disabled for this season.");

    const leagueId = configuredLeagueId(context);
    if (!leagueId) {
      throw new Error("Configure the numeric official FPL league ID before retrieving scores.");
    }

    const round = context.rounds.find((item) => item.id === roundId);
    if (!round) throw new Error("The selected Gameweek was not found.");

    const entries = context.entries.filter(
      (entry) => entry.registration_status === "approved" && entry.eligibility_status === "eligible",
    );
    if (!entries.length) throw new Error("No approved and eligible fantasy entries are available for FPL sync.");

    const provider = new ApprovedFplProvider();
    const batch = await provider.prepare({
      entries,
      round,
      timeoutSeconds: context.settings.request_timeout_seconds,
      concurrency: 3,
      baseUrl: FPL_BASE_URL,
      leagueId,
      requireLeagueMembership: true,
    });

    const failedRecords: ProviderRecordInput[] = (batch.issues ?? []).map((issue) => {
      const entry = entries.find((item) => item.provider_entry_id === issue.provider_entry_id);
      return {
        provider_entry_id: issue.provider_entry_id,
        external_round_id: issue.external_round_id,
        manager_name: entry?.manager_name ?? null,
        team_name: entry?.team_name ?? null,
        reported_points: null,
        total_points: null,
        transfer_cost: 0,
        chip_used: null,
        round_rank: null,
        overall_rank: null,
        is_provisional: true,
        raw_record: {
          provider: "approved_fpl",
          read_only: true,
          official_league_id: leagueId,
          fetch_error: issue.message,
          error_code: issue.error_code,
          details: issue.details,
        },
      };
    });

    const validation = validateProviderRecords([...batch.records, ...failedRecords], entries, context.rounds);
    const responseHash = hashPayload(batch.responseData);
    const serverDb = createAdminSupabaseClient() as any;
    const { data: runId, error } = await serverDb.rpc("persist_provider_batch", {
      p_competition_season_id: seasonId,
      p_provider: "approved_fpl",
      p_trigger_source: "manual",
      p_source_label: batch.sourceLabel,
      p_source_endpoint: batch.sourceEndpoint,
      p_idempotency_key: `approved_fpl:${seasonId}:${round.external_round_id}:${responseHash}`,
      p_response_hash: responseHash,
      p_response_data: batch.responseData,
      p_records: validation.records,
      p_errors: [...(batch.issues ?? []), ...validation.issues],
      p_parent_run_id: null,
      p_requested_by: admin.id,
    });
    if (error) throw new Error(error.message);
    if (!runId) throw new Error("The FPL sync completed without a run reference.");

    refresh();
    redirectToFpl(
      "success",
      `FPL Gameweek ${round.external_round_id} data was reconciled with official league ${leagueId}, validated and staged.`,
      seasonId,
      String(runId),
    );
  } catch (error) {
    if (isRedirectSignal(error)) throw error;
    redirectToFpl("error", error instanceof Error ? error.message : "Unable to run the FPL sync.", seasonId);
  }
}
