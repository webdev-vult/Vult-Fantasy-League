import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { preparePrizePaymentAction } from "./actions";

type SearchParams = Promise<{
  season?: string;
  status?: string;
  success?: string;
  error?: string;
}>;

type Season = { id: string; name: string; status: string };
type Candidate = {
  id: string;
  competition_season_id: string;
  display_name_snapshot: string | null;
  team_name_snapshot: string | null;
  provider_entry_id_snapshot: string | null;
  prize_id: string | null;
  prize_snapshot: unknown;
  status: string;
  confirmed_at: string | null;
  score: number;
  scope: string | null;
};
type Payment = {
  id: string;
  award_reference: string;
  competition_season_id: string;
  winner_candidate_id: string;
  amount: number;
  currency: string;
  status: string;
  destination_status: string;
  finance_review_status: string;
  reversal_status: string;
  reconciliation_status: string;
  attempt_count: number;
  payment_method: string;
  prize_type: string;
  payment_deadline_at: string | null;
  paid_at: string | null;
  failure_reason: string | null;
  transaction_reference: string | null;
  winner_snapshot: unknown;
  prize_snapshot: unknown;
  created_at: string;
};

type Snapshot = Record<string, unknown>;

const PAYMENT_STATUSES = [
  "all",
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
] as const;

function object(value: unknown): Snapshot {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Snapshot)
    : {};
}

