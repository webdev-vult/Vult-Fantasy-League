import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/admin";

const headers = [
  "provider_entry_id",
  "external_round_id",
  "manager_name",
  "team_name",
  "reported_points",
  "total_points",
  "transfer_cost",
  "chip_used",
  "round_rank",
  "overall_rank",
  "is_provisional",
];

const example = [
  "1234567",
  "1",
  "Example Manager",
  "Example XI",
  "68",
  "68",
  "0",
  "",
  "125000",
  "850000",
  "true",
];

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const csv = [headers, example].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vult-fantasy-provider-template.csv"',
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
