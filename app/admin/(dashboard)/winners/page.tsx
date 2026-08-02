import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateWinnerCandidateAction } from "./actions";

type SearchParams = Promise<{
  season?: string;
  scope?: string;
  status?: string;
  success?: string;
  error?: string;
}>;

type CompetitionSeason = {
  id: string;
  name: string;
  status: string;
  rules_version: number;
};

type Rule = {
  id: string;
  version: number;
  title: string;
  tie_breakers: unknown;
  repeat_weekly_winners_allowed: boolean;
};

type Prize = {
  id: string;
  code: string;
  name: string;
  frequency: string;
  position: number;
  amount: number;
  currency: string;
  prize_type: string;
};

type Round = {
  id: string;
  external_round_id: number;
  name: string;
  status: string;
  is_final: boolean;
};

type MonthlyPeriod = {
  id: string;
  name: string;
  start_round: number;
  end_round: number;
  status: string;
};

type Candidate = {
  id: string;
  prize_id: string | null;
  round_id: string | null;
  monthly_period_id: string | null;
  display_name_snapshot: string | null;
  team_name_snapshot: string | null;
  provider_entry_id_snapshot: string | null;
  scope: string | null;
  score: number;
  rank: number;
  candidate_order: number | null;
  prize_position: number | null;
  status: string;
  eligibility_status: string;
  competition_review_status: string;
  compliance_review_status: string;
  publicity_consent: boolean;
  publication_ready: boolean;
  is_current: boolean;
  rejection_reason: string | null;
  generated_at: string;
  confirmed_at: string | null;
};

type GenerationRun = {
  id: string;
  prize_id: string;
  scope: string;
  round_id: string | null;
  monthly_period_id: string | null;
  status: string;
  source_row_count: number;
  eligible_row_count: number;
  review_row_count: number;
  excluded_row_count: number;
  generated_candidate_count: number;
  rules_version: number;
  completed_at: string | null;
  error_summary: string | null;
};