function stringValue(value: unknown, fallback = "Not recorded") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function statusClasses(status: string) {
  if (["paid", "matched", "resolved", "approved", "verified"].includes(status)) {
    return "border-green-200 bg-green-50 text-green-800";
  }
  if (
    [
      "destination_pending",
      "finance_review",
      "processing",
      "reversal_requested",
      "reversal_approved",
      "reversal_processing",
      "pending",
      "mismatch",
    ].includes(status)
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (["failed", "cancelled", "reversed", "rejected"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default async function PaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;

  const { data: seasonRows, error: seasonsError } = await db
    .from("competition_seasons")
    .select("id, name, status")
    .order("created_at", { ascending: false });
  const seasons = (seasonRows ?? []) as Season[];
  const selectedSeasonId = seasons.some((season) => season.id === params.season)
    ? params.season!
    : seasons[0]?.id;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId);
  const selectedStatus = PAYMENT_STATUSES.includes(
    (params.status ?? "all") as (typeof PAYMENT_STATUSES)[number],
  )
    ? (params.status ?? "all")
    : "all";

  let payments: Payment[] = [];
  let confirmedCandidates: Candidate[] = [];
  let loadError = seasonsError?.message ?? null;

  if (selectedSeasonId) {
    let paymentQuery = db
      .from("prize_payments")
      .select(
        "id, award_reference, competition_season_id, winner_candidate_id, amount, currency, status, destination_status, finance_review_status, reversal_status, reconciliation_status, attempt_count, payment_method, prize_type, payment_deadline_at, paid_at, failure_reason, transaction_reference, winner_snapshot, prize_snapshot, created_at",
      )
      .eq("competition_season_id", selectedSeasonId)
      .order("created_at", { ascending: false });

    if (selectedStatus !== "all") paymentQuery = paymentQuery.eq("status", selectedStatus);

    const [paymentsResult, candidatesResult] = await Promise.all([
      paymentQuery,
      db
        .from("winner_candidates")
        .select(
          "id, competition_season_id, display_name_snapshot, team_name_snapshot, provider_entry_id_snapshot, prize_id, prize_snapshot, status, confirmed_at, score, scope",
        )
        .eq("competition_season_id", selectedSeasonId)
        .eq("is_current", true)
        .eq("status", "confirmed")
        .order("confirmed_at", { ascending: true }),
    ]);

    payments = (paymentsResult.data ?? []) as Payment[];
    const allCandidates = (candidatesResult.data ?? []) as Candidate[];
    const { data: preparedRows, error: preparedError } = await db
      .from("prize_payments")
      .select("winner_candidate_id")
      .eq("competition_season_id", selectedSeasonId);
    const preparedIds = new Set(
      (preparedRows ?? []).map((row: { winner_candidate_id: string }) => row.winner_candidate_id),
    );
    confirmedCandidates = allCandidates.filter((candidate) => !preparedIds.has(candidate.id));

    loadError =
      loadError ??
      paymentsResult.error?.message ??
      candidatesResult.error?.message ??
      preparedError?.message ??
      null;
  }

  const canPrepare = ["super_admin", "finance_officer"].includes(admin.role);
  const activeCount = payments.filter((payment) =>
    ["destination_pending", "finance_review", "approved", "processing", "failed"].includes(
      payment.status,
    ),
  ).length;
  const paidCount = payments.filter((payment) => payment.status === "paid").length;
  const exceptionCount = payments.filter(
    (payment) =>
      payment.status === "failed" ||
      payment.reconciliation_status === "mismatch" ||
      payment.status.startsWith("reversal_"),
  ).length;
  const overdueCount = payments.filter(
    (payment) =>
      payment.payment_deadline_at &&
      new Date(payment.payment_deadline_at).getTime() < Date.now() &&
      !["paid", "cancelled", "reversed"].includes(payment.status),
  ).length;

  const currencyTotals = payments.reduce<Record<string, { total: number; paid: number }>>(
    (totals, payment) => {
      totals[payment.currency] ??= { total: 0, paid: 0 };
      totals[payment.currency].total += Number(payment.amount);
      if (payment.status === "paid") totals[payment.currency].paid += Number(payment.amount);
      return totals;
    },
    {},
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
            Phase 10 · Prize settlement
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            Payments
          </h1>
          <p className="mt-3 max-w-3xl text-[var(--muted)]">
            Prepare confirmed winners, verify destinations, approve finance controls, record
            payment attempts, reconcile transactions and manage controlled reversals.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/admin/payments/export${selectedSeasonId ? `?season=${selectedSeasonId}` : ""}`}
            className="rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-black text-[var(--brand)]"
          >
            Export CSV
          </Link>
          <Link
            href="/admin/winners"
            className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white"
          >
            Winner approvals
          </Link>
        </div>
      </div>

      {params.success ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">
          {params.success}
        </div>
      ) : null}
      {params.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
          {params.error}
        </div>
      ) : null}
      {loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
          Unable to load payment operations: {loadError}
        </div>
      ) : null}

      <form className="grid gap-4 rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-bold text-[var(--brand-strong)]">
          Competition season
          <select
            name="season"
            defaultValue={selectedSeasonId}
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm"
          >
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.name} · {label(season.status)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold text-[var(--brand-strong)]">
          Settlement status
          <select
            name="status"
            defaultValue={selectedStatus}
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm capitalize"
          >
            {PAYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {label(status)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="self-end rounded-xl bg-[var(--brand-strong)] px-5 py-3 text-sm font-black text-white"
        >
          Apply filters
        </button>
      </form>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Confirmed to prepare", confirmedCandidates.length],
          ["Active settlements", activeCount],
          ["Paid", paidCount],
          ["Exceptions", exceptionCount],
          ["Overdue", overdueCount],
        ].map(([title, value]) => (
          <article key={String(title)} className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              {title}
            </p>
            <p className="mt-3 text-3xl font-black text-[var(--brand-strong)]">{value}</p>
          </article>
        ))}
      </section>

      {Object.keys(currencyTotals).length ? (
        <section className="grid gap-4 md:grid-cols-3">
          {Object.entries(currencyTotals).map(([currency, totals]) => (
            <article key={currency} className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                {currency} settlement value
              </p>
              <p className="mt-3 text-2xl font-black text-[var(--brand-strong)]">
                {formatMoney(totals.total, currency)}
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Paid: {formatMoney(totals.paid, currency)}
              </p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-black text-[var(--brand-strong)]">
              Confirmed winners awaiting settlement
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Preparation snapshots the confirmed winner and prize before payment operations begin.
            </p>
          </div>
          {!canPrepare ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">
              Read-only for {label(admin.role)}
            </span>
          ) : null}
        </div>

        <div className="mt-5 space-y-3">
          {confirmedCandidates.length ? (
            confirmedCandidates.map((candidate) => {
              const prize = object(candidate.prize_snapshot);
              return (
                <article
                  key={candidate.id}
                  className="grid gap-4 rounded-2xl border border-[var(--border)] p-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center"
                >
                  <div>
                    <p className="font-black text-[var(--brand-strong)]">
                      {candidate.display_name_snapshot ?? "Confirmed winner"}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {candidate.team_name_snapshot ?? "No team name"} · FPL {candidate.provider_entry_id_snapshot ?? "—"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Confirmed {formatDate(candidate.confirmed_at)} · {label(candidate.scope ?? "overall")}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-black text-[var(--brand-strong)]">
                      {stringValue(prize.name, "Assigned prize")}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {stringValue(prize.currency, "SLE")} {String(prize.amount ?? "0.00")} · {label(stringValue(prize.payment_method, "vult_wallet"))}
                    </p>
                  </div>
                  {canPrepare ? (
                    <form action={preparePrizePaymentAction}>
                      <input type="hidden" name="candidate_id" value={candidate.id} />
                      <input
                        type="hidden"
                        name="competition_season_id"
                        value={candidate.competition_season_id}
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white"
                      >
                        Prepare settlement
                      </button>
                    </form>
                  ) : (
                    <Link
                      href={`/admin/winners/${candidate.id}`}
                      className="rounded-xl border border-[var(--border)] px-4 py-3 text-center text-sm font-black text-[var(--brand)]"
                    >
                      View winner
                    </Link>
                  )}
                </article>
              );
            })
          ) : (
            <div className="rounded-2xl bg-slate-50 p-5 text-sm text-[var(--muted)]">
              No confirmed winners are waiting for settlement preparation in {selectedSeason?.name ?? "this season"}.
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <h2 className="text-xl font-black text-[var(--brand-strong)]">Settlement queue</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            All states remain visible for finance, compliance and audit review.
          </p>
        </div>
        {payments.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.1em] text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-4">Winner and award</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Workflow</th>
                  <th className="px-5 py-4">Controls</th>
                  <th className="px-5 py-4">Deadline</th>
                  <th className="px-5 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {payments.map((payment) => {
                  const winner = object(payment.winner_snapshot);
                  const prize = object(payment.prize_snapshot);
                  const overdue =
                    payment.payment_deadline_at &&
                    new Date(payment.payment_deadline_at).getTime() < Date.now() &&
                    !["paid", "cancelled", "reversed"].includes(payment.status);
                  return (
                    <tr key={payment.id} className="align-top">
                      <td className="px-5 py-5">
                        <p className="font-black text-[var(--brand-strong)]">
                          {stringValue(winner.display_name, "Winner")}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {stringValue(prize.name, "Prize")} · {payment.award_reference}
                        </p>
                        {payment.transaction_reference ? (
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            Transaction: {payment.transaction_reference}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-5">
                        <p className="font-black text-[var(--brand-strong)]">
                          {formatMoney(Number(payment.amount), payment.currency)}
                        </p>
                        <p className="mt-1 text-xs capitalize text-[var(--muted)]">
                          {label(payment.prize_type)} · {label(payment.payment_method)}
                        </p>
                      </td>
                      <td className="px-5 py-5">
                        <span className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${statusClasses(payment.status)}`}>
                          {label(payment.status)}
                        </span>
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          Attempts: {payment.attempt_count}
                        </p>
                        {payment.failure_reason ? (
                          <p className="mt-1 max-w-xs text-xs text-red-700">{payment.failure_reason}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-5 text-xs text-[var(--muted)]">
                        <p>Destination: {label(payment.destination_status)}</p>
                        <p className="mt-1">Finance: {label(payment.finance_review_status)}</p>
                        <p className="mt-1">Reversal: {label(payment.reversal_status)}</p>
                        <p className="mt-1">Reconciliation: {label(payment.reconciliation_status)}</p>
                      </td>
                      <td className="px-5 py-5">
                        <p className={overdue ? "font-black text-red-700" : "text-[var(--muted)]"}>
                          {formatDate(payment.payment_deadline_at)}
                        </p>
                        {payment.paid_at ? (
                          <p className="mt-1 text-xs text-green-700">Paid {formatDate(payment.paid_at)}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-5">
                        <Link
                          href={`/admin/payments/${payment.id}`}
                          className="inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-black text-[var(--brand)]"
                        >
                          Review settlement
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-sm text-[var(--muted)]">
            No settlements match the selected season and status.
          </div>
        )}
      </section>
    </div>
  );
}
