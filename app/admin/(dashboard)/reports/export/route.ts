import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/admin";
import {
  canViewAudit,
  loadAuditHistory,
  loadReportingDashboard,
  type CountBreakdown,
} from "@/lib/admin/reports";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const REPORT_TYPES = new Set([
  "season_summary",
  "operations",
  "participant_retention",
  "prize_spending",
  "audit_history",
]);

function safeCsvCell(value: unknown) {
  let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function makeCsv(headers: string[], rows: unknown[][]) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(safeCsvCell).join(",")).join("\r\n")}`;
}

function clean(value: string | null, max = 160) {
  const result = value?.trim().slice(0, max);
  return result || undefined;
}

function breakdownRows(section: string, rows: CountBreakdown[]) {
  return rows.map((row) => [
    section,
    row.status ?? row.category ?? "",
    row.channel ?? "",
    row.currency ?? "",
    row.count,
    row.amount ?? "",
    row.accepted ?? "",
    row.rejected ?? "",
    row.warnings ?? "",
    row.rows ?? "",
  ]);
}

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const reportType = clean(params.get("type"), 40) ?? "";
  if (!REPORT_TYPES.has(reportType)) {
    return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  }
  if (reportType === "audit_history" && !canViewAudit(admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const season = clean(params.get("season"), 40);
  const dashboard = await loadReportingDashboard(admin, season);
  let headers: string[] = [];
  let rows: unknown[][] = [];
  const filters: Record<string, string> = {};
  let filename = reportType;

  if (reportType === "season_summary") {
    headers = ["Season", "Status", "Provider", "Registrations", "Approved Registrations", "Unique Participants", "Finalised Rounds", "Published Leaderboards", "Confirmed Winners", "Paid Prizes", "Open Disputes"];
    rows = dashboard.seasons.map((row) => [row.name, row.status, row.provider, row.registrations, row.approved_registrations, row.unique_participants, row.finalised_rounds, row.published_leaderboards, row.confirmed_winners, row.paid_prizes, row.open_disputes]);
    filename = "season-comparison";
  }

  if (reportType === "participant_retention") {
    headers = ["Season", "Registered Participants", "Returning Participants", "New Participants", "Retention Rate Percent"];
    rows = dashboard.retention.map((row) => [row.season_name, row.registered_participants, row.returning_participants, row.new_participants, row.retention_rate]);
    filename = "participant-retention";
  }

  if (reportType === "prize_spending") {
    headers = ["Season", "Currency", "Configured Value", "Committed", "Paid", "Reversed"];
    rows = dashboard.prize_spending.map((row) => [dashboard.selected_season?.name ?? "", row.currency, row.configured_value, row.committed, row.paid, row.reversed]);
    filename = "prize-spending";
  }

  if (reportType === "operations") {
    headers = ["Section", "Status or Category", "Channel", "Currency", "Count", "Amount", "Accepted", "Rejected", "Warnings", "Publication Rows"];
    rows = [
      ...breakdownRows("Registration status", dashboard.registration_statuses),
      ...breakdownRows("Eligibility status", dashboard.eligibility_statuses),
      ...breakdownRows("FPL verification", dashboard.verification_statuses.fpl),
      ...breakdownRows("Vult verification", dashboard.verification_statuses.vult),
      ...breakdownRows("Duplicate risk", dashboard.verification_statuses.duplicate_risk),
      ...breakdownRows("Provider runs", dashboard.provider_runs),
      ...breakdownRows("Round status", dashboard.round_statuses),
      ...breakdownRows("Leaderboard status", dashboard.leaderboard_statuses),
      ...breakdownRows("Winner status", dashboard.winner_statuses),
      ...breakdownRows("Payment status", dashboard.payment_statuses),
      ...breakdownRows("Dispute status", dashboard.dispute_statuses),
      ...breakdownRows("Dispute category", dashboard.dispute_categories),
      ...breakdownRows("Notification status", dashboard.notification_statuses),
    ];
    filename = "operations-health";
  }

  if (reportType === "audit_history") {
    const auditFilters = {
      search: clean(params.get("q")),
      action: clean(params.get("action"), 120),
      entityType: clean(params.get("entity"), 120),
      actorId: clean(params.get("actor"), 40),
      from: clean(params.get("from"), 10),
      to: clean(params.get("to"), 10),
    };
    Object.entries(auditFilters).forEach(([key, value]) => value && (filters[key] = value));

    const records = [];
    let page = 1;
    let total = 0;
    do {
      const result = await loadAuditHistory(admin, { ...auditFilters, page, pageSize: 100 });
      if (!result) break;
      total = Math.min(result.total, 5000);
      records.push(...result.rows);
      page += 1;
    } while (records.length < total && page <= 50);

    headers = ["Event ID", "Created At", "Actor", "Actor Role", "Action", "Entity Type", "Entity ID", "Metadata"];
    rows = records.slice(0, 5000).map((row) => [row.id, row.created_at, row.actor_name, row.actor_role, row.action, row.entity_type, row.entity_id, row.metadata]);
    filename = "audit-history";
  }

  const db = createAdminSupabaseClient() as any;
  const { error: recordError } = await db.rpc("record_report_export", {
    p_report_type: reportType,
    p_competition_season_id: reportType === "audit_history" ? null : dashboard.selected_season_id,
    p_export_format: "csv",
    p_filters: filters,
    p_row_count: rows.length,
    p_requested_by: admin.id,
  });
  if (recordError) {
    console.error("Report export audit failed", recordError.message);
    return NextResponse.json({ error: "Unable to record report export" }, { status: 500 });
  }

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(makeCsv(headers, rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vult-fantasy-${filename}-${date}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
