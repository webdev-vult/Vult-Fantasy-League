import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  addPaymentEvidenceAction,
  cancelPrizePaymentAction,
  financeReviewPaymentAction,
  reconcilePrizePaymentAction,
  reopenPrizePaymentAction,
  reviewPaymentDestinationAction,
} from "../actions";
import { recordManualVultPaymentAction } from "../manual-actions";

type Params = Promise<{ paymentId: string }>;
type SearchParams = Promise<{ success?: string; error?: string }>;
type Snapshot = Record<string, unknown>;

type Payment = {
  id: string;
  award_reference: string;
  competition_season_id: string;
  winner_candidate_id: string;
  participant_id: string;
  amount: number;
  currency: string;
  status: string;
  prize_type: string;
  payment_method: string;
  non_cash_description: string | null;
  destination_reference: string | null;
  destination_status: string;
  destination_verified_at: string | null;
  destination_verification_notes: string | null;
  finance_review_status: string;
  finance_reviewed_at: string | null;
  finance_review_notes: string | null;
  attempt_count: number;
  transaction_reference: string | null;
  evidence_path: string | null;
  paid_at: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  reversal_status: string;
  reconciliation_status: string;
  payment_deadline_at: string | null;
  prize_snapshot: unknown;
  winner_snapshot: unknown;
  created_at: string;
  updated_at: string;
};

type Attempt = {
  id: string;
  attempt_number: number;
  processor: string;
  status: string;
  destination_reference: string | null;
  transaction_reference: string | null;
  evidence_path: string | null;
  requested_by: string;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
};

type History = {
  id: number;
  from_status: string | null;
  to_status: string;
  action: string;
  notes: string | null;
  created_at: string;
};

type Evidence = {
  id: string;
  evidence_type: string;
  storage_path: string | null;
  external_url: string | null;
  file_name: string | null;
  notes: string | null;
  created_at: string;
};

type Reconciliation = {
  id: string;
  status: string;
  external_reference: string | null;
  matched_amount: number | null;
  matched_currency: string | null;
  statement_date: string | null;
  notes: string;
  created_at: string;
};

type Reversal = {
  id: string;
  status: string;
  reason: string;
  transaction_reference: string | null;
  completed_at: string | null;
  created_at: string;
};

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

function inputClasses() {
  return "mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm";
}

