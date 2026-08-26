import { reconcilePendingFplRegistrations } from "@/lib/registration/reconcile-pending-fpl";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await reconcilePendingFplRegistrations();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Pending FPL reconciliation failed", error);
    return Response.json(
      { ok: false, error: "Pending FPL reconciliation failed." },
      { status: 500 },
    );
  }
}
