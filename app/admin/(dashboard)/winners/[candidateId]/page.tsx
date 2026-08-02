import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  competitionReviewWinnerAction,
  complianceReviewWinnerAction,
  confirmWinnerAction,
  replaceWinnerCandidateAction,
} from "../actions";

type Params = Promise<{ candidateId: string }>;
type SearchParams = Promise<{ success?: string; error?: string }>;

type Candidate = {
  id: string;
  competition_season_id: string;
  registration_id: string;
  prize_id: string | null;
  round_id: string | null;
  monthly_period_id: string | null;
  generation_run_id: string | null;
  scope: string | null;
  source_round_score_id: string | null;
  source_monthly_score_id: string | null;
  source_season_score_id: string | null;
  score: number;
  rank: number;
  candidate_order: number | null;
  prize_position: number | null;
  status: string;
  rules_version: number;
  eligibility_status: string;
  eligibility_summary: unknown;
  tie_break_values: unknown;
  competition_review_status: string;
  competition_reviewed_by: string | null;
  competition_reviewed_at: string | null;
  competition_review_notes: string | null;
  compliance_review_status: string;
  compliance_reviewed_by: string | null;
  compliance_reviewed_at: string | null;
  compliance_review_notes: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  publicity_consent: boolean;
  publication_ready: boolean;
  publication_readiness_note: string | null;
  replacement_for_candidate_id: string | null;
  replaced_by_candidate_id: string | null;
  rejection_reason: string | null;
  is_current: boolean;
  display_name_snapshot: string | null;
  team_name_snapshot: string | null;
  provider_entry_id_snapshot: string | null;
  prize_snapshot: unknown;
  generated_at: string;
  review_notes: string | null;
};

type Check = {
  id: number;
  check_code: string;
  check_status: string;
  is_required: boolean;
  summary: string;
  details: unknown;
  evaluated_at: string;
};

type History = {
  id: number;
  from_status: string | null;
  to_status: string;
  action: string;
  actor_user_id: string | null;
  notes: string | null;
  metadata: unknown;
  created_at: string;
};

type Evaluation = {
  id: string;
  registration_id: string;
  source_rank: number;
  score: number;
  provider_total_points: number;
  transfer_cost: number;
  gameweeks_counted: number;
  weekly_eligible: boolean;
  provider_entry_id: string | null;
  display_name: string;
  team_name: string | null;
  eligibility_status: string;
  checks: unknown;
  tie_break_values: unknown;
  selection_order: number | null;
  selected_candidate_id: string | null;
  evaluated_at: string;
};