function statusClasses(status: string) {
  if (["paid", "approved", "verified", "matched", "resolved", "succeeded"].includes(status)) {
    return "border-green-200 bg-green-50 text-green-800";
  }
  if (["destination_pending", "finance_review", "pending", "mismatch"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (["failed", "cancelled", "rejected", "reversed"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function externalUrl(value: string | null) {
  return value && /^https?:\/\//i.test(value) ? value : null;
}

export default async function PaymentDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const admin = await requireAdmin();
  const { paymentId } = await params;
  const messages = await searchParams;
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;

  const { data: paymentRow, error: paymentError } = await db
    .from("prize_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError || !paymentRow) notFound();
  const payment = paymentRow as Payment;

  const [seasonResult, participantResult, attemptsResult, historyResult, evidenceResult, reconciliationsResult, reversalsResult] =
    await Promise.all([
      db
        .from("competition_seasons")
        .select("id, name, status")
        .eq("id", payment.competition_season_id)
        .maybeSingle(),
      db
        .from("participants")
        .select("id, full_name, email, phone, country, city, vult_customer_ref, status")
        .eq("id", payment.participant_id)
        .maybeSingle(),
      db
        .from("prize_payment_attempts")
        .select("id, attempt_number, processor, status, destination_reference, transaction_reference, evidence_path, requested_by, started_at, completed_at, notes")
        .eq("payment_id", payment.id)
        .order("attempt_number", { ascending: false }),
      db
        .from("prize_payment_status_history")
        .select("id, from_status, to_status, action, notes, created_at")
        .eq("payment_id", payment.id)
        .order("created_at", { ascending: false }),
      db
        .from("prize_payment_evidence")
        .select("id, evidence_type, storage_path, external_url, file_name, notes, created_at")
        .eq("payment_id", payment.id)
        .order("created_at", { ascending: false }),
      db
        .from("prize_payment_reconciliations")
        .select("id, status, external_reference, matched_amount, matched_currency, statement_date, notes, created_at")
        .eq("payment_id", payment.id)
        .order("created_at", { ascending: false }),
      db
        .from("prize_payment_reversals")
        .select("id, status, reason, transaction_reference, completed_at, created_at")
        .eq("payment_id", payment.id)
        .order("created_at", { ascending: false }),
    ]);

  const season = seasonResult.data as Record<string, unknown> | null;
  const participant = participantResult.data as Record<string, unknown> | null;
  const attempts = (attemptsResult.data ?? []) as Attempt[];
  const history = (historyResult.data ?? []) as History[];
  const evidence = (evidenceResult.data ?? []) as Evidence[];
  const reconciliations = (reconciliationsResult.data ?? []) as Reconciliation[];
  const reversals = (reversalsResult.data ?? []) as Reversal[];
  const winner = object(payment.winner_snapshot);
  const prize = object(payment.prize_snapshot);

  const canFinance = ["super_admin", "finance_officer"].includes(admin.role);
  const canDestination = ["super_admin", "compliance_officer"].includes(admin.role);
  const canEvidence = ["super_admin", "finance_officer", "compliance_officer"].includes(admin.role);
  const canSuperAdmin = admin.role === "super_admin";
  const canCancel = canFinance && ["destination_pending", "finance_review", "approved", "failed"].includes(payment.status);
  const overdue =
    payment.payment_deadline_at &&
    new Date(payment.payment_deadline_at).getTime() < Date.now() &&
    !["paid", "cancelled", "reversed"].includes(payment.status);
  const defaultCreditTime = new Date().toISOString().slice(0, 16);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href={`/admin/payments?season=${payment.competition_season_id}`}
            className="text-sm font-black text-[var(--brand)] hover:underline"
          >
            ← Payment queue
          </Link>
          <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
            Manual Vult settlement record
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            {stringValue(winner.display_name, stringValue(participant?.full_name, "Winner"))}
          </h1>
          <p className="mt-3 text-[var(--muted)]">
            {payment.award_reference} · {stringValue(prize.name, "Prize")} · {stringValue(season?.name, "Competition season")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-4 py-2 text-xs font-black capitalize ${statusClasses(payment.status)}`}>
            {label(payment.status)}
          </span>
          <span className={`rounded-full border px-4 py-2 text-xs font-black capitalize ${statusClasses(payment.reconciliation_status)}`}>
            Reconciliation: {label(payment.reconciliation_status)}
          </span>
          {overdue ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-800">
              Payment overdue
            </span>
          ) : null}
        </div>
      </div>

      <section className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-blue-950 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Manual settlement policy</p>
        <h2 className="mt-2 text-xl font-black">This platform never sends money.</h2>
        <p className="mt-3 max-w-4xl leading-7 text-blue-900">
          Finance must credit the verified winner account inside the main Vult system first. Only after the credit is visible should the Vult transaction reference, credit time, evidence and notes be recorded here. No Vult payout API or reimbursement API is called from this platform.
        </p>
      </section>

      {messages.success ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">
          {messages.success}
        </div>
      ) : null}
      {messages.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
          {messages.error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Prize value", formatMoney(Number(payment.amount), payment.currency)],
          ["Verified Vult account", payment.destination_reference ?? "Not required"],
          ["Finance review", label(payment.finance_review_status)],
          ["Recorded transactions", String(payment.attempt_count)],
        ].map(([title, value]) => (
          <article key={title} className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">{title}</p>
            <p className="mt-3 break-words text-lg font-black text-[var(--brand-strong)]">{value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Winner</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div><dt className="text-[var(--muted)]">Name</dt><dd className="font-bold">{stringValue(winner.display_name, stringValue(participant?.full_name))}</dd></div>
            <div><dt className="text-[var(--muted)]">Team</dt><dd className="font-bold">{stringValue(winner.team_name)}</dd></div>
            <div><dt className="text-[var(--muted)]">Phone</dt><dd className="font-bold">{stringValue(participant?.phone)}</dd></div>
            <div><dt className="text-[var(--muted)]">Email</dt><dd className="font-bold">{stringValue(participant?.email)}</dd></div>
            <div><dt className="text-[var(--muted)]">Participant status</dt><dd className="font-bold capitalize">{label(stringValue(participant?.status, "unknown"))}</dd></div>
          </dl>
          <Link href={`/admin/winners/${payment.winner_candidate_id}`} className="mt-5 inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-black text-[var(--brand)]">
            Open winner approval record
          </Link>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Prize</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div><dt className="text-[var(--muted)]">Prize</dt><dd className="font-bold">{stringValue(prize.name)}</dd></div>
            <div><dt className="text-[var(--muted)]">Type</dt><dd className="font-bold capitalize">{label(payment.prize_type)}</dd></div>
            <div><dt className="text-[var(--muted)]">Method</dt><dd className="font-bold capitalize">{label(payment.payment_method)}</dd></div>
            <div><dt className="text-[var(--muted)]">Deadline</dt><dd className={overdue ? "font-black text-red-700" : "font-bold"}>{formatDate(payment.payment_deadline_at)}</dd></div>
            {payment.non_cash_description ? <div><dt className="text-[var(--muted)]">Fulfilment</dt><dd className="font-bold">{payment.non_cash_description}</dd></div> : null}
          </dl>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Recorded payment</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div><dt className="text-[var(--muted)]">Vult account</dt><dd className="break-words font-bold">{payment.destination_reference ?? "Not required"}</dd></div>
            <div><dt className="text-[var(--muted)]">Transaction reference</dt><dd className="break-words font-bold">{payment.transaction_reference ?? "Not recorded"}</dd></div>
            <div><dt className="text-[var(--muted)]">Credited at</dt><dd className="font-bold">{formatDate(payment.paid_at)}</dd></div>
            <div><dt className="text-[var(--muted)]">Last updated</dt><dd className="font-bold">{formatDate(payment.updated_at)}</dd></div>
          </dl>
          {payment.failure_reason ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-black">{payment.failure_code ?? "Payment issue"}</p>
              <p className="mt-1">{payment.failure_reason}</p>
            </div>
          ) : null}
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {payment.status === "destination_pending" && canDestination ? (
          <form action={reviewPaymentDestinationAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-[var(--brand-strong)]">Compliance Vult-account review</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Verify that this reference exactly matches the Vult account approved during participant verification.</p>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <label className="mt-5 block text-sm font-bold">Verified Vult account reference
              <input name="destination_reference" defaultValue={payment.destination_reference ?? ""} className={inputClasses()} required />
            </label>
            <label className="mt-4 block text-sm font-bold">Review notes
              <textarea name="notes" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button name="decision" value="approve" className="rounded-xl bg-green-700 px-4 py-3 text-sm font-black text-white">Verify Vult account</button>
              <button name="decision" value="reject" className="rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white">Reject reference</button>
            </div>
          </form>
        ) : null}

        {payment.status === "finance_review" && canFinance ? (
          <form action={financeReviewPaymentAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-[var(--brand-strong)]">Finance approval</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Approve the prize obligation before the winner is credited manually in the main Vult system.</p>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <label className="mt-5 block text-sm font-bold">Finance notes
              <textarea name="notes" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button name="decision" value="approve" className="rounded-xl bg-green-700 px-4 py-3 text-sm font-black text-white">Approve manual payment</button>
              <button name="decision" value="reject" className="rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white">Reject and cancel</button>
            </div>
          </form>
        ) : null}

        {payment.status === "approved" && canFinance ? (
          <form action={recordManualVultPaymentAction} className="rounded-3xl border border-green-200 bg-green-50 p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-green-700">Record only after credit</p>
            <h2 className="mt-2 text-xl font-black text-green-950">
              {payment.prize_type === "non_cash" ? "Record completed fulfilment" : "Confirm winner’s Vult account was credited"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-green-900">
              Complete the payment in the main Vult system first. This form only records the completed transaction and does not send money.
            </p>
            <input type="hidden" name="payment_id" value={payment.id} />
            <div className="mt-5 rounded-2xl border border-green-200 bg-white p-4 text-sm">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-green-700">Approved destination</p>
              <p className="mt-2 break-words font-black text-green-950">{payment.destination_reference ?? "Non-cash fulfilment"}</p>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">Vult transaction / fulfilment reference
                <input name="transaction_reference" className={inputClasses()} minLength={4} required />
              </label>
              <label className="text-sm font-bold">Credit / fulfilment date and time
                <input type="datetime-local" name="credited_at" defaultValue={defaultCreditTime} className={inputClasses()} required />
              </label>
            </div>
            <label className="mt-4 block text-sm font-bold">Receipt or evidence reference
              <input name="evidence_path" className={inputClasses()} placeholder="receipts/VULT-TRANSACTION-REFERENCE" />
            </label>
            <label className="mt-4 block text-sm font-bold">Confirmation notes
              <textarea name="notes" className={inputClasses()} rows={3} minLength={8} placeholder="Confirmed in the Vult system and visible on the winner account." required />
            </label>
            <button className="mt-4 rounded-xl bg-green-700 px-5 py-3 text-sm font-black text-white">
              Record confirmed Vult credit
            </button>
          </form>
        ) : null}

        {canCancel ? (
          <form action={cancelPrizePaymentAction} className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="text-lg font-black text-red-900">Cancel unpaid settlement</h2>
            <p className="mt-2 text-sm text-red-800">Use only before a Vult account has been credited.</p>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <label className="mt-5 block text-sm font-bold text-red-900">Cancellation reason
              <textarea name="reason" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <button className="mt-4 rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white">Cancel settlement</button>
          </form>
        ) : null}

        {payment.status === "cancelled" && canSuperAdmin ? (
          <form action={reopenPrizePaymentAction} className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h2 className="text-lg font-black text-amber-950">Reopen cancelled settlement</h2>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <label className="mt-5 block text-sm font-bold text-amber-950">Reopen reason
              <textarea name="reason" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <button className="mt-4 rounded-xl bg-amber-700 px-4 py-3 text-sm font-black text-white">Reopen settlement</button>
          </form>
        ) : null}

        {payment.status === "paid" && payment.prize_type !== "non_cash" && canFinance ? (
          <form action={reconcilePrizePaymentAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-[var(--brand-strong)]">Reconcile recorded Vult transaction</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Compare this record with the Vult transaction report or finance statement.</p>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">Result
                <select name="status" className={inputClasses()} defaultValue="matched">
                  <option value="matched">Matched</option>
                  <option value="mismatch">Mismatch</option>
                  <option value="resolved">Resolved mismatch</option>
                </select>
              </label>
              <label className="text-sm font-bold">Vult reference
                <input name="external_reference" defaultValue={payment.transaction_reference ?? ""} className={inputClasses()} />
              </label>
              <label className="text-sm font-bold">Matched amount
                <input type="number" name="matched_amount" step="0.01" min="0" defaultValue={payment.amount} className={inputClasses()} />
              </label>
              <label className="text-sm font-bold">Currency
                <input name="matched_currency" defaultValue={payment.currency} className={inputClasses()} />
              </label>
              <label className="text-sm font-bold">Statement date
                <input type="date" name="statement_date" className={inputClasses()} />
              </label>
            </div>
            <label className="mt-4 block text-sm font-bold">Reconciliation notes
              <textarea name="notes" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <button className="mt-4 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white">Record reconciliation</button>
          </form>
        ) : null}
      </section>

      {canEvidence ? (
        <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Add supporting evidence reference</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Evidence is an immutable reference to a receipt, Vult report, finance document or approval record.</p>
          <form action={addPaymentEvidenceAction} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <label className="text-sm font-bold">Evidence type
              <select name="evidence_type" className={inputClasses()} defaultValue="payment_receipt">
                <option value="destination_verification">Destination verification</option>
                <option value="finance_approval">Finance approval</option>
                <option value="payment_receipt">Vult payment receipt</option>
                <option value="reconciliation">Reconciliation</option>
                <option value="non_cash_fulfilment">Non-cash fulfilment</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-sm font-bold">Storage path
              <input name="storage_path" className={inputClasses()} placeholder="receipts/..." />
            </label>
            <label className="text-sm font-bold">External URL
              <input type="url" name="external_url" className={inputClasses()} placeholder="https://..." />
            </label>
            <label className="text-sm font-bold">File name
              <input name="file_name" className={inputClasses()} />
            </label>
            <label className="text-sm font-bold md:col-span-2">Notes
              <input name="notes" className={inputClasses()} />
            </label>
            <button className="w-fit rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white">Save evidence reference</button>
          </form>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Recorded Vult transactions</h2>
          <div className="mt-5 space-y-3">
            {attempts.length ? attempts.map((attempt) => (
              <div key={attempt.id} className="rounded-2xl border border-[var(--border)] p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black">Record #{attempt.attempt_number} · <span className="capitalize">{label(attempt.processor)}</span></p>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${statusClasses(attempt.status)}`}>{label(attempt.status)}</span>
                </div>
                <p className="mt-3"><span className="text-[var(--muted)]">Transaction:</span> <span className="font-bold">{attempt.transaction_reference ?? "Not recorded"}</span></p>
                <p className="mt-1"><span className="text-[var(--muted)]">Destination:</span> <span className="font-bold">{attempt.destination_reference ?? "Not required"}</span></p>
                <p className="mt-1"><span className="text-[var(--muted)]">Credited:</span> <span className="font-bold">{formatDate(attempt.completed_at)}</span></p>
                {attempt.notes ? <p className="mt-2 text-[var(--muted)]">{attempt.notes}</p> : null}
              </div>
            )) : <p className="text-sm text-[var(--muted)]">No Vult transaction has been recorded.</p>}
          </div>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Evidence</h2>
          <div className="mt-5 space-y-3">
            {evidence.length ? evidence.map((item) => {
              const url = externalUrl(item.external_url);
              return (
                <div key={item.id} className="rounded-2xl border border-[var(--border)] p-4 text-sm">
                  <p className="font-black capitalize">{label(item.evidence_type)}</p>
                  <p className="mt-2 text-[var(--muted)]">{item.file_name ?? item.storage_path ?? item.external_url ?? "Evidence reference"}</p>
                  {url ? <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-flex font-black text-[var(--brand)] hover:underline">Open evidence</a> : null}
                  {item.notes ? <p className="mt-2 text-[var(--muted)]">{item.notes}</p> : null}
                  <p className="mt-2 text-xs text-[var(--muted)]">{formatDate(item.created_at)}</p>
                </div>
              );
            }) : <p className="text-sm text-[var(--muted)]">No evidence references recorded.</p>}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Reconciliation history</h2>
          <div className="mt-5 space-y-3">
            {reconciliations.length ? reconciliations.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[var(--border)] p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black capitalize">{label(item.status)}</p>
                  <p className="text-xs text-[var(--muted)]">{formatDate(item.created_at)}</p>
                </div>
                <p className="mt-2">{item.external_reference ?? "No external reference"}</p>
                {item.matched_amount != null ? <p className="mt-1 font-bold">{formatMoney(item.matched_amount, item.matched_currency ?? payment.currency)}</p> : null}
                <p className="mt-2 text-[var(--muted)]">{item.notes}</p>
              </div>
            )) : <p className="text-sm text-[var(--muted)]">No reconciliation reviews recorded.</p>}
          </div>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">External correction records</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">This platform does not perform reimbursements. Any row below only documents a correction already confirmed by Vult operations.</p>
          <div className="mt-5 space-y-3">
            {reversals.length ? reversals.map((item) => (
              <div key={item.id} className="rounded-2xl border border-[var(--border)] p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black capitalize">{label(item.status)}</p>
                  <p className="text-xs text-[var(--muted)]">{formatDate(item.created_at)}</p>
                </div>
                <p className="mt-2 text-[var(--muted)]">{item.reason}</p>
                {item.transaction_reference ? <p className="mt-2 font-bold">Reference: {item.transaction_reference}</p> : null}
              </div>
            )) : <p className="text-sm text-[var(--muted)]">No external correction records.</p>}
          </div>
        </article>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black text-[var(--brand-strong)]">Immutable settlement timeline</h2>
        <div className="mt-5 space-y-3">
          {history.length ? history.map((item) => (
            <div key={item.id} className="grid gap-3 rounded-2xl border border-[var(--border)] p-4 text-sm md:grid-cols-[170px_1fr]">
              <div>
                <p className="font-bold">{formatDate(item.created_at)}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-[0.1em] text-[var(--brand)]">{label(item.action)}</p>
              </div>
              <div>
                <p className="font-black capitalize text-[var(--brand-strong)]">{item.from_status ? `${label(item.from_status)} → ` : ""}{label(item.to_status)}</p>
                {item.notes ? <p className="mt-1 text-[var(--muted)]">{item.notes}</p> : null}
              </div>
            </div>
          )) : <p className="text-sm text-[var(--muted)]">No timeline records found.</p>}
        </div>
      </section>
    </div>
  );
}
