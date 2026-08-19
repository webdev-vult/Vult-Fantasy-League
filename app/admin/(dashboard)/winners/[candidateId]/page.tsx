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

type CheckRow = {
  id: number;
  check_code: string;
  check_status: string;
  is_required: boolean;
  summary: string;
  details: unknown;
  evaluated_at: string;
};

type EvaluationRow = {
  id: string;
  source_rank: number;
  score: number;
  provider_total_points: number;
  transfer_cost: number;
  gameweeks_counted: number;
  provider_entry_id: string | null;
  display_name: string;
  team_name: string | null;
  eligibility_status: string;
  tie_break_values: unknown;
  selection_order: number | null;
  selected_candidate_id: string | null;
};

type HistoryRow = {
  id: number;
  from_status: string | null;
  to_status: string;
  action: string;
  actor_user_id: string | null;
  notes: string | null;
  created_at: string;
};

function label(value: string | null | undefined) {
  return (value ?? "not set").replaceAll("_", " ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function badge(status: string) {
  if (["pass", "eligible", "approved", "confirmed", "compliance_approved"].includes(status)) {
    return "border-green-200 bg-green-50 text-green-800";
  }
  if (["fail", "ineligible", "rejected", "superseded"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function recordText(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "No additional evidence";
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => {
      const display = Array.isArray(item) ? item.join(", ") : String(item ?? "—");
      return `${label(key)}: ${display}`;
    })
    .join(" · ");
}

function ReviewForm({
  title,
  action,
  candidateId,
  seasonId,
  approveLabel,
  rejectLabel,
}: {
  title: string;
  action: (formData: FormData) => Promise<void>;
  candidateId: string;
  seasonId: string;
  approveLabel: string;
  rejectLabel: string;
}) {
  return (
    <form action={action} className="rounded-2xl border border-[var(--border)] p-5">
      <input type="hidden" name="candidate_id" value={candidateId} />
      <input type="hidden" name="competition_season_id" value={seasonId} />
      <p className="font-black text-[var(--brand-strong)]">{title}</p>
      <textarea
        name="notes"
        required
        minLength={8}
        rows={4}
        placeholder="Record the evidence reviewed and the reason for the decision."
        className="mt-4 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button name="decision" value="approve" className="rounded-xl bg-green-700 px-4 py-2.5 text-sm font-black text-white">
          {approveLabel}
        </button>
        <button name="decision" value="reject" className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-black text-white">
          {rejectLabel}
        </button>
      </div>
    </form>
  );
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

  const { data: candidate, error } = await db
    .from("winner_candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();
  if (error || !candidate) notFound();

  const [seasonResult, prizeResult, roundResult, periodResult, registrationResult, checksResult, historyResult, runResult] =
    await Promise.all([
      db.from("competition_seasons").select("id, name, status").eq("id", candidate.competition_season_id).maybeSingle(),
      candidate.prize_id
        ? db.from("prizes").select("id, code, name, frequency, position, amount, currency, prize_type, payment_method").eq("id", candidate.prize_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      candidate.round_id
        ? db.from("rounds").select("id, external_round_id, name, status, is_final").eq("id", candidate.round_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      candidate.monthly_period_id
        ? db.from("monthly_periods").select("id, name, start_round, end_round, status").eq("id", candidate.monthly_period_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.from("registrations").select("id, public_reference, status, eligibility_status, registered_at, participant_id").eq("id", candidate.registration_id).maybeSingle(),
      db.from("winner_candidate_checks").select("id, check_code, check_status, is_required, summary, details, evaluated_at").eq("candidate_id", candidate.id).order("id"),
      db.from("winner_candidate_status_history").select("id, from_status, to_status, action, actor_user_id, notes, created_at").eq("candidate_id", candidate.id).order("created_at", { ascending: false }),
      candidate.generation_run_id
        ? db.from("winner_generation_runs").select("id, status, scope, rules_version, tie_breakers, source_row_count, eligible_row_count, review_row_count, excluded_row_count, generated_candidate_count, started_at, completed_at, generated_by").eq("id", candidate.generation_run_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  const registration = registrationResult.data as any;
  const [participantResult, verificationResult, evaluationsResult] = await Promise.all([
    registration?.participant_id
      ? db.from("participants").select("id, full_name, email, phone, whatsapp_phone, country, city, status").eq("id", registration.participant_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    registration?.id
      ? db.from("registration_verifications").select("vult_status, vult_kyc_level, vult_checked_at").eq("registration_id", registration.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    candidate.generation_run_id
      ? db.from("winner_generation_evaluations").select("id, source_rank, score, provider_total_points, transfer_cost, gameweeks_counted, provider_entry_id, display_name, team_name, eligibility_status, tie_break_values, selection_order, selected_candidate_id").eq("generation_run_id", candidate.generation_run_id).order("selection_order", { ascending: true, nullsFirst: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const checks = (checksResult.data ?? []) as CheckRow[];
  const history = (historyResult.data ?? []) as HistoryRow[];
  const evaluations = (evaluationsResult.data ?? []) as EvaluationRow[];
  const run = runResult.data as any;
  const participant = participantResult.data as any;
  const verification = verificationResult.data as any;
  const season = seasonResult.data as any;
  const prize = prizeResult.data as any;
  const round = roundResult.data as any;
  const period = periodResult.data as any;

  const actorIds = Array.from(new Set([
    ...history.map((item) => item.actor_user_id),
    candidate.competition_reviewed_by,
    candidate.compliance_reviewed_by,
    candidate.confirmed_by,
    run?.generated_by,
  ].filter(Boolean) as string[]));
  const { data: actorRows } = actorIds.length
    ? await db.from("admin_profiles").select("id, full_name, role").in("id", actorIds)
    : { data: [] as Array<{ id: string; full_name: string; role: string }> };
  const actorById: Record<string, { id: string; full_name: string; role: string }> = Object.fromEntries(
    (actorRows ?? []).map((actor: { id: string; full_name: string; role: string }) => [actor.id, actor]),
  );

  const canCompetitionReview = ["super_admin", "competition_manager"].includes(admin.role);
  const canComplianceReview = ["super_admin", "compliance_officer"].includes(admin.role);
  const canConfirm = admin.role === "super_admin";
  const canReplace = ["super_admin", "competition_manager"].includes(admin.role);
  const competitionAction = candidate.is_current && ["provisional", "under_review"].includes(candidate.status);
  const complianceAction = candidate.is_current && candidate.status === "competition_approved";
  const confirmationAction = candidate.is_current && candidate.status === "compliance_approved";
  const replacementAction = candidate.is_current && candidate.status === "rejected";
  const failedRequired = checks.filter((item) => item.is_required && item.check_status === "fail").length;
  const reviewFlags = checks.filter((item) => item.check_status === "review").length;

  const sourceLabel = candidate.scope === "round"
    ? `${round?.name ?? "Gameweek"} · ${label(round?.status)}`
    : candidate.scope === "monthly"
      ? `${period?.name ?? "Monthly period"}${period ? ` · GW${period.start_round}–GW${period.end_round}` : ""}`
      : "Overall season standings";

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href={`/admin/winners?season=${candidate.competition_season_id}`} className="text-sm font-black text-[var(--brand)] hover:underline">
            ← Winner queue
          </Link>
          <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">Candidate evidence review</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            {candidate.display_name_snapshot ?? participant?.full_name ?? "Winner candidate"}
          </h1>
          <p className="mt-3 text-[var(--muted)]">
            {candidate.team_name_snapshot ?? "No team name"} · FPL Entry {candidate.provider_entry_id_snapshot ?? "Not recorded"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-4 py-2 text-xs font-black capitalize ${badge(candidate.status)}`}>{label(candidate.status)}</span>
          <span className={`rounded-full border px-4 py-2 text-xs font-black capitalize ${badge(candidate.eligibility_status)}`}>{label(candidate.eligibility_status)}</span>
          {!candidate.is_current ? <span className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-800">Historical candidate</span> : null}
        </div>
      </header>

      {messages.success ? <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">{messages.success}</div> : null}
      {messages.error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">{messages.error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Score", candidate.score, `Standing rank ${candidate.rank}`],
          ["Selection order", candidate.candidate_order ?? "—", `Prize position ${candidate.prize_position ?? prize?.position ?? "—"}`],
          ["Required failures", failedRequired, failedRequired ? "Approval blocked" : "No blocking failure"],
          ["Review flags", reviewFlags, reviewFlags ? "Human review required" : "No advisory flags"],
        ].map(([title, value, description]) => (
          <article key={String(title)} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">{title}</p>
            <p className="mt-3 text-4xl font-black text-[var(--brand-strong)]">{value}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Prize and source</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">{prize?.name ?? "Prize unavailable"}</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              ["Season", season?.name ?? "Unknown season"],
              ["Scope", label(candidate.scope)],
              ["Source", sourceLabel],
              ["Rules version", `v${candidate.rules_version}`],
              ["Generated", formatDate(candidate.generated_at)],
              ["Registration", registration?.public_reference ?? candidate.registration_id],
            ].map(([name, value]) => (
              <div key={String(name)} className="rounded-2xl bg-[var(--surface-soft)] p-4">
                <dt className="text-xs font-bold text-[var(--muted)]">{name}</dt>
                <dd className="mt-1 font-black text-[var(--brand-strong)]">{value}</dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Participant verification snapshot</p>
          <dl className="mt-5 space-y-3 text-sm">
            {[
              ["Full name", participant?.full_name ?? candidate.display_name_snapshot ?? "—"],
              ["Email", participant?.email ?? "—"],
              ["Phone", participant?.phone ?? "—"],
              ["WhatsApp", participant?.whatsapp_phone ?? "—"],
              ["Country / city", [participant?.country, participant?.city].filter(Boolean).join(" · ") || "—"],
              ["Vult account", label(verification?.vult_status)],
              ["Vult KYC level", `Level ${verification?.vult_kyc_level ?? 0}`],
              ["KYC last checked", formatDate(verification?.vult_checked_at)],
              ["Profile status", label(participant?.status)],
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
          <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Automated checks used for selection</h2>
        </div>
        <div className="grid gap-4 p-6 lg:grid-cols-2">
          {checks.map((item) => (
            <article key={item.id} className="rounded-2xl border border-[var(--border)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-black capitalize text-[var(--brand-strong)]">{label(item.check_code)}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.summary}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-black capitalize ${badge(item.check_status)}`}>{label(item.check_status)}</span>
              </div>
              <p className="mt-4 text-xs leading-5 text-[var(--muted)]">{recordText(item.details)}</p>
              <p className="mt-3 text-[11px] font-bold text-[var(--muted)]">{item.is_required ? "Required" : "Advisory"} · {formatDate(item.evaluated_at)}</p>
            </article>
          ))}
          {!checks.length ? <p className="text-sm text-[var(--muted)]">No eligibility checks were stored.</p> : null}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Tie-break evidence</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Selection values</h2>
          <p className="mt-4 rounded-2xl bg-[var(--surface-soft)] p-4 text-sm leading-7 text-[var(--muted)]">{recordText(candidate.tie_break_values)}</p>
          {run ? (
            <div className="mt-5 space-y-2 text-sm text-[var(--muted)]">
              <p><strong className="text-[var(--brand-strong)]">Tie-break order:</strong> {Array.isArray(run.tie_breakers) ? run.tie_breakers.map(label).join(" → ") : "Not available"}</p>
              <p>Source {run.source_row_count} · Eligible {run.eligible_row_count} · Review {run.review_row_count} · Excluded {run.excluded_row_count}</p>
              <p>Completed {formatDate(run.completed_at)}</p>
            </div>
          ) : null}
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Publication readiness</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">{candidate.publication_ready ? "Ready for publication preparation" : "Not yet publication-ready"}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className={`rounded-2xl border p-5 ${candidate.publicity_consent ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
              <p className="text-xs font-black uppercase tracking-[0.12em]">Publicity consent</p>
              <p className="mt-2 font-black">{candidate.publicity_consent ? "Recorded" : "Missing"}</p>
            </div>
            <div className={`rounded-2xl border p-5 ${candidate.publication_ready ? "border-green-200 bg-green-50 text-green-900" : "border-slate-200 bg-slate-50 text-slate-800"}`}>
              <p className="text-xs font-black uppercase tracking-[0.12em]">Readiness</p>
              <p className="mt-2 font-black">{candidate.publication_ready ? "Ready" : "Blocked or pending"}</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-7 text-[var(--muted)]">{candidate.publication_readiness_note ?? "No readiness note is available."}</p>
        </article>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Approval workflow</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Human review and confirmation</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            ["Competition review", candidate.competition_review_status, candidate.competition_reviewed_at, candidate.competition_reviewed_by, candidate.competition_review_notes],
            ["Compliance review", candidate.compliance_review_status, candidate.compliance_reviewed_at, candidate.compliance_reviewed_by, candidate.compliance_review_notes],
            ["Final confirmation", candidate.status === "confirmed" ? "confirmed" : "pending", candidate.confirmed_at, candidate.confirmed_by, candidate.status === "confirmed" ? candidate.review_notes : null],
          ].map(([title, status, date, actorId, notes]) => {
            const actor = actorId ? actorById[String(actorId)] : undefined;
            return (
              <article key={String(title)} className="rounded-2xl border border-[var(--border)] p-5">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">{title}</p>
                <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-black capitalize ${badge(String(status))}`}>{label(String(status))}</span>
                <p className="mt-4 text-sm font-bold text-[var(--brand-strong)]">{actor?.full_name ?? "No reviewer recorded"}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(date ? String(date) : null)}</p>
                {notes ? <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{String(notes)}</p> : null}
              </article>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {canCompetitionReview && competitionAction ? (
            <ReviewForm title="Competition review" action={competitionReviewWinnerAction} candidateId={candidate.id} seasonId={candidate.competition_season_id} approveLabel="Approve competition review" rejectLabel="Reject candidate" />
          ) : null}
          {canComplianceReview && complianceAction ? (
            <ReviewForm title="Independent compliance review" action={complianceReviewWinnerAction} candidateId={candidate.id} seasonId={candidate.competition_season_id} approveLabel="Approve compliance review" rejectLabel="Reject candidate" />
          ) : null}
          {canConfirm && confirmationAction ? (
            <form action={confirmWinnerAction} className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
              <input type="hidden" name="candidate_id" value={candidate.id} />
              <input type="hidden" name="competition_season_id" value={candidate.competition_season_id} />
              <p className="font-black text-blue-950">Final Super Admin confirmation</p>
              <textarea name="notes" required minLength={8} rows={4} placeholder="Record the final confirmation decision." className="mt-4 w-full rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm" />
              <button className="mt-3 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-black text-white">Confirm winner</button>
            </form>
          ) : null}
          {canReplace && replacementAction ? (
            <form action={replaceWinnerCandidateAction} className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <input type="hidden" name="candidate_id" value={candidate.id} />
              <input type="hidden" name="competition_season_id" value={candidate.competition_season_id} />
              <p className="font-black text-amber-950">Generate next eligible replacement</p>
              <textarea name="reason" required minLength={8} rows={4} placeholder="Explain why a replacement is required." className="mt-4 w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm" />
              <button className="mt-3 rounded-xl bg-amber-800 px-4 py-2.5 text-sm font-black text-white">Generate replacement</button>
            </form>
          ) : null}
        </div>
      </section>

      {candidate.replacement_for_candidate_id || candidate.replaced_by_candidate_id ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h2 className="text-lg font-black">Replacement lineage</h2>
          <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold">
            {candidate.replacement_for_candidate_id ? <Link href={`/admin/winners/${candidate.replacement_for_candidate_id}`} className="rounded-xl bg-white px-4 py-2 hover:underline">View replaced candidate</Link> : null}
            {candidate.replaced_by_candidate_id ? <Link href={`/admin/winners/${candidate.replaced_by_candidate_id}`} className="rounded-xl bg-white px-4 py-2 hover:underline">View replacement candidate</Link> : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-[var(--border)] bg-white shadow-sm">
        <div className="border-b border-[var(--border)] p-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Evaluation pool</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Entries assessed in the generation run</h2>
        </div>
        {evaluations.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surface-soft)] text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                <tr><th className="px-5 py-4">Order</th><th className="px-5 py-4">Entry</th><th className="px-5 py-4">Score</th><th className="px-5 py-4">Rank</th><th className="px-5 py-4">Eligibility</th><th className="px-5 py-4">Tie-break evidence</th><th className="px-5 py-4">Selection</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {evaluations.map((item) => (
                  <tr key={item.id} className={item.selected_candidate_id === candidate.id ? "bg-blue-50" : ""}>
                    <td className="px-5 py-4 text-lg font-black">{item.selection_order ?? "—"}</td>
                    <td className="px-5 py-4"><p className="font-black text-[var(--brand-strong)]">{item.display_name}</p><p className="mt-1 text-xs text-[var(--muted)]">{item.team_name ?? "No team"} · {item.provider_entry_id ?? "No entry ID"}</p></td>
                    <td className="px-5 py-4 font-black">{item.score}</td>
                    <td className="px-5 py-4">{item.source_rank}</td>
                    <td className="px-5 py-4"><span className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${badge(item.eligibility_status)}`}>{label(item.eligibility_status)}</span></td>
                    <td className="max-w-md px-5 py-4 text-xs leading-5 text-[var(--muted)]">{recordText(item.tie_break_values)}</td>
                    <td className="px-5 py-4 text-xs font-black">{item.selected_candidate_id === candidate.id ? "This candidate" : item.selected_candidate_id ? "Previously selected" : "Available"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p-8 text-sm text-[var(--muted)]">No evaluation pool is attached to this record.</p>}
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Status history</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Candidate audit trail</h2>
        <div className="mt-5 space-y-4">
          {history.map((item) => {
            const actor = item.actor_user_id ? actorById[item.actor_user_id] : undefined;
            return (
              <article key={item.id} className="rounded-2xl border border-[var(--border)] p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <div><p className="font-black capitalize text-[var(--brand-strong)]">{label(item.action)}</p><p className="mt-1 text-sm text-[var(--muted)]">{label(item.from_status)} → {label(item.to_status)}</p></div>
                  <p className="text-xs font-bold text-[var(--muted)]">{formatDate(item.created_at)}</p>
                </div>
                <p className="mt-3 text-sm font-bold text-[var(--brand-strong)]">{actor?.full_name ?? "System"}{actor?.role ? ` · ${label(actor.role)}` : ""}</p>
                {item.notes ? <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.notes}</p> : null}
              </article>
            );
          })}
          {!history.length ? <p className="text-sm text-[var(--muted)]">No status history is available.</p> : null}
        </div>
      </section>
    </div>
  );
}
