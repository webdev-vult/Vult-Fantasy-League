import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function formatNumber(value: number | null) {
  return new Intl.NumberFormat("en").format(value ?? 0);
}

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();
  const supabase = await createServerSupabaseClient();

  const [
    participantsResult,
    registrationsResult,
    pendingWinnersResult,
    pendingPaymentsResult,
    competitionSeasonResult,
  ] = await Promise.all([
    supabase.from("participants").select("id", { count: "exact", head: true }),
    supabase.from("registrations").select("id", { count: "exact", head: true }),
    supabase
      .from("winner_candidates")
      .select("id", { count: "exact", head: true })
      .in("status", ["provisional", "under_review"]),
    supabase
      .from("prize_payments")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "approved", "processing"]),
    supabase
      .from("competition_seasons")
      .select("name, status, data_provider, registration_opens_at, registration_closes_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const metrics = [
    { label: "Participants", value: formatNumber(participantsResult.count), note: "Permanent profiles" },
    { label: "Registrations", value: formatNumber(registrationsResult.count), note: "Across all seasons" },
    { label: "Winner reviews", value: formatNumber(pendingWinnersResult.count), note: "Awaiting a decision" },
    { label: "Pending payments", value: formatNumber(pendingPaymentsResult.count), note: "Finance workflow" },
  ];

  const competitionSeason = competitionSeasonResult.data;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
            Platform overview
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            Welcome, {admin.full_name.split(" ")[0]}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
            Monitor registration, competition operations, winner approvals and prize payments from this workspace.
          </p>
        </div>
        <span className="w-fit rounded-full border border-green-200 bg-green-50 px-4 py-2 text-xs font-black text-green-700">
          Secure session active
        </span>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <p className="text-sm font-bold text-[var(--muted)]">{metric.label}</p>
            <p className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
              {metric.value}
            </p>
            <p className="mt-2 text-xs font-semibold text-[var(--muted)]">{metric.note}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">
                Current competition season
              </p>
              <h2 className="mt-3 text-2xl font-black text-[var(--brand-strong)]">
                {competitionSeason?.name ?? "No competition season configured"}
              </h2>
            </div>
            {competitionSeason ? (
              <span className="w-fit rounded-full bg-[var(--surface-soft)] px-3 py-2 text-xs font-black capitalize text-[var(--brand)]">
                {competitionSeason.status.replaceAll("_", " ")}
              </span>
            ) : null}
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#f7f9fd] p-4">
              <p className="text-xs font-bold text-[var(--muted)]">Data provider</p>
              <p className="mt-2 font-black capitalize text-[var(--brand-strong)]">
                {competitionSeason?.data_provider.replaceAll("_", " ") ?? "Not configured"}
              </p>
            </div>
            <div className="rounded-2xl bg-[#f7f9fd] p-4">
              <p className="text-xs font-bold text-[var(--muted)]">Registration opens</p>
              <p className="mt-2 font-black text-[var(--brand-strong)]">
                {competitionSeason?.registration_opens_at
                  ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
                      new Date(competitionSeason.registration_opens_at),
                    )
                  : "Not set"}
              </p>
            </div>
            <div className="rounded-2xl bg-[#f7f9fd] p-4">
              <p className="text-xs font-bold text-[var(--muted)]">Registration closes</p>
              <p className="mt-2 font-black text-[var(--brand-strong)]">
                {competitionSeason?.registration_closes_at
                  ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
                      new Date(competitionSeason.registration_closes_at),
                    )
                  : "Not set"}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-3xl bg-[var(--brand-strong)] p-6 text-white shadow-xl shadow-blue-950/15 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--accent)]">
            Next implementation
          </p>
          <h2 className="mt-3 text-2xl font-black">Competition and season management</h2>
          <p className="mt-4 leading-7 text-blue-100">
            The next module will allow authorised staff to edit dates, season status, provider settings, rules and prize periods without changing code.
          </p>
          <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold text-blue-100">
            Authentication and role protection are now the foundation for every administrative workflow.
          </div>
        </article>
      </section>
    </div>
  );
}
