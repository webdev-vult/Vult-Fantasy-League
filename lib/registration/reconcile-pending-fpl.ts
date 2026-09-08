import "server-only";

import { resolveOfficialFplLeagueIdentity } from "@/lib/fantasy-providers/fpl-league-identity";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const FETCH_PAGE_SIZE = 200;

type ReconciliationOptions = {
  registrationId?: string;
  actorUserId?: string;
  source?: "cron" | "admin_bulk" | "admin_single";
  maxDurationMs?: number;
};

type ReconciliationResult = {
  totalPending: number;
  checked: number;
  resolved: number;
  waiting: number;
  reviewRequired: number;
  failed: number;
  remaining: number;
  stoppedEarly: boolean;
  durationMs: number;
};

type PendingRegistration = {
  id: string;
  registered_at: string;
  metadata: unknown;
  verification:
    | {
        fpl_status?: string | null;
        fpl_team_name?: string | null;
        fpl_manager_name?: string | null;
        fpl_checked_at?: string | null;
      }
    | Array<{
        fpl_status?: string | null;
        fpl_team_name?: string | null;
        fpl_manager_name?: string | null;
        fpl_checked_at?: string | null;
      }>
    | null;
  competition_season:
    | { external_league_id?: string | null }
    | Array<{ external_league_id?: string | null }>
    | null;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "FPL league lookup failed.";
}

function checkedAt(registration: PendingRegistration) {
  const verification = Array.isArray(registration.verification)
    ? registration.verification[0]
    : registration.verification;
  const value = verification?.fpl_checked_at;
  return value ? new Date(value).getTime() : 0;
}

// The migration-backed relations are not present in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadAllPendingRegistrations(db: any, registrationId?: string) {
  if (registrationId) {
    const { data, error } = await db
      .from("registrations")
      .select(`
        id, competition_season_id, registered_at, metadata,
        competition_season:competition_seasons!registrations_competition_season_id_fkey(external_league_id),
        verification:registration_verifications(fpl_status, fpl_team_name, fpl_manager_name, fpl_checked_at)
      `)
      .eq("metadata->>fpl_resolution_state", "awaiting_fpl_sync")
      .eq("id", registrationId);
    if (error) throw new Error(error.message);
    return (data ?? []) as PendingRegistration[];
  }

  const registrations: PendingRegistration[] = [];
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await db
      .from("registrations")
      .select(`
        id, competition_season_id, registered_at, metadata,
        competition_season:competition_seasons!registrations_competition_season_id_fkey(external_league_id),
        verification:registration_verifications(fpl_status, fpl_team_name, fpl_manager_name, fpl_checked_at)
      `)
      .eq("metadata->>fpl_resolution_state", "awaiting_fpl_sync")
      .order("registered_at", { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    registrations.push(...(data ?? []));
    if (!data || data.length < FETCH_PAGE_SIZE) break;
  }

  return registrations.sort((left, right) => {
    const checkedDifference = checkedAt(left) - checkedAt(right);
    if (checkedDifference !== 0) return checkedDifference;
    return new Date(left.registered_at).getTime() - new Date(right.registered_at).getTime();
  });
}

export async function reconcilePendingFplRegistrations(
  input?: string | ReconciliationOptions,
): Promise<ReconciliationResult> {
  const options = typeof input === "string" ? { registrationId: input } : (input ?? {});
  const source = options.source ?? (options.registrationId ? "admin_single" : "cron");
  const startedAt = Date.now();
  const maxDurationMs = options.maxDurationMs ?? 240_000;
  // The generated database types are updated after the accompanying migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminSupabaseClient() as any;
  const registrations = await loadAllPendingRegistrations(db, options.registrationId);
  const result: ReconciliationResult = {
    totalPending: registrations.length,
    checked: 0,
    resolved: 0,
    waiting: 0,
    reviewRequired: 0,
    failed: 0,
    remaining: registrations.length,
    stoppedEarly: false,
    durationMs: 0,
  };

  for (const registration of registrations) {
    if (Date.now() - startedAt >= maxDurationMs) {
      result.stoppedEarly = true;
      break;
    }

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
      const resolved = await resolveOfficialFplLeagueIdentity({ leagueId, teamName, managerName });
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
      const { error: updateError } = await db
        .from("registration_verifications")
        .update({
          fpl_status: ambiguous ? "review_required" : "pending",
          fpl_notes: ambiguous
            ? `${reason} An administrator must review this entry.`
            : `Not yet found in the official Vult FPL league feed. Last lookup result: ${reason}`,
          fpl_checked_at: new Date().toISOString(),
        })
        .eq("registration_id", registration.id);

      if (updateError) {
        result.failed += 1;
        console.error("Unable to record pending FPL lookup result", {
          registrationId: registration.id,
          error: updateError.message,
        });
      } else if (ambiguous) {
        result.reviewRequired += 1;
      } else {
        result.waiting += 1;
      }
    }
  }

  const { count, error: countError } = await db
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("metadata->>fpl_resolution_state", "awaiting_fpl_sync");
  if (countError) console.error("Unable to count remaining FPL registrations", countError.message);
  result.remaining = count ?? Math.max(0, result.totalPending - result.resolved);
  result.durationMs = Date.now() - startedAt;

  const { error: auditError } = await db.from("audit_logs").insert({
    actor_user_id: options.actorUserId ?? null,
    action: "pending_fpl_reconciliation_run",
    entity_type: "fpl_reconciliation",
    entity_id: options.registrationId ?? null,
    metadata: { source, ...result },
  });
  if (auditError) console.error("Unable to audit FPL reconciliation run", auditError.message);

  console.info("Pending FPL reconciliation completed", { source, ...result });
  return result;
}
