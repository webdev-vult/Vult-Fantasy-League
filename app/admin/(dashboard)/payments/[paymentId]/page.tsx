import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  addPaymentEvidenceAction,
  cancelPrizePaymentAction,
  completePaymentAttemptAction,
  completePaymentReversalAction,
  financeReviewPaymentAction,
  reconcilePrizePaymentAction,
  reopenPrizePaymentAction,
  requestPaymentReversalAction,
  reviewPaymentDestinationAction,
  reviewPaymentReversalAction,
  startPaymentAttemptAction,
  startPaymentReversalAction,
} from "../actions";

type Params = Promise<{ paymentId: string }>;
type SearchParams = Promise<{ success?: string; error?: string }>;
type Snapshot = Record<string, unknown>;

type Payment = {
  id: string;
  award_reference: string;
  competition_season_id: string;
  winner_candidate_id: string;
  participant_id: string;
  prize_id: string;
  amount: number;
  currency: string;
  status: string;
  prize_type: string;
  payment_method: string;
  non_cash_description: string | null;
  destination_reference: string | null;
  destination_status: string;
  destination_verified_by: string | null;
  destination_verified_at: string | null;
  destination_verification_notes: string | null;
  finance_review_status: string;
  finance_reviewed_by: string | null;
  finance_reviewed_at: string | null;
  finance_review_notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  current_attempt_id: string | null;
  attempt_count: number;
  processing_started_at: string | null;
  transaction_reference: string | null;
  evidence_path: string | null;
  paid_by: string | null;
  paid_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  reversal_status: string;
  reconciliation_status: string;
  payment_deadline_at: string | null;
  prize_snapshot: unknown;
  winner_snapshot: unknown;
  destination_snapshot: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Attempt = {
  id: string;
  attempt_number: number;
  processor: string;
  status: string;
  amount: number;
  currency: string;
  idempotency_key: string;
  destination_reference: string | null;
  transaction_reference: string | null;
  evidence_path: string | null;
  failure_code: string | null;
  failure_reason: string | null;
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
  actor_user_id: string | null;
  notes: string | null;
  created_at: string;
};

type Evidence = {
  id: string;
  attempt_id: string | null;
  evidence_type: string;
  storage_path: string | null;
  external_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  notes: string | null;
  uploaded_by: string;
  created_at: string;
};

type Reversal = {
  id: string;
  status: string;
  reason: string;
  requested_by: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  transaction_reference: string | null;
  evidence_path: string | null;
  completed_by: string | null;
  completed_at: string | null;
  failure_reason: string | null;
};

type Reconciliation = {
  id: string;
  status: string;
  external_reference: string | null;
  matched_amount: number | null;
  matched_currency: string | null;
  statement_date: string | null;
  notes: string;
  reviewed_by: string;
  created_at: string;
};

type AdminActor = { id: string; full_name: string; role: string };

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
  if (["paid", "matched", "resolved", "approved", "verified", "succeeded"].includes(status)) {
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
      "initiated",
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

function inputClasses() {
  return "mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm";
}

function safeExternalUrl(value: string | null) {
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

  const [seasonResult, candidateResult, participantResult, attemptsResult, historyResult, evidenceResult, reversalsResult, reconciliationsResult] =
    await Promise.all([
      db
        .from("competition_seasons")
        .select("id, name, status")
        .eq("id", payment.competition_season_id)
        .maybeSingle(),
      db
        .from("winner_candidates")
        .select("id, display_name_snapshot, team_name_snapshot, provider_entry_id_snapshot, status, scope, score, confirmed_at")
        .eq("id", payment.winner_candidate_id)
        .maybeSingle(),
      db
        .from("participants")
        .select("id, full_name, email, phone, whatsapp_phone, country, city, vult_customer_ref, status")
        .eq("id", payment.participant_id)
        .maybeSingle(),
      db
        .from("prize_payment_attempts")
        .select("id, attempt_number, processor, status, amount, currency, idempotency_key, destination_reference, transaction_reference, evidence_path, failure_code, failure_reason, requested_by, started_at, completed_at, notes")
        .eq("payment_id", payment.id)
        .order("attempt_number", { ascending: false }),
      db
        .from("prize_payment_status_history")
        .select("id, from_status, to_status, action, actor_user_id, notes, created_at")
        .eq("payment_id", payment.id)
        .order("created_at", { ascending: false }),
      db
        .from("prize_payment_evidence")
        .select("id, attempt_id, evidence_type, storage_path, external_url, file_name, mime_type, size_bytes, notes, uploaded_by, created_at")
        .eq("payment_id", payment.id)
        .order("created_at", { ascending: false }),
      db
        .from("prize_payment_reversals")
        .select("id, status, reason, requested_by, requested_at, reviewed_by, reviewed_at, review_notes, transaction_reference, evidence_path, completed_by, completed_at, failure_reason")
        .eq("payment_id", payment.id)
        .order("created_at", { ascending: false }),
      db
        .from("prize_payment_reconciliations")
        .select("id, status, external_reference, matched_amount, matched_currency, statement_date, notes, reviewed_by, created_at")
        .eq("payment_id", payment.id)
        .order("created_at", { ascending: false }),
    ]);

  const attempts = (attemptsResult.data ?? []) as Attempt[];
  const history = (historyResult.data ?? []) as History[];
  const evidence = (evidenceResult.data ?? []) as Evidence[];
  const reversals = (reversalsResult.data ?? []) as Reversal[];
  const reconciliations = (reconciliationsResult.data ?? []) as Reconciliation[];
  const candidate = candidateResult.data as Record<string, unknown> | null;
  const participant = participantResult.data as Record<string, unknown> | null;
  const season = seasonResult.data as Record<string, unknown> | null;

  const actorIds = Array.from(
    new Set(
      [
        payment.destination_verified_by,
        payment.finance_reviewed_by,
        payment.approved_by,
        payment.paid_by,
        payment.cancelled_by,
        ...attempts.map((item) => item.requested_by),
        ...history.map((item) => item.actor_user_id),
        ...evidence.map((item) => item.uploaded_by),
        ...reversals.flatMap((item) => [item.requested_by, item.reviewed_by, item.completed_by]),
        ...reconciliations.map((item) => item.reviewed_by),
      ].filter(Boolean) as string[],
    ),
  );

  const { data: actorRows } = actorIds.length
    ? await db.from("admin_profiles").select("id, full_name, role").in("id", actorIds)
    : { data: [] };
  const actorMap = new Map<string, AdminActor>(
    ((actorRows ?? []) as AdminActor[]).map((actor) => [actor.id, actor]),
  );

  const winner = object(payment.winner_snapshot);
  const prize = object(payment.prize_snapshot);
  const activeAttempt = attempts.find((attempt) => attempt.id === payment.current_attempt_id);
  const activeReversal = reversals.find((reversal) =>
    ["requested", "approved", "processing"].includes(reversal.status),
  );
  const canFinance = ["super_admin", "finance_officer"].includes(admin.role);
  const canDestination = ["super_admin", "compliance_officer"].includes(admin.role);
  const canEvidence = ["super_admin", "finance_officer", "compliance_officer"].includes(admin.role);
  const canSuperAdmin = admin.role === "super_admin";
  const overdue =
    payment.payment_deadline_at &&
    new Date(payment.payment_deadline_at).getTime() < Date.now() &&
    !["paid", "cancelled", "reversed"].includes(payment.status);
  const nextIdempotencyKey = `${payment.award_reference.toLowerCase()}-attempt-${payment.attempt_count + 1}`;

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
            Settlement workspace
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            {stringValue(winner.display_name, stringValue(candidate?.display_name_snapshot, "Winner"))}
          </h1>
          <p className="mt-3 text-[var(--muted)]">
            {payment.award_reference} · {stringValue(prize.name, "Prize settlement")} · {stringValue(season?.name, "Competition season")}
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
          ["Destination", label(payment.destination_status)],
          ["Finance review", label(payment.finance_review_status)],
          ["Attempts", String(payment.attempt_count)],
        ].map(([title, value]) => (
          <article key={title} className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">{title}</p>
            <p className="mt-3 text-xl font-black capitalize text-[var(--brand-strong)]">{value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Winner snapshot</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div><dt className="text-[var(--muted)]">Name</dt><dd className="font-bold">{stringValue(winner.display_name, stringValue(participant?.full_name))}</dd></div>
            <div><dt className="text-[var(--muted)]">Team</dt><dd className="font-bold">{stringValue(winner.team_name, stringValue(candidate?.team_name_snapshot))}</dd></div>
            <div><dt className="text-[var(--muted)]">FPL Entry</dt><dd className="font-bold">{stringValue(winner.provider_entry_id, stringValue(candidate?.provider_entry_id_snapshot))}</dd></div>
            <div><dt className="text-[var(--muted)]">Phone</dt><dd className="font-bold">{stringValue(participant?.phone)}</dd></div>
            <div><dt className="text-[var(--muted)]">Email</dt><dd className="font-bold">{stringValue(participant?.email)}</dd></div>
            <div><dt className="text-[var(--muted)]">Participant status</dt><dd className="font-bold capitalize">{label(stringValue(participant?.status, "unknown"))}</dd></div>
          </dl>
          <Link
            href={`/admin/winners/${payment.winner_candidate_id}`}
            className="mt-5 inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-black text-[var(--brand)]"
          >
            Open winner evidence
          </Link>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Prize snapshot</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div><dt className="text-[var(--muted)]">Prize</dt><dd className="font-bold">{stringValue(prize.name)}</dd></div>
            <div><dt className="text-[var(--muted)]">Type</dt><dd className="font-bold capitalize">{label(payment.prize_type)}</dd></div>
            <div><dt className="text-[var(--muted)]">Method</dt><dd className="font-bold capitalize">{label(payment.payment_method)}</dd></div>
            <div><dt className="text-[var(--muted)]">Deadline</dt><dd className={overdue ? "font-black text-red-700" : "font-bold"}>{formatDate(payment.payment_deadline_at)}</dd></div>
            <div><dt className="text-[var(--muted)]">Confirmed</dt><dd className="font-bold">{formatDate(stringValue(winner.confirmed_at, "") || null)}</dd></div>
            {payment.non_cash_description ? <div><dt className="text-[var(--muted)]">Non-cash fulfilment</dt><dd className="font-bold">{payment.non_cash_description}</dd></div> : null}
          </dl>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Settlement controls</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div><dt className="text-[var(--muted)]">Destination reference</dt><dd className="font-bold">{payment.destination_reference ?? "Not required or not verified"}</dd></div>
            <div><dt className="text-[var(--muted)]">Transaction reference</dt><dd className="font-bold">{payment.transaction_reference ?? "Not paid"}</dd></div>
            <div><dt className="text-[var(--muted)]">Paid at</dt><dd className="font-bold">{formatDate(payment.paid_at)}</dd></div>
            <div><dt className="text-[var(--muted)]">Reversal</dt><dd className="font-bold capitalize">{label(payment.reversal_status)}</dd></div>
            <div><dt className="text-[var(--muted)]">Last updated</dt><dd className="font-bold">{formatDate(payment.updated_at)}</dd></div>
          </dl>
          {payment.failure_reason ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-black">{payment.failure_code ?? "Payment failure"}</p>
              <p className="mt-1">{payment.failure_reason}</p>
            </div>
          ) : null}
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {payment.status === "destination_pending" && canDestination ? (
          <form action={reviewPaymentDestinationAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-[var(--brand-strong)]">Compliance destination review</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Approve only when the reference exactly matches the verified participant Vult account.</p>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <label className="mt-5 block text-sm font-bold">Destination reference
              <input name="destination_reference" defaultValue={payment.destination_reference ?? ""} className={inputClasses()} required />
            </label>
            <label className="mt-4 block text-sm font-bold">Review notes
              <textarea name="notes" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <div className="mt-4 flex gap-3">
              <button name="decision" value="approve" className="rounded-xl bg-green-700 px-4 py-3 text-sm font-black text-white">Verify destination</button>
              <button name="decision" value="reject" className="rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white">Reject destination</button>
            </div>
          </form>
        ) : null}

        {payment.status === "finance_review" && canFinance ? (
          <form action={financeReviewPaymentAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-[var(--brand-strong)]">Finance approval</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Confirm prize snapshot, amount, currency, deadline and verified destination before approval.</p>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <label className="mt-5 block text-sm font-bold">Finance notes
              <textarea name="notes" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <div className="mt-4 flex gap-3">
              <button name="decision" value="approve" className="rounded-xl bg-green-700 px-4 py-3 text-sm font-black text-white">Approve settlement</button>
              <button name="decision" value="reject" className="rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white">Reject and cancel</button>
            </div>
          </form>
        ) : null}

        {["approved", "failed", "reversed"].includes(payment.status) && canFinance ? (
          <form action={startPaymentAttemptAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-[var(--brand-strong)]">Start payment or fulfilment attempt</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Phase 10 records controlled attempts. It does not call an external payout API.</p>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">Processor
                <select name="processor" className={inputClasses()} defaultValue="manual">
                  <option value="manual">Manual</option>
                  <option value="import">Imported record</option>
                  <option value="vult_api">Vult API — future connector</option>
                </select>
              </label>
              <label className="text-sm font-bold">Idempotency key
                <input name="idempotency_key" defaultValue={nextIdempotencyKey} className={inputClasses()} minLength={8} required />
              </label>
            </div>
            <label className="mt-4 block text-sm font-bold">Attempt notes
              <textarea name="notes" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <button className="mt-4 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white">Start controlled attempt</button>
          </form>
        ) : null}

        {payment.status === "processing" && activeAttempt && canFinance ? (
          <form action={completePaymentAttemptAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-[var(--brand-strong)]">Complete attempt #{activeAttempt.attempt_number}</h2>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="attempt_id" value={activeAttempt.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">Transaction / fulfilment reference
                <input name="transaction_reference" className={inputClasses()} />
              </label>
              <label className="text-sm font-bold">Evidence storage path
                <input name="evidence_path" className={inputClasses()} placeholder="receipts/..." />
              </label>
              <label className="text-sm font-bold">Failure code
                <input name="failure_code" className={inputClasses()} />
              </label>
              <label className="text-sm font-bold">Failure reason
                <input name="failure_reason" className={inputClasses()} />
              </label>
            </div>
            <label className="mt-4 block text-sm font-bold">Completion notes
              <textarea name="notes" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <div className="mt-4 flex gap-3">
              <button name="outcome" value="succeeded" className="rounded-xl bg-green-700 px-4 py-3 text-sm font-black text-white">Record success</button>
              <button name="outcome" value="failed" className="rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white">Record failure</button>
            </div>
          </form>
        ) : null}

        {payment.status === "paid" && canFinance && !activeReversal ? (
          <form action={requestPaymentReversalAction} className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="text-lg font-black text-red-900">Request payment reversal</h2>
            <p className="mt-2 text-sm text-red-800">A Super Admin must independently approve the reversal before finance can process it.</p>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <label className="mt-5 block text-sm font-bold text-red-900">Reversal reason
              <textarea name="reason" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <button className="mt-4 rounded-xl bg-red-800 px-4 py-3 text-sm font-black text-white">Submit reversal request</button>
          </form>
        ) : null}

        {activeReversal?.status === "requested" && canSuperAdmin ? (
          <form action={reviewPaymentReversalAction} className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h2 className="text-lg font-black text-amber-950">Super Admin reversal review</h2>
            <p className="mt-2 text-sm text-amber-900">Requested reason: {activeReversal.reason}</p>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="reversal_id" value={activeReversal.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <label className="mt-5 block text-sm font-bold text-amber-950">Review notes
              <textarea name="notes" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <div className="mt-4 flex gap-3">
              <button name="decision" value="approve" className="rounded-xl bg-green-700 px-4 py-3 text-sm font-black text-white">Approve reversal</button>
              <button name="decision" value="reject" className="rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white">Reject reversal</button>
            </div>
          </form>
        ) : null}

        {activeReversal?.status === "approved" && canFinance ? (
          <form action={startPaymentReversalAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-[var(--brand-strong)]">Start approved reversal</h2>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="reversal_id" value={activeReversal.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <label className="mt-5 block text-sm font-bold">Processing notes
              <textarea name="notes" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <button className="mt-4 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white">Start reversal processing</button>
          </form>
        ) : null}

        {activeReversal?.status === "processing" && canFinance ? (
          <form action={completePaymentReversalAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-[var(--brand-strong)]">Complete reversal</h2>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="reversal_id" value={activeReversal.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">Reversal transaction reference
                <input name="transaction_reference" className={inputClasses()} />
              </label>
              <label className="text-sm font-bold">Evidence path
                <input name="evidence_path" className={inputClasses()} />
              </label>
            </div>
            <label className="mt-4 block text-sm font-bold">Failure reason, when failed
              <input name="failure_reason" className={inputClasses()} />
            </label>
            <label className="mt-4 block text-sm font-bold">Completion notes
              <textarea name="notes" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <div className="mt-4 flex gap-3">
              <button name="outcome" value="completed" className="rounded-xl bg-green-700 px-4 py-3 text-sm font-black text-white">Record completed reversal</button>
              <button name="outcome" value="failed" className="rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white">Record reversal failure</button>
            </div>
          </form>
        ) : null}

        {["paid", "reversed"].includes(payment.status) && payment.reconciliation_status !== "not_required" && canFinance ? (
          <form action={reconcilePrizePaymentAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-[var(--brand-strong)]">Reconciliation review</h2>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">Status
                <select name="status" className={inputClasses()} defaultValue="matched">
                  <option value="matched">Matched</option>
                  <option value="mismatch">Mismatch</option>
                  <option value="resolved">Resolved</option>
                </select>
              </label>
              <label className="text-sm font-bold">Statement date
                <input type="date" name="statement_date" className={inputClasses()} />
              </label>
              <label className="text-sm font-bold">External reference
                <input name="external_reference" className={inputClasses()} />
              </label>
              <label className="text-sm font-bold">Matched amount
                <input type="number" step="0.01" min="0" name="matched_amount" defaultValue={payment.amount} className={inputClasses()} />
              </label>
              <label className="text-sm font-bold">Matched currency
                <input name="matched_currency" defaultValue={payment.currency} className={inputClasses()} />
              </label>
            </div>
            <label className="mt-4 block text-sm font-bold">Reconciliation notes
              <textarea name="notes" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <button className="mt-4 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white">Record reconciliation</button>
          </form>
        ) : null}

        {canEvidence ? (
          <form action={addPaymentEvidenceAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-[var(--brand-strong)]">Add immutable evidence reference</h2>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">Evidence type
                <select name="evidence_type" className={inputClasses()} defaultValue="other">
                  <option value="destination_verification">Destination verification</option>
                  <option value="finance_approval">Finance approval</option>
                  <option value="payment_receipt">Payment receipt</option>
                  <option value="payment_failure">Payment failure</option>
                  <option value="reversal">Reversal</option>
                  <option value="reconciliation">Reconciliation</option>
                  <option value="non_cash_fulfilment">Non-cash fulfilment</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="text-sm font-bold">Related attempt
                <select name="attempt_id" className={inputClasses()} defaultValue="">
                  <option value="">No attempt</option>
                  {attempts.map((attempt) => <option key={attempt.id} value={attempt.id}>Attempt #{attempt.attempt_number} · {label(attempt.status)}</option>)}
                </select>
              </label>
              <label className="text-sm font-bold">Storage path
                <input name="storage_path" className={inputClasses()} placeholder="payment-evidence/..." />
              </label>
              <label className="text-sm font-bold">External HTTPS URL
                <input type="url" name="external_url" className={inputClasses()} />
              </label>
              <label className="text-sm font-bold">File name
                <input name="file_name" className={inputClasses()} />
              </label>
              <label className="text-sm font-bold">MIME type
                <input name="mime_type" className={inputClasses()} placeholder="application/pdf" />
              </label>
              <label className="text-sm font-bold">Size in bytes
                <input type="number" min="0" name="size_bytes" className={inputClasses()} />
              </label>
            </div>
            <label className="mt-4 block text-sm font-bold">Evidence notes
              <textarea name="notes" className={inputClasses()} rows={3} />
            </label>
            <button className="mt-4 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white">Record evidence</button>
          </form>
        ) : null}

        {canFinance && ["destination_pending", "finance_review", "approved", "failed"].includes(payment.status) ? (
          <form action={cancelPrizePaymentAction} className="rounded-3xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="text-lg font-black text-red-900">Cancel settlement</h2>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <label className="mt-5 block text-sm font-bold text-red-900">Cancellation reason
              <textarea name="reason" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <button className="mt-4 rounded-xl bg-red-800 px-4 py-3 text-sm font-black text-white">Cancel settlement</button>
          </form>
        ) : null}

        {canSuperAdmin && payment.status === "cancelled" ? (
          <form action={reopenPrizePaymentAction} className="rounded-3xl border border-green-200 bg-green-50 p-6 shadow-sm">
            <h2 className="text-lg font-black text-green-900">Reopen cancelled settlement</h2>
            <input type="hidden" name="payment_id" value={payment.id} />
            <input type="hidden" name="competition_season_id" value={payment.competition_season_id} />
            <label className="mt-5 block text-sm font-bold text-green-900">Reopen reason
              <textarea name="reason" className={inputClasses()} rows={3} minLength={8} required />
            </label>
            <button className="mt-4 rounded-xl bg-green-800 px-4 py-3 text-sm font-black text-white">Reopen settlement</button>
          </form>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
          <div className="border-b border-[var(--border)] px-6 py-5">
            <h2 className="text-xl font-black text-[var(--brand-strong)]">Payment attempts</h2>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {attempts.length ? attempts.map((attempt) => (
              <div key={attempt.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black text-[var(--brand-strong)]">Attempt #{attempt.attempt_number} · {label(attempt.processor)}</p>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${statusClasses(attempt.status)}`}>{label(attempt.status)}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">Started {formatDate(attempt.started_at)} by {actorMap.get(attempt.requested_by)?.full_name ?? "Unknown admin"}</p>
                {attempt.transaction_reference ? <p className="mt-2 text-sm">Transaction: <strong>{attempt.transaction_reference}</strong></p> : null}
                {attempt.failure_reason ? <p className="mt-2 text-sm text-red-700">{attempt.failure_code ? `${attempt.failure_code}: ` : ""}{attempt.failure_reason}</p> : null}
                {attempt.notes ? <p className="mt-2 text-sm text-[var(--muted)]">{attempt.notes}</p> : null}
              </div>
            )) : <div className="p-6 text-sm text-[var(--muted)]">No payment attempts have been recorded.</div>}
          </div>
        </article>

        <article className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
          <div className="border-b border-[var(--border)] px-6 py-5">
            <h2 className="text-xl font-black text-[var(--brand-strong)]">Evidence</h2>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {evidence.length ? evidence.map((item) => {
              const url = safeExternalUrl(item.external_url);
              return (
                <div key={item.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-black capitalize text-[var(--brand-strong)]">{label(item.evidence_type)}</p>
                    <span className="text-xs text-[var(--muted)]">{formatDate(item.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">Added by {actorMap.get(item.uploaded_by)?.full_name ?? "Unknown admin"}</p>
                  {item.storage_path ? <p className="mt-2 break-all text-sm">Storage: {item.storage_path}</p> : null}
                  {url ? <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-black text-[var(--brand)] hover:underline">Open external evidence</a> : null}
                  {item.notes ? <p className="mt-2 text-sm text-[var(--muted)]">{item.notes}</p> : null}
                </div>
              );
            }) : <div className="p-6 text-sm text-[var(--muted)]">No evidence references have been recorded.</div>}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
          <div className="border-b border-[var(--border)] px-6 py-5"><h2 className="text-xl font-black text-[var(--brand-strong)]">Reversals</h2></div>
          <div className="divide-y divide-[var(--border)]">
            {reversals.length ? reversals.map((reversal) => (
              <div key={reversal.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black text-[var(--brand-strong)]">Requested {formatDate(reversal.requested_at)}</p>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${statusClasses(reversal.status)}`}>{label(reversal.status)}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">{reversal.reason}</p>
                {reversal.review_notes ? <p className="mt-2 text-sm">Review: {reversal.review_notes}</p> : null}
                {reversal.transaction_reference ? <p className="mt-2 text-sm">Reversal transaction: <strong>{reversal.transaction_reference}</strong></p> : null}
                {reversal.failure_reason ? <p className="mt-2 text-sm text-red-700">{reversal.failure_reason}</p> : null}
              </div>
            )) : <div className="p-6 text-sm text-[var(--muted)]">No reversal has been requested.</div>}
          </div>
        </article>

        <article className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
          <div className="border-b border-[var(--border)] px-6 py-5"><h2 className="text-xl font-black text-[var(--brand-strong)]">Reconciliation history</h2></div>
          <div className="divide-y divide-[var(--border)]">
            {reconciliations.length ? reconciliations.map((item) => (
              <div key={item.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black text-[var(--brand-strong)]">{item.external_reference ?? "Reconciliation review"}</p>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${statusClasses(item.status)}`}>{label(item.status)}</span>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">Reviewed {formatDate(item.created_at)} by {actorMap.get(item.reviewed_by)?.full_name ?? "Unknown admin"}</p>
                {item.matched_amount !== null && item.matched_currency ? <p className="mt-2 text-sm">Matched: {formatMoney(Number(item.matched_amount), item.matched_currency)}</p> : null}
                <p className="mt-2 text-sm text-[var(--muted)]">{item.notes}</p>
              </div>
            )) : <div className="p-6 text-sm text-[var(--muted)]">No reconciliation review has been recorded.</div>}
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <h2 className="text-xl font-black text-[var(--brand-strong)]">Immutable settlement history</h2>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {history.map((item) => (
            <div key={item.id} className="grid gap-3 p-5 md:grid-cols-[180px_1fr_220px]">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{label(item.action)}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(item.created_at)}</p>
              </div>
              <div>
                <p className="font-black capitalize text-[var(--brand-strong)]">{item.from_status ? `${label(item.from_status)} → ` : ""}{label(item.to_status)}</p>
                {item.notes ? <p className="mt-1 text-sm text-[var(--muted)]">{item.notes}</p> : null}
              </div>
              <div className="text-sm">
                <p className="font-bold">{item.actor_user_id ? actorMap.get(item.actor_user_id)?.full_name ?? "Unknown admin" : "System"}</p>
                <p className="mt-1 text-xs capitalize text-[var(--muted)]">{item.actor_user_id ? label(actorMap.get(item.actor_user_id)?.role ?? "unknown role") : "Automated record"}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
