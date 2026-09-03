import { reconcilePendingFplRegistrations } from "@/lib/registration/reconcile-pending-fpl";
import { syncAllOfficialFplMonthlyPeriods } from "@/lib/fantasy-providers/sync-fpl-monthly-periods";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const [registrations, monthlyPeriods] = await Promise.all([
      reconcilePendingFplRegistrations(),
      syncAllOfficialFplMonthlyPeriods(),
    ]);
    return Response.json({ ok: true, registrations, monthlyPeriods });
  } catch (error) {
    console.error("Scheduled FPL maintenance failed", error);
    return Response.json(
      { ok: false, error: "Scheduled FPL maintenance failed." },
      { status: 500 },
    );
  }
}