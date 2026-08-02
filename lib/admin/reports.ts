import "server-only";

import type { AdminProfile } from "@/lib/auth/admin";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export type CountBreakdown = {
  status?: string;
  category?: string;
  channel?: string;
  currency?: string;
  count: number;
  amount?: number | string;
  rows?: number;
  accepted?: number;
  rejected?: number;
  warnings?: number;
};

export type SeasonSummary = {
  id: string;
  name: string;
  status: string;
  provider: string;
  starts_at: string | null;
  ends_at: string | null;
  registrations: number;
  approved_registrations: number;
  unique_participants: number;
  finalised_rounds: number;
  published_leaderboards: number;
  confirmed_winners: number;
  paid_prizes: number;
  open_disputes: number;
};

export type RetentionRow = {
  season_id: string;
  season_name: string;
  registered_participants: number;
  returning_participants: number;
  new_participants: number;
  retention_rate: number | string;
};

export type PrizeSpendingRow = {
  currency: string;
  configured_value: number | string;
  committed: number | string;
  paid: number | string;
  reversed: number | string;
};

export type ReportingDashboard = {
  generated_at: string;
  requested_role: string;
  selected_season_id: string | null;
  seasons: SeasonSummary[];
  selected_season: {
    id: string;
    name: string;
    status: string;
    provider: string;
    registration_opens_at: string | null;
    registration_closes_at: string | null;
    starts_at: string | null;
    ends_at: string | null;
    rules_version: number;
  } | null;
  headline: Record<string, number | string>;
  registration_statuses: CountBreakdown[];
  eligibility_statuses: CountBreakdown[];
  verification_statuses: {
    fpl: CountBreakdown[];
    vult: CountBreakdown[];
    duplicate_risk: CountBreakdown[];
  };
  registration_trend: Array<{ period: string; count: number }>;
  provider_runs: CountBreakdown[];
  latest_provider_run: null | Record<string, unknown>;
  round_statuses: CountBreakdown[];
  leaderboard_statuses: CountBreakdown[];
  winner_statuses: CountBreakdown[];
  payment_statuses: CountBreakdown[];
  prize_spending: PrizeSpendingRow[];
  dispute_statuses: CountBreakdown[];
  dispute_categories: CountBreakdown[];
  notification_statuses: CountBreakdown[];
  retention: RetentionRow[];
  freshness: Record<string, string | null>;
};

export type AuditRow = {
  id: number;
  actor_user_id: string | null;
  actor_name: string;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AuditHistory = {
  requested_role: string;
  total: number;
  limit: number;
  offset: number;
  rows: AuditRow[];
  actions: string[];
  entity_types: string[];
  actors: Array<{ id: string; name: string; role: string }>;
};

export type ExportHistoryRow = {
  id: string;
  report_type: string;
  export_format: string;
  row_count: number;
  filters: Record<string, unknown>;
  created_at: string;
  requested_by: string;
  requested_by_name: string;
  requested_by_role: string;
  competition_season_id: string | null;
  competition_season_name: string | null;
};

export type AuditFilters = {
  search?: string;
  action?: string;
  entityType?: string;
  actorId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export function canViewAudit(admin: Pick<AdminProfile, "role">) {
  return admin.role === "super_admin" || admin.role === "auditor";
}

function clean(value: string | undefined, max = 160) {
  const result = value?.trim().slice(0, max);
  return result || null;
}

function validUuid(value: string | undefined) {
  const candidate = clean(value, 40);
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

function dateBoundary(value: string | undefined, endOfRange = false) {
  const candidate = clean(value, 10);
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfRange) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

async function resolveSeasonId(requestedSeasonId?: string) {
  const requested = validUuid(requestedSeasonId);
  if (requested) return requested;

  const db = createAdminSupabaseClient() as any;
  const { data, error } = await db
    .from("competition_seasons")
    .select("id, status, starts_at, registration_opens_at, created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    status: string;
    starts_at: string | null;
    registration_opens_at: string | null;
    created_at: string;
  }>;

  const statusPriority: Record<string, number> = {
    active: 7,
    registration_open: 6,
    registration_closed: 5,
    draft: 4,
    completed: 3,
    archived: 2,
    cancelled: 1,
  };

  rows.sort((left, right) => {
    const roleDifference = (statusPriority[right.status] ?? 0) - (statusPriority[left.status] ?? 0);
    if (roleDifference) return roleDifference;
    const leftDate = Date.parse(left.starts_at ?? left.registration_opens_at ?? left.created_at);
    const rightDate = Date.parse(right.starts_at ?? right.registration_opens_at ?? right.created_at);
    return rightDate - leftDate;
  });

  return rows[0]?.id ?? null;
}

export async function loadReportingDashboard(admin: AdminProfile, requestedSeasonId?: string) {
  const db = createAdminSupabaseClient() as any;
  const seasonId = await resolveSeasonId(requestedSeasonId);
  const { data, error } = await db.rpc("get_admin_reporting_dashboard", {
    p_competition_season_id: seasonId,
    p_requested_by: admin.id,
  });
  if (error) throw new Error(error.message);
  return data as ReportingDashboard;
}

export async function loadAuditHistory(admin: AdminProfile, filters: AuditFilters) {
  if (!canViewAudit(admin)) return null;
  const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 10), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const db = createAdminSupabaseClient() as any;
  const { data, error } = await db.rpc("search_admin_audit_history", {
    p_requested_by: admin.id,
    p_search: clean(filters.search),
    p_action: clean(filters.action, 120),
    p_entity_type: clean(filters.entityType, 120),
    p_actor_user_id: validUuid(filters.actorId),
    p_from: dateBoundary(filters.from),
    p_to: dateBoundary(filters.to, true),
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw new Error(error.message);
  return data as AuditHistory;
}

export async function loadExportHistory(admin: AdminProfile) {
  const db = createAdminSupabaseClient() as any;
  const { data, error } = await db.rpc("get_report_export_history", {
    p_requested_by: admin.id,
    p_limit: 30,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExportHistoryRow[];
}
