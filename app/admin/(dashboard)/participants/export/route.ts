import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const allowedRegistrationStatuses = new Set([
  "pending",
  "approved",
  "rejected",
  "suspended",
  "disqualified",
]);
const allowedVerificationStatuses = new Set([
  "pending",
  "verified",
  "failed",
  "review_required",
  "not_required",
]);
const allowedRiskStatuses = new Set(["none", "low", "medium", "high"]);

function safeCsvCell(value: unknown) {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function compactSearch(value: string | null) {
  return (value ?? "").trim().toLowerCase().slice(0, 120);
}

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const season = searchParams.get("season");
  const status = searchParams.get("status");
  const fpl = searchParams.get("fpl");
  const vult = searchParams.get("vult");
  const risk = searchParams.get("risk");
  const search = compactSearch(searchParams.get("q"));
  const verificationJoin = fpl || vult || risk ? "!inner" : "";

  const supabase = await createServerSupabaseClient();
  const db = supabase as any;
  let query = db
    .from("registrations")
    .select(
      `
        public_reference,
        status,
        eligibility_status,
        registered_at,
        registration_channel,
        rules_version,
        participant:participants!registrations_participant_id_fkey(
          full_name, phone, whatsapp_phone, email, city, country, status
        ),
        fantasy_entry:fantasy_entries(
          provider, provider_entry_id, manager_name, team_name, verified_at
        ),
        verification:registration_verifications${verificationJoin}(
          fpl_status, vult_status, vult_kyc_level, duplicate_risk, duplicate_risk_reasons,
          fpl_checked_at, vult_checked_at, duplicate_checked_at
        ),
        competition_season:competition_seasons!registrations_competition_season_id_fkey(
          id, name, status
        )
      `,
    )
    .order("registered_at", { ascending: false })
    .limit(5000);

  if (season) query = query.eq("competition_season_id", season);
  if (status && allowedRegistrationStatuses.has(status)) query = query.eq("status", status);
  if (fpl && allowedVerificationStatuses.has(fpl)) {
    query = query.eq("registration_verifications.fpl_status", fpl);
  }
  if (vult && allowedVerificationStatuses.has(vult)) {
    query = query.eq("registration_verifications.vult_status", vult);
  }
  if (risk && allowedRiskStatuses.has(risk)) {
    query = query.eq("registration_verifications.duplicate_risk", risk);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Participant export failed", error.message);
    return NextResponse.json({ error: "Unable to export participants" }, { status: 500 });
  }

  const rows = (data ?? []).filter((row: any) => {
    if (!search) return true;
    const participant = row.participant ?? {};
    const entry = row.fantasy_entry ?? {};
    return [
      row.public_reference,
      participant.full_name,
      participant.phone,
      participant.whatsapp_phone,
      participant.email,
      entry.provider_entry_id,
      entry.manager_name,
      entry.team_name,
    ].some((value) => String(value ?? "").toLowerCase().includes(search));
  });

  const headers = [
    "Registration Reference",
    "Competition Season",
    "Registration Status",
    "Eligibility Status",
    "Registered At",
    "Registration Channel",
    "Rules Version",
    "Full Name",
    "Phone",
    "WhatsApp",
    "Email",
    "City",
    "Country",
    "Participant Status",
    "FPL Provider",
    "FPL Entry ID",
    "FPL Manager Name",
    "FPL Team Name",
    "FPL Verification",
    "Vult Verification",
    "Vult KYC Level",
    "Duplicate Risk",
    "Duplicate Risk Reasons",
  ];

  const lines = [headers.map(safeCsvCell).join(",")];
  for (const row of rows) {
    const participant = row.participant ?? {};
    const entry = row.fantasy_entry ?? {};
    const verification = row.verification ?? {};
    const reasons = Array.isArray(verification.duplicate_risk_reasons)
      ? verification.duplicate_risk_reasons.join(" | ")
      : "";

    lines.push(
      [
        row.public_reference,
        row.competition_season?.name,
        row.status,
        row.eligibility_status,
        row.registered_at,
        row.registration_channel,
        row.rules_version,
        participant.full_name,
        participant.phone,
        participant.whatsapp_phone,
        participant.email,
        participant.city,
        participant.country,
        participant.status,
        entry.provider,
        entry.provider_entry_id,
        entry.manager_name,
        entry.team_name,
        verification.fpl_status,
        verification.vult_status,
        verification.vult_kyc_level,
        verification.duplicate_risk,
        reasons,
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
      "Content-Disposition": `attachment; filename="vult-fantasy-participants-${date}.csv"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
