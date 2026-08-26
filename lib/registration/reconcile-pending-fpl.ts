import "server-only";

import { resolveOfficialFplLeagueIdentity } from "@/lib/fantasy-providers/fpl-league-identity";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type ReconciliationResult = {
  checked: number;
  resolved: number;
  waiting: number;
  reviewRequired: number;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "FPL league lookup failed.";
}

export async function reconcilePendingFplRegistrations(registrationId?: string) {
  // The generated database types are updated after the accompanying migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminSupabaseClient() as any;
  let query = db
    .from("registrations")
    .select(`
      id, competition_season_id, metadata,
      competition_season:competition_seasons!registrations_competition_season_id_fkey(external_league_id),
      verification:registration_verifications(fpl_status, fpl_team_name, fpl_manager_name)
    `)
    .eq("metadata->>fpl_resolution_state", "awaiting_fpl_sync")
    .limit(100);

  if (registrationId) query = query.eq("id", registrationId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const result: ReconciliationResult = {
    checked: 0,
    resolved: 0,
    waiting: 0,
    reviewRequired: 0,
  };

  for (const registration of data ?? []) {
    result.checked += 1;
    const metadata = object(registration.metadata);
    const verification = Array.isArray(registration.verification)
      ? registration.verification[0]
      : registration.verification;
    const season = Array.isArray(registration.competition_season)
      ? registration.competition_season[0]
      : registration.competition_season;
    const teamName = String(
      verification?.fpl_team_name ?? metadata.submitted_team_name ?? "",
    ).trim();
    const managerName = String(
      verification?.fpl_manager_name ?? metadata.submitted_manager_name ?? "",
    ).trim();
    const leagueId = String(season?.external_league_id ?? "").trim();

    try {
      const resolved = await resolveOfficialFplLeagueIdentity({
        leagueId,
        teamName,
        managerName,
      });

      const { error: resolutionError } = await db.rpc("resolve_pending_fpl_registration", {
        p_registration_id: registration.id,
        p_fpl_entry_id: resolved.entryId,
        p_fpl_team_name: resolved.teamName,
        p_fpl_manager_name: resolved.managerName,
      });
      if (resolutionError) throw new Error(resolutionError.message);
      result.resolved += 1;
    } catch (lookupError) {
      const reason = message(lookupError);
      const ambiguous =
        reason.includes("More than one matching team") ||
        reason.includes("already linked to another registration");
      if (ambiguous) {
        await db
          .from("registration_verifications")
          .update({
            fpl_status: "review_required",
            fpl_notes: `${reason} An administrator must review this entry.`,
            fpl_checked_at: new Date().toISOString(),
          })
          .eq("registration_id", registration.id);
        result.reviewRequired += 1;
      } else {
        await db
          .from("registration_verifications")
          .update({
            fpl_status: "pending",
            fpl_notes: `Awaiting publication by the official FPL league API. Last check: ${reason}`,
            fpl_checked_at: new Date().toISOString(),
          })
          .eq("registration_id", registration.id);
        result.waiting += 1;
      }
    }
  }

  return result;
}
