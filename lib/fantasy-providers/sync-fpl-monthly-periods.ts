import "server-only";

import { fetchApprovedFplCalendar } from "./approved-fpl";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type SyncCounts = {
  created: number;
  updated: number;
  unchanged: number;
  blocked: number;
};

type ProviderSettings = {
  request_timeout_seconds: number | null;
  config: Record<string, unknown> | null;
};

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function syncOfficialFplMonthlyPeriods(
  competitionSeasonId: string,
  requestedBy: string | null = null,
): Promise<SyncCounts> {
  // Generated database types are refreshed after the accompanying migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminSupabaseClient() as any;
  const [{ data: season, error: seasonError }, { data: settings, error: settingsError }] =
    await Promise.all([
      db
        .from("competition_seasons")
        .select("id, data_provider")
        .eq("id", competitionSeasonId)
        .single(),
      db
        .from("fantasy_provider_settings")
        .select("request_timeout_seconds, config")
        .eq("competition_season_id", competitionSeasonId)
        .maybeSingle(),
    ]);

  if (seasonError || !season) {
    throw new Error(seasonError?.message ?? "Competition season not found.");
  }
  if (season.data_provider !== "approved_fpl") {
    throw new Error("Automatic monthly periods require the approved FPL provider.");
  }
  if (settingsError) throw new Error(settingsError.message);

  const providerSettings = settings as ProviderSettings | null;
  const config = providerSettings?.config ?? {};
  const events = await fetchApprovedFplCalendar({
    timeoutSeconds: numberValue(providerSettings?.request_timeout_seconds, 30),
    baseUrl: stringValue(config.base_url),
  });

  const { data, error } = await db.rpc("sync_fpl_monthly_periods", {
    p_competition_season_id: competitionSeasonId,
    p_events: events,
    p_requested_by: requestedBy,
  });
  if (error) throw new Error(error.message);

  const result = data && typeof data === "object" ? data as Partial<SyncCounts> : {};
  return {
    created: numberValue(result.created, 0),
    updated: numberValue(result.updated, 0),
    unchanged: numberValue(result.unchanged, 0),
    blocked: numberValue(result.blocked, 0),
  };
}

export async function syncAllOfficialFplMonthlyPeriods() {
  // Generated database types are refreshed after the accompanying migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminSupabaseClient() as any;
  const { data, error } = await db
    .from("competition_seasons")
    .select("id")
    .eq("data_provider", "approved_fpl")
    .in("status", ["registration_open", "registration_closed", "active"]);
  if (error) throw new Error(error.message);

  const results = [];
  for (const season of data ?? []) {
    results.push({
      competitionSeasonId: season.id,
      ...(await syncOfficialFplMonthlyPeriods(season.id)),
    });
  }
  return results;
}