function label(value: string | null) {
  return (value ?? "not set").replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function statusClasses(status: string) {
  if (["pass", "eligible", "approved", "confirmed", "compliance_approved"].includes(status)) {
    return "border-green-200 bg-green-50 text-green-800";
  }
  if (
    [
      "review",
      "review_required",
      "pending",
      "provisional",
      "under_review",
      "competition_approved",
      "not_applicable",
    ].includes(status)
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (["fail", "ineligible", "rejected", "superseded"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function compactJson(value: unknown) {
  const record = asRecord(value);
  const entries = Object.entries(record);
  if (!entries.length) return "No additional evidence";
  return entries
    .map(([key, item]) => `${label(key)}: ${Array.isArray(item) ? item.join(", ") : String(item ?? "—")}`)
    .join(" · ");
}

export default async function WinnerCandidatePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const admin = await requireAdmin();
  const { candidateId } = await params;
  const messages = await searchParams;
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;

  const { data: candidateRow, error: candidateError } = await db
    .from("winner_candidates")
    .select(
      "id, competition_season_id, registration_id, prize_id, round_id, monthly_period_id, generation_run_id, scope, source_round_score_id, source_monthly_score_id, source_season_score_id, score, rank, candidate_order, prize_position, status, rules_version, eligibility_status, eligibility_summary, tie_break_values, competition_review_status, competition_reviewed_by, competition_reviewed_at, competition_review_notes, compliance_review_status, compliance_reviewed_by, compliance_reviewed_at, compliance_review_notes, confirmed_by, confirmed_at, publicity_consent, publication_ready, publication_readiness_note, replacement_for_candidate_id, replaced_by_candidate_id, rejection_reason, is_current, display_name_snapshot, team_name_snapshot, provider_entry_id_snapshot, prize_snapshot, generated_at, review_notes",
    )
    .eq("id", candidateId)
    .maybeSingle();

  if (candidateError || !candidateRow) notFound();
  const candidate = candidateRow as Candidate;

  const [
    seasonResult,
    prizeResult,
    roundResult,
    periodResult,
    checksResult,
    historyResult,
    runResult,
    registrationResult,
  ] = await Promise.all([
    db
      .from("competition_seasons")
      .select("id, name, status")
      .eq("id", candidate.competition_season_id)
      .maybeSingle(),
    candidate.prize_id
      ? db
          .from("prizes")
          .select("id, code, name, frequency, position, amount, currency, prize_type, payment_method")
          .eq("id", candidate.prize_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    candidate.round_id
      ? db
          .from("rounds")
          .select("id, external_round_id, name, status, is_final")
          .eq("id", candidate.round_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    candidate.monthly_period_id
      ? db
          .from("monthly_periods")
          .select("id, name, start_round, end_round, status")
          .eq("id", candidate.monthly_period_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from("winner_candidate_checks")
      .select("id, check_code, check_status, is_required, summary, details, evaluated_at")
      .eq("candidate_id", candidate.id)
      .order("id"),
    db
      .from("winner_candidate_status_history")
      .select("id, from_status, to_status, action, actor_user_id, notes, metadata, created_at")
      .eq("candidate_id", candidate.id)
      .order("created_at", { ascending: false }),
    candidate.generation_run_id
      ? db
          .from("winner_generation_runs")
          .select(
            "id, status, scope, rules_version, tie_breakers, source_row_count, eligible_row_count, review_row_count, excluded_row_count, generated_candidate_count, started_at, completed_at, error_summary, generated_by",
          )
          .eq("id", candidate.generation_run_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from("registrations")
      .select("id, public_reference, status, eligibility_status, registered_at, participant_id")
      .eq("id", candidate.registration_id)
      .maybeSingle(),
  ]);

  const checks = (checksResult.data ?? []) as Check[];
  const history = (historyResult.data ?? []) as History[];
  const generationRun = runResult.data as any;
  const registration = registrationResult.data as any;

  const [evaluationsResult, participantResult] = await Promise.all([
    candidate.generation_run_id
      ? db
          .from("winner_generation_evaluations")
          .select(
            "id, registration_id, source_rank, score, provider_total_points, transfer_cost, gameweeks_counted, weekly_eligible, provider_entry_id, display_name, team_name, eligibility_status, checks, tie_break_values, selection_order, selected_candidate_id, evaluated_at",
          )
          .eq("generation_run_id", candidate.generation_run_id)
          .order("selection_order", { ascending: true, nullsFirst: false })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
    registration?.participant_id
      ? db
          .from("participants")
          .select("id, full_name, email, phone, whatsapp_phone, date_of_birth, country, city, vult_customer_ref, status")
          .eq("id", registration.participant_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const evaluations = (evaluationsResult.data ?? []) as Evaluation[];
  const participant = participantResult.data as any;

  const actorIds = Array.from(
    new Set(
      [
        ...history.map((item) => item.actor_user_id),
        candidate.competition_reviewed_by,
        candidate.compliance_reviewed_by,
        candidate.confirmed_by,
        generationRun?.generated_by,
      ].filter(Boolean) as string[],
    ),
  );

  const { data: actorRows } = actorIds.length
    ? await db.from("admin_profiles").select("id, full_name, role").in("id", actorIds)
    : { data: [] };
  const actorMap = new Map((actorRows ?? []).map((actor: any) => [actor.id, actor]));

  const season = seasonResult.data as any;
  const prize = prizeResult.data as any;
  const round = roundResult.data as any;
  const period = periodResult.data as any;
  const canCompetitionReview = ["super_admin", "competition_manager"].includes(admin.role);
  const canComplianceReview = ["super_admin", "compliance_officer"].includes(admin.role);
  const canConfirm = admin.role === "super_admin";
  const canReplace = ["super_admin", "competition_manager"].includes(admin.role);
  const competitionActionAvailable =
    candidate.is_current && ["provisional", "under_review"].includes(candidate.status);
  const complianceActionAvailable =
    candidate.is_current && candidate.status === "competition_approved";
  const confirmationAvailable =
    candidate.is_current && candidate.status === "compliance_approved";
  const replacementAvailable = candidate.is_current && candidate.status === "rejected";
  const failedRequiredChecks = checks.filter(
    (check) => check.is_required && check.check_status === "fail",
  ).length;
  const reviewChecks = checks.filter((check) => check.check_status === "review").length;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href={`/admin/winners?season=${candidate.competition_season_id}`}
            className="text-sm font-black text-[var(--brand)] hover:underline"
          >
            ← Winner queue
          </Link>
          <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
            Candidate evidence review
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            {candidate.display_name_snapshot ?? participant?.full_name ?? "Winner candidate"}
          </h1>
          <p className="mt-3 text-[var(--muted)]">
            {candidate.team_name_snapshot ?? "No team name"} · FPL Entry {candidate.provider_entry_id_snapshot ?? "Not recorded"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-4 py-2 text-xs font-black capitalize ${statusClasses(candidate.status)}`}>
            {label(candidate.status)}
          </span>
          <span className={`rounded-full border px-4 py-2 text-xs font-black capitalize ${statusClasses(candidate.eligibility_status)}`}>
            {label(candidate.eligibility_status)}
          </span>
          {!candidate.is_current ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-800">
              Historical candidate
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Score", candidate.score, `Standing rank ${candidate.rank}`],
          ["Selection order", candidate.candidate_order ?? "—", `Prize position ${candidate.prize_position ?? prize?.position ?? "—"}`],
          ["Required failures", failedRequiredChecks, failedRequiredChecks ? "Cannot be approved" : "No required check failed"],
          ["Manual reviews", reviewChecks, reviewChecks ? "Review evidence before approval" : "No review flags"],
        ].map(([title, value, description]) => (
          <article key={String(title)} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">{title}</p>
            <p className="mt-3 text-4xl font-black text-[var(--brand-strong)]">{value}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Prize and source</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">{prize?.name ?? asRecord(candidate.prize_snapshot).name ?? "Prize unavailable"}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              ["Season", season?.name ?? "Unknown season"],
              ["Scope", label(candidate.scope)],
              ["Source", candidate.scope === "round" ? `${round?.name ?? "Gameweek"} · ${label(round?.status ?? null)}` : candidate.scope === "monthly" ? `${period?.name ?? "Monthly period"} · ${period ? `GW${period.start_round}–GW${period.end_round}` : ""}` : "Overall season standings"],
              ["Rules version", `v${candidate.rules_version}`],
              ["Generated", formatDate(candidate.generated_at)],
              ["Registration", registration?.public_reference ?? candidate.registration_id],
            ].map(([name, value]) => (
              <div key={String(name)} className="rounded-2xl bg-[var(--surface-soft)] p-4">
                <p className="text-xs font-bold text-[var(--muted)]">{name}</p>
                <p className="mt-1 font-black text-[var(--brand-strong)]">{value}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Participant verification snapshot</p>
          <dl className="mt-5 space-y-4 text-sm">
            {[
              ["Full name", participant?.full_name ?? candidate.display_name_snapshot ?? "—"],
              ["Email", participant?.email ?? "—"],
              ["Phone", participant?.phone ?? "—"],
              ["WhatsApp", participant?.whatsapp_phone ?? "—"],
              ["Date of birth", participant?.date_of_birth ?? "—"],
              ["Country / city", [participant?.country, participant?.city].filter(Boolean).join(" · ") || "—"],
              ["Vult reference", participant?.vult_customer_ref ?? "—"],
              ["Profile status", label(participant?.status ?? null)],
            ].map(([name, value]) => (
              <div key={String(name)} className="flex flex-col gap-1 border-b border-[var(--border)] pb-3 sm:flex-row sm:justify-between sm:gap-5">
                <dt className="font-bold text-[var(--muted)]">{name}</dt>
                <dd className="break-all font-black text-[var(--brand-strong)] sm:text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white shadow-sm">
        <div className="border-b border-[var(--border)] p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Eligibility evidence</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Automated checks used for this candidate</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            These records are immutable evidence from the generation run. A review flag requires a human decision; a required failure blocks approval.
          </p>
        </div>
        {checks.length ? (
          <div className="grid gap-4 p-6 lg:grid-cols-2">
            {checks.map((check) => (
              <article key={check.id} className="rounded-2xl border border-[var(--border)] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-black capitalize text-[var(--brand-strong)]">{label(check.check_code)}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{check.summary}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black capitalize ${statusClasses(check.check_status)}`}>
                    {label(check.check_status)}
                  </span>
                </div>
                <p className="mt-4 text-xs leading-5 text-[var(--muted)]">{compactJson(check.details)}</p>
                <p className="mt-3 text-[11px] font-bold text-[var(--muted)]">
                  {check.is_required ? "Required check" : "Advisory check"} · {formatDate(check.evaluated_at)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="p-8 text-sm text-[var(--muted)]">No candidate checks were stored for this record.</p>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Tie-break evidence</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Selection values</h2>
          <p className="mt-4 rounded-2xl bg-[var(--surface-soft)] p-4 text-sm leading-7 text-[var(--muted)]">
            {compactJson(candidate.tie_break_values)}
          </p>
          {generationRun ? (
            <div className="mt-5 space-y-3 text-sm">
              <p><strong>Configured order:</strong> {Array.isArray(generationRun.tie_breakers) ? generationRun.tie_breakers.map(label).join(" → ") : "Not available"}</p>
              <p><strong>Source rows:</strong> {generationRun.source_row_count}</p>
              <p><strong>Eligible:</strong> {generationRun.eligible_row_count}</p>
              <p><strong>Review required:</strong> {generationRun.review_row_count}</p>
              <p><strong>Excluded:</strong> {generationRun.excluded_row_count}</p>
              <p><strong>Completed:</strong> {formatDate(generationRun.completed_at)}</p>
            </div>
          ) : null}
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Publication readiness</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">
            {candidate.publication_ready ? "Ready for publication preparation" : "Not yet publication-ready"}
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className={`rounded-2xl border p-5 ${candidate.publicity_consent ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
              <p className="text-xs font-black uppercase tracking-[0.12em]">Winner publicity</p>
              <p className="mt-2 font-black">{candidate.publicity_consent ? "Consent recorded" : "Consent not recorded"}</p>
            </div>
            <div className={`rounded-2xl border p-5 ${candidate.publication_ready ? "border-green-200 bg-green-50 text-green-900" : "border-slate-200 bg-slate-50 text-slate-800"}`}>
              <p className="text-xs font-black uppercase tracking-[0.12em]">Readiness</p>
              <p className="mt-2 font-black">{candidate.publication_ready ? "Ready" : "Blocked or pending"}</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-7 text-[var(--muted)]">
            {candidate.publication_readiness_note ?? "No readiness note is available."}
          </p>
          <p className="mt-3 text-xs font-bold text-[var(--muted)]">
            Phase 9 does not create payment records or public winner announcements.
          </p>
        </article>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Approval workflow</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Human review and final confirmation</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            ["Competition review", candidate.competition_review_status, candidate.competition_reviewed_at, candidate.competition_reviewed_by, candidate.competition_review_notes],
            ["Compliance review", candidate.compliance_review_status, candidate.compliance_reviewed_at, candidate.compliance_reviewed_by, candidate.compliance_review_notes],
            ["Final confirmation", candidate.status === "confirmed" ? "confirmed" : "pending", candidate.confirmed_at, candidate.confirmed_by, candidate.status === "confirmed" ? candidate.review_notes : null],
          ].map(([title, status, date, actorId, notes]) => {
            const actor = actorId ? actorMap.get(String(actorId)) : null;
            return (
              <article key={String(title)} className="rounded-2xl border border-[var(--border)] p-5">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">{title}</p>
                <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-black capitalize ${statusClasses(String(status))}`}>
                  {label(String(status))}
                </span>
                <p className="mt-4 text-sm font-bold text-[var(--brand-strong)]">{actor?.full_name ?? "No reviewer recorded"}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(date ? String(date) : null)}</p>
                {notes ? <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{String(notes)}</p> : null}
              </article>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {canCompetitionReview && competitionActionAvailable ? (
            <form action={competitionReviewWinnerAction} className="rounded-2xl border border-[var(--border)] p-5">
              <input type="hidden" name="candidate_id" value={candidate.id} />
              <input type="hidden" name="competition_season_id" value={candidate.competition_season_id} />
              <p className="font-black text-[var(--brand-strong)]">Competition review</p>
              <textarea
                name="notes"
                required
                minLength={8}
                rows={4}
                placeholder="Record eligibility evidence, tie-break review and the decision reason."
                className="mt-4 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button name="decision" value="approve" className="rounded-xl bg-green-700 px-4 py-2.5 text-sm font-black text-white">Approve competition review</button>
                <button name="decision" value="reject" className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-black text-white">Reject candidate</button>
              </div>
            </form>
          ) : null}

          {canComplianceReview && complianceActionAvailable ? (
            <form action={complianceReviewWinnerAction} className="rounded-2xl border border-[var(--border)] p-5">
              <input type="hidden" name="candidate_id" value={candidate.id} />
              <input type="hidden" name="competition_season_id" value={candidate.competition_season_id} />
              <p className="font-black text-[var(--brand-strong)]">Independent compliance review</p>
              <textarea
                name="notes"
                required
                minLength={8}
                rows={4}
                placeholder="Record the independent compliance verification and decision."
                className="mt-4 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button name="decision" value="approve" className="rounded-xl bg-green-700 px-4 py-2.5 text-sm font-black text-white">Approve compliance review</button>
                <button name="decision" value="reject" className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-black text-white">Reject candidate</button>
              </div>
            </form>
          ) : null}

          {canConfirm && confirmationAvailable ? (
            <form action={confirmWinnerAction} className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <input type="hidden" name="candidate_id" value={candidate.id} />
              <input type="hidden" name="competition_season_id" value={candidate.competition_season_id} />
              <p className="font-black text-blue-950">Final Super Admin confirmation</p>
              <textarea
                name="notes"
                required
                minLength={8}
                rows={4}
                placeholder="Confirm both approvals and record the final decision."
                className="mt-4 w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm"
              />
              <button className="mt-3 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-black text-white">Confirm winner</button>
            </form>
          ) : null}

          {canReplace && replacementAvailable ? (
            <form action={replaceWinnerCandidateAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <input type="hidden" name="candidate_id" value={candidate.id} />
              <input type="hidden" name="competition_season_id" value={candidate.competition_season_id} />
              <p className="font-black text-amber-950">Generate next eligible replacement</p>
              <textarea
                name="reason"
                required
                minLength={8}
                rows={4}
                placeholder="Explain why the rejected candidate must be replaced."
                className="mt-4 w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm"
              />
              <button className="mt-3 rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-black text-white">Generate replacement candidate</button>
            </form>
          ) : null}
        </div>

        {!competitionActionAvailable && !complianceActionAvailable && !confirmationAvailable && !replacementAvailable ? (
          <p className="mt-6 rounded-2xl bg-[var(--surface-soft)] p-5 text-sm text-[var(--muted)]">
            No workflow action is currently available for this candidate status.
          </p>
        ) : null}
      </section>

      {(candidate.replacement_for_candidate_id || candidate.replaced_by_candidate_id) ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h2 className="text-lg font-black">Replacement lineage</h2>
          <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold">
            {candidate.replacement_for_candidate_id ? (
              <Link href={`/admin/winners/${candidate.replacement_for_candidate_id}`} className="rounded-xl bg-white px-4 py-2 hover:underline">View rejected candidate replaced by this record</Link>
            ) : null}
            {candidate.replaced_by_candidate_id ? (
              <Link href={`/admin/winners/${candidate.replaced_by_candidate_id}`} className="rounded-xl bg-white px-4 py-2 hover:underline">View replacement candidate</Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-[var(--border)] bg-white shadow-sm">
        <div className="border-b border-[var(--border)] p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Evaluation pool</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Entries assessed in this generation run</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Selection order applies the published tie-break sequence after score ordering.</p>
        </div>
        {evaluations.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surface-soft)] text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-4">Order</th>
                  <th className="px-5 py-4">Entry</th>
                  <th className="px-5 py-4">Score</th>
                  <th className="px-5 py-4">Standing</th>
                  <th className="px-5 py-4">Eligibility</th>
                  <th className="px-5 py-4">Tie-break values</th>
                  <th className="px-5 py-4">Selection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {evaluations.map((evaluation) => (
                  <tr key={evaluation.id} className={evaluation.selected_candidate_id === candidate.id ? "bg-blue-50" : ""}>
                    <td className="px-5 py-4 text-lg font-black text-[var(--brand-strong)]">{evaluation.selection_order ?? "—"}</td>
                    <td className="px-5 py-4">
                      <p className="font-black text-[var(--brand-strong)]">{evaluation.display_name}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{evaluation.team_name ?? "No team"} · {evaluation.provider_entry_id ?? "No entry ID"}</p>
                    </td>
                    <td className="px-5 py-4 font-black text-[var(--brand-strong)]">{evaluation.score}</td>
                    <td className="px-5 py-4">Rank {evaluation.source_rank}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${statusClasses(evaluation.eligibility_status)}`}>
                        {label(evaluation.eligibility_status)}
                      </span>
                    </td>
                    <td className="max-w-md px-5 py-4 text-xs leading-5 text-[var(--muted)]">{compactJson(evaluation.tie_break_values)}</td>
                    <td className="px-5 py-4 text-xs font-black">
                      {evaluation.selected_candidate_id === candidate.id ? "This candidate" : evaluation.selected_candidate_id ? "Used by another candidate" : "Available"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-8 text-sm text-[var(--muted)]">No generation evaluation pool is attached to this historical record.</p>
        )}
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Status history</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Candidate audit trail</h2>
        {history.length ? (
          <div className="mt-5 space-y-4">
            {history.map((item) => {
              const actor = item.actor_user_id ? actorMap.get(item.actor_user_id) : null;
              return (
                <article key={item.id} className="rounded-2xl border border-[var(--border)] p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-black capitalize text-[var(--brand-strong)]">{label(item.action)}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">{label(item.from_status)} → {label(item.to_status)}</p>
                    </div>
                    <p className="text-xs font-bold text-[var(--muted)]">{formatDate(item.created_at)}</p>
                  </div>
                  <p className="mt-3 text-sm font-bold text-[var(--brand-strong)]">{actor?.full_name ?? "System"}{actor?.role ? ` · ${label(actor.role)}` : ""}</p>
                  {item.notes ? <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.notes}</p> : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 text-sm text-[var(--muted)]">No status history is available.</p>
        )}
      </section>
    </div>
  );
}
