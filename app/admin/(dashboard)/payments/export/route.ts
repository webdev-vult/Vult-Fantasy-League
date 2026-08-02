import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const allowedStatuses = new Set([
  "destination_pending",
  "finance_review",
  "approved",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "reversal_requested",
  "reversal_approved",
  "reversal_processing",
  "reversed",
]);

function safeCsvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const season = request.nextUrl.searchParams.get("season");
  const status = request.nextUrl.searchParams.get("status");
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;

  let query = db
    .from("prize_payments")
    .select(
      "award_reference, amount, currency, status, prize_type, payment_method, destination_reference, destination_status, finance_review_status, attempt_count, transaction_reference, paid_at, failed_at, failure_code, failure_reason, reversal_status, reconciliation_status, payment_deadline_at, created_at, winner_snapshot, prize_snapshot, competition_season:competition_seasons!prize_payments_competition_season_id_fkey(name, status)",
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  if (season) query = query.eq("competition_season_id", season);
  if (status && allowedStatuses.has(status)) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("Prize payment export failed", error.message);
    return NextResponse.json({ error: "Unable to export prize payments" }, { status: 500 });
  }

  const headers = [
    "Award Reference",
    "Competition Season",
    "Winner",
    "Team Name",
    "FPL Entry ID",
    "Prize",
    "Prize Code",
    "Prize Type",
    "Payment Method",
    "Amount",
    "Currency",
    "Settlement Status",
    "Destination Reference",
    "Destination Status",
    "Finance Review",
    "Attempt Count",
    "Transaction Reference",
    "Paid At",
    "Failed At",
    "Failure Code",
    "Failure Reason",
    "Reversal Status",
    "Reconciliation Status",
    "Payment Deadline",
    "Created At",
  ];

  const lines = [headers.map(safeCsvCell).join(",")];
  for (const row of data ?? []) {
    const winner = object(row.winner_snapshot);
    const prize = object(row.prize_snapshot);
    lines.push(
      [
        row.award_reference,
        row.competition_season?.name,
        winner.display_name,
        winner.team_name,
        winner.provider_entry_id,
        prize.name,
        prize.code,
        row.prize_type,
        row.payment_method,
        row.amount,
        row.currency,
        row.status,
        row.destination_reference,
        row.destination_status,
        row.finance_review_status,
        row.attempt_count,
        row.transaction_reference,
        row.paid_at,
        row.failed_at,
        row.failure_code,
        row.failure_reason,
        row.reversal_status,
        row.reconciliation_status,
        row.payment_deadline_at,
        row.created_at,
      ]
        .map(safeCsvCell)
        .join(","),
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(`\uFEFF${lines.join("\r\n")}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vult-fantasy-prize-payments-${date}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