function label(value: string | null) {
  return (value ?? "not set").replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "Not completed";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function statusClasses(status: string) {
  if (["confirmed", "compliance_approved", "completed", "eligible"].includes(status)) {
    return "border-green-200 bg-green-50 text-green-800";
  }
  if (
    [
      "provisional",
      "under_review",
      "competition_approved",
      "running",
      "partial",
      "review_required",
    ].includes(status)
  ) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (["rejected", "failed", "ineligible", "superseded"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

export default async function WinnersPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;

  const { data: seasonRows, error: seasonsError } = await db
    .from("competition_seasons")
    .select("id, name, status, rules_version")
    .order("created_at", { ascending: false });

  const seasons = (seasonRows ?? []) as CompetitionSeason[];
  const selectedSeasonId = seasons.some((season) => season.id === params.season)
    ? params.season!
    : seasons[0]?.id;
  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId);

  let publishedRule: Rule | null = null;
  let prizes: Prize[] = [];
  let rounds: Round[] = [];
  let monthlyPeriods: MonthlyPeriod[] = [];
  let candidates: Candidate[] = [];
  let generationRuns: GenerationRun[] = [];
  let loadError = seasonsError?.message ?? null;

  if (selectedSeasonId) {
    const [rulesResult, prizesResult, roundsResult, periodsResult, candidatesResult, runsResult] =
      await Promise.all([
        db
          .from("competition_rules")
          .select("id, version, title, tie_breakers, repeat_weekly_winners_allowed")
          .eq("competition_season_id", selectedSeasonId)
          .eq("status", "published")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("prizes")
          .select("id, code, name, frequency, position, amount, currency, prize_type")
          .eq("competition_season_id", selectedSeasonId)
          .eq("is_active", true)
          .order("frequency")
          .order("position"),
        db
          .from("rounds")
          .select("id, external_round_id, name, status, is_final")
          .eq("competition_season_id", selectedSeasonId)
          .in("status", ["final", "locked"])
          .eq("is_final", true)
          .order("external_round_id"),
        db
          .from("monthly_periods")
          .select("id, name, start_round, end_round, status")
          .eq("competition_season_id", selectedSeasonId)
          .in("status", ["completed", "locked"])
          .order("start_round"),
        db
          .from("winner_candidates")
          .select(
            "id, prize_id, round_id, monthly_period_id, display_name_snapshot, team_name_snapshot, provider_entry_id_snapshot, scope, score, rank, candidate_order, prize_position, status, eligibility_status, competition_review_status, compliance_review_status, publicity_consent, publication_ready, is_current, rejection_reason, generated_at, confirmed_at",
          )
          .eq("competition_season_id", selectedSeasonId)
          .order("is_current", { ascending: false })
          .order("generated_at", { ascending: false })
          .limit(150),
        db
          .from("winner_generation_runs")
          .select(
            "id, prize_id, scope, round_id, monthly_period_id, status, source_row_count, eligible_row_count, review_row_count, excluded_row_count, generated_candidate_count, rules_version, completed_at, error_summary",
          )
          .eq("competition_season_id", selectedSeasonId)
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

    publishedRule = (rulesResult.data as Rule | null) ?? null;
    prizes = (prizesResult.data ?? []) as Prize[];
    rounds = (roundsResult.data ?? []) as Round[];
    monthlyPeriods = (periodsResult.data ?? []) as MonthlyPeriod[];
    candidates = (candidatesResult.data ?? []) as Candidate[];
    generationRuns = (runsResult.data ?? []) as GenerationRun[];
    loadError =
      loadError ??
      rulesResult.error?.message ??
      prizesResult.error?.message ??
      roundsResult.error?.message ??
      periodsResult.error?.message ??
      candidatesResult.error?.message ??
      runsResult.error?.message ??
      null;
  }

  const canGenerate = ["super_admin", "competition_manager"].includes(admin.role);
  const canCompetitionReview = canGenerate;
  const canComplianceReview = ["super_admin", "compliance_officer"].includes(admin.role);
  const canConfirm = admin.role === "super_admin";
  const prizeMap = new Map(prizes.map((prize) => [prize.id, prize]));
  const roundMap = new Map(rounds.map((round) => [round.id, round]));
  const periodMap = new Map(monthlyPeriods.map((period) => [period.id, period]));

  const filteredCandidates = candidates.filter((candidate) => {
    if (params.scope && params.scope !== "all" && candidate.scope !== params.scope) return false;
    if (params.status && params.status !== "all" && candidate.status !== params.status) return false;
    return true;
  });

  const currentCandidates = candidates.filter((candidate) => candidate.is_current);
  const awaitingCompetition = currentCandidates.filter((candidate) =>
    ["provisional", "under_review"].includes(candidate.status),
  ).length;
  const awaitingCompliance = currentCandidates.filter(
    (candidate) => candidate.status === "competition_approved",
  ).length;
  const confirmed = currentCandidates.filter((candidate) => candidate.status === "confirmed").length;
  const rejectedAwaitingReplacement = currentCandidates.filter(
    (candidate) => candidate.status === "rejected",
  ).length;

  const weeklyPrizes = prizes.filter((prize) => prize.frequency === "weekly");
  const monthlyPrizes = prizes.filter((prize) => prize.frequency === "monthly");
  const overallPrizes = prizes.filter((prize) => prize.frequency === "overall");
  const overallReady = ["completed", "archived"].includes(selectedSeason?.status ?? "");

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
            Phase 9
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            Winner calculation and approval
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Generate candidates from final standings, review eligibility evidence, apply the
            published tie-breakers, complete competition and compliance approval, and confirm
            winners before payment preparation.
          </p>
        </div>

        {seasons.length ? (
          <form method="get" className="w-full rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm lg:w-96">
            <label htmlFor="season" className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">
              Competition season
            </label>
            <div className="mt-2 flex gap-2">
              <select
                id="season"
                name="season"
                defaultValue={selectedSeasonId}
                className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-bold text-[var(--brand-strong)]"
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
              <button className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-black text-white">
                Load
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {params.success ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">
          {params.success}
        </div>
      ) : null}
      {params.error || loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
          {params.error ?? loadError}
        </div>
      ) : null}

      {!selectedSeason ? (
        <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white p-10 text-center">
          <h2 className="text-2xl font-black text-[var(--brand-strong)]">No competition season available</h2>
          <p className="mt-3 text-[var(--muted)]">Create a competition season before generating winners.</p>
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Competition review", awaitingCompetition, "Candidates awaiting the first approval stage"],
              ["Compliance review", awaitingCompliance, "Competition-approved candidates awaiting compliance"],
              ["Confirmed winners", confirmed, "Approved candidates ready for Phase 10"],
              ["Replacement needed", rejectedAwaitingReplacement, "Current rejected candidates with no replacement yet"],
            ].map(([title, value, description]) => (
              <article key={String(title)} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">{title}</p>
                <p className="mt-3 text-4xl font-black text-[var(--brand-strong)]">{value}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>
              </article>
            ))}
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Generation prerequisites</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Published rules and final scores</h2>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-black">
                <span className={`rounded-full border px-3 py-1.5 ${publishedRule ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                  {publishedRule ? `Rules v${publishedRule.version}` : "No published rules"}
                </span>
                <span className={`rounded-full border px-3 py-1.5 ${prizes.length ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                  {prizes.length} active prize{prizes.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
                  {rounds.length} final Gameweek{rounds.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-700">
                  {monthlyPeriods.length} completed month{monthlyPeriods.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {publishedRule ? (
              <div className="mt-5 rounded-2xl bg-[var(--surface-soft)] p-5">
                <p className="font-black text-[var(--brand-strong)]">{publishedRule.title}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Tie-break order: {stringList(publishedRule.tie_breakers).map(label).join(" → ") || "Not configured"}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Repeat weekly winners: {publishedRule.repeat_weekly_winners_allowed ? "Allowed" : "Not allowed"}
                </p>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900">
                Publish a rules version in Operations before generating candidates.
              </div>
            )}
          </section>

          {canGenerate ? (
            <section className="grid gap-6 xl:grid-cols-3">
              <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Weekly</p>
                <h2 className="mt-2 text-xl font-black text-[var(--brand-strong)]">Generate Gameweek candidate</h2>
                <form action={generateWinnerCandidateAction} className="mt-5 space-y-4">
                  <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                  <input type="hidden" name="scope" value="round" />
                  <select name="prize_id" required className="w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm font-bold">
                    <option value="">Select weekly prize</option>
                    {weeklyPrizes.map((prize) => (
                      <option key={prize.id} value={prize.id}>
                        {prize.name} · position {prize.position} · {formatMoney(prize.amount, prize.currency)}
                      </option>
                    ))}
                  </select>
                  <select name="round_id" required className="w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm font-bold">
                    <option value="">Select final Gameweek</option>
                    {rounds.map((round) => (
                      <option key={round.id} value={round.id}>
                        GW{round.external_round_id} · {round.name} · {label(round.status)}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!publishedRule || !weeklyPrizes.length || !rounds.length}
                    className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Generate weekly candidate
                  </button>
                </form>
              </article>

              <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Monthly</p>
                <h2 className="mt-2 text-xl font-black text-[var(--brand-strong)]">Generate monthly candidate</h2>
                <form action={generateWinnerCandidateAction} className="mt-5 space-y-4">
                  <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                  <input type="hidden" name="scope" value="monthly" />
                  <select name="prize_id" required className="w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm font-bold">
                    <option value="">Select monthly prize</option>
                    {monthlyPrizes.map((prize) => (
                      <option key={prize.id} value={prize.id}>
                        {prize.name} · position {prize.position} · {formatMoney(prize.amount, prize.currency)}
                      </option>
                    ))}
                  </select>
                  <select name="monthly_period_id" required className="w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm font-bold">
                    <option value="">Select completed period</option>
                    {monthlyPeriods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.name} · GW{period.start_round}–GW{period.end_round}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!publishedRule || !monthlyPrizes.length || !monthlyPeriods.length}
                    className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Generate monthly candidate
                  </button>
                </form>
              </article>

              <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Overall</p>
                <h2 className="mt-2 text-xl font-black text-[var(--brand-strong)]">Generate season candidate</h2>
                <form action={generateWinnerCandidateAction} className="mt-5 space-y-4">
                  <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                  <input type="hidden" name="scope" value="overall" />
                  <select name="prize_id" required className="w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm font-bold">
                    <option value="">Select overall prize</option>
                    {overallPrizes.map((prize) => (
                      <option key={prize.id} value={prize.id}>
                        {prize.name} · position {prize.position} · {formatMoney(prize.amount, prize.currency)}
                      </option>
                    ))}
                  </select>
                  <div className={`rounded-xl border p-3 text-sm font-bold ${overallReady ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                    Season status: {label(selectedSeason.status)}
                  </div>
                  <button
                    disabled={!publishedRule || !overallPrizes.length || !overallReady}
                    className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Generate overall candidate
                  </button>
                </form>
              </article>
            </section>
          ) : (
            <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <p className="font-black text-[var(--brand-strong)]">Review-only access</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Your role can review winner records but cannot generate candidates. Competition Managers and Super Admins control generation.
              </p>
            </section>
          )}

          <section className="rounded-3xl border border-[var(--border)] bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-[var(--border)] p-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Candidate queue</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Winner candidates and review status</h2>
              </div>
              <form method="get" className="flex flex-wrap gap-2">
                <input type="hidden" name="season" value={selectedSeason.id} />
                <select name="scope" defaultValue={params.scope ?? "all"} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold">
                  <option value="all">All scopes</option>
                  <option value="round">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="overall">Overall</option>
                </select>
                <select name="status" defaultValue={params.status ?? "all"} className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold">
                  <option value="all">All statuses</option>
                  <option value="provisional">Provisional</option>
                  <option value="under_review">Review required</option>
                  <option value="competition_approved">Competition approved</option>
                  <option value="compliance_approved">Compliance approved</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="rejected">Rejected</option>
                  <option value="superseded">Superseded</option>
                </select>
                <button className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-black text-white">Filter</button>
              </form>
            </div>

            {filteredCandidates.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[var(--surface-soft)] text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    <tr>
                      <th className="px-5 py-4">Candidate</th>
                      <th className="px-5 py-4">Prize / scope</th>
                      <th className="px-5 py-4">Score</th>
                      <th className="px-5 py-4">Eligibility</th>
                      <th className="px-5 py-4">Workflow</th>
                      <th className="px-5 py-4">Publication</th>
                      <th className="px-5 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {filteredCandidates.map((candidate) => {
                      const prize = candidate.prize_id ? prizeMap.get(candidate.prize_id) : undefined;
                      const round = candidate.round_id ? roundMap.get(candidate.round_id) : undefined;
                      const period = candidate.monthly_period_id ? periodMap.get(candidate.monthly_period_id) : undefined;
                      return (
                        <tr key={candidate.id} className={!candidate.is_current ? "opacity-60" : ""}>
                          <td className="px-5 py-5">
                            <p className="font-black text-[var(--brand-strong)]">{candidate.display_name_snapshot ?? "Unnamed candidate"}</p>
                            <p className="mt-1 text-xs text-[var(--muted)]">{candidate.team_name_snapshot ?? "No team name"} · Entry {candidate.provider_entry_id_snapshot ?? "—"}</p>
                            <p className="mt-1 text-xs text-[var(--muted)]">Generated {formatDate(candidate.generated_at)}</p>
                          </td>
                          <td className="px-5 py-5">
                            <p className="font-bold text-[var(--brand-strong)]">{prize?.name ?? "Prize unavailable"}</p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {candidate.scope === "round" ? round?.name ?? "Gameweek" : candidate.scope === "monthly" ? period?.name ?? "Monthly" : "Overall season"}
                            </p>
                            <p className="mt-1 text-xs text-[var(--muted)]">Position {candidate.prize_position ?? prize?.position ?? "—"}</p>
                          </td>
                          <td className="px-5 py-5">
                            <p className="text-2xl font-black text-[var(--brand-strong)]">{candidate.score}</p>
                            <p className="text-xs text-[var(--muted)]">Standing rank {candidate.rank} · selection {candidate.candidate_order ?? "—"}</p>
                          </td>
                          <td className="px-5 py-5">
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black capitalize ${statusClasses(candidate.eligibility_status)}`}>
                              {label(candidate.eligibility_status)}
                            </span>
                          </td>
                          <td className="px-5 py-5">
                            <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black capitalize ${statusClasses(candidate.status)}`}>
                              {label(candidate.status)}
                            </span>
                            <p className="mt-2 text-xs text-[var(--muted)]">Competition: {label(candidate.competition_review_status)}</p>
                            <p className="mt-1 text-xs text-[var(--muted)]">Compliance: {label(candidate.compliance_review_status)}</p>
                          </td>
                          <td className="px-5 py-5">
                            <p className={`text-xs font-black ${candidate.publication_ready ? "text-green-700" : "text-amber-700"}`}>
                              {candidate.publication_ready ? "Ready" : candidate.publicity_consent ? "Awaiting confirmation" : "Consent missing"}
                            </p>
                            {!candidate.is_current ? <p className="mt-1 text-xs font-bold text-red-700">Historical candidate</p> : null}
                          </td>
                          <td className="px-5 py-5">
                            <Link href={`/admin/winners/${candidate.id}`} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-black text-[var(--brand)] hover:bg-[var(--surface-soft)]">
                              Review
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-10 text-center">
                <h3 className="text-xl font-black text-[var(--brand-strong)]">No winner candidates match this view</h3>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Final scores, published rules and an active prize are required before generation.
                </p>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Generation history</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Audited evaluation runs</h2>
              </div>
              <p className="text-xs text-[var(--muted)]">Latest 30 runs</p>
            </div>
            {generationRuns.length ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {generationRuns.map((run) => {
                  const prize = prizeMap.get(run.prize_id);
                  return (
                    <article key={run.id} className="rounded-2xl border border-[var(--border)] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-black text-[var(--brand-strong)]">{prize?.name ?? "Prize generation"}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">{label(run.scope)} · rules v{run.rules_version}</p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black capitalize ${statusClasses(run.status)}`}>
                          {label(run.status)}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                        {[
                          ["Source", run.source_row_count],
                          ["Eligible", run.eligible_row_count],
                          ["Review", run.review_row_count],
                          ["Excluded", run.excluded_row_count],
                          ["Selected", run.generated_candidate_count],
                        ].map(([name, value]) => (
                          <div key={String(name)} className="rounded-xl bg-[var(--surface-soft)] p-3">
                            <p className="text-xs text-[var(--muted)]">{name}</p>
                            <p className="mt-1 font-black text-[var(--brand-strong)]">{value}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 text-xs text-[var(--muted)]">Completed: {formatDate(run.completed_at)}</p>
                      {run.error_summary ? <p className="mt-2 text-sm font-bold text-red-700">{run.error_summary}</p> : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="mt-5 rounded-2xl bg-[var(--surface-soft)] p-5 text-sm text-[var(--muted)]">No winner-generation run has been performed for this season.</p>
            )}
          </section>

          <section className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-blue-950">
            <h2 className="text-lg font-black">Role separation in this module</h2>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
              <p><strong>Generate and competition review:</strong> {canCompetitionReview ? "Available" : "Not available"}</p>
              <p><strong>Compliance review:</strong> {canComplianceReview ? "Available" : "Not available"}</p>
              <p><strong>Final confirmation:</strong> {canConfirm ? "Available" : "Super Admin only"}</p>
              <p><strong>Payment processing:</strong> Phase 10 only</p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
