import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  correctScoreAction,
  promoteScoresAction,
  publishLeaderboardAction,
  refreshScoreboardsAction,
  setRoundFinalityAction,
  withdrawLeaderboardAction,
} from "./actions";

type SearchParams = Promise<{
  season?: string;
  round?: string;
  success?: string;
  error?: string;
}>;

type Season = { id: string; name: string; status: string };
type Round = {
  id: string;
  external_round_id: number;
  name: string;
  status: string;
  is_current: boolean;
  is_final: boolean;
  locked_at: string | null;
};
type ProviderRun = {
  id: string;
  provider: string;
  status: string;
  source_label: string | null;
  accepted_record_count: number;
  rejected_record_count: number;
  completed_at: string | null;
};
type RoundScore = {
  id: string;
  registration_id: string;
  round_id: string;
  reported_points: number;
  effective_points: number;
  total_points: number;
  transfer_cost: number;
  chip_used: string | null;
  round_rank: number | null;
  overall_rank: number | null;
  is_provisional: boolean;
  score_status: string;
  weekly_eligible: boolean;
  eligibility_note: string | null;
  correction_count: number;
  updated_at: string;
};
type AggregateScore = {
  registration_id: string;
  effective_points: number;
  provider_total_points: number;
  gameweeks_counted: number;
  rank: number | null;
  previous_rank: number | null;
  movement: number;
  is_provisional: boolean;
};
type MonthlyPeriod = {
  id: string;
  name: string;
  start_round: number;
  end_round: number;
  status: string;
};
type Publication = {
  id: string;
  scope: string;
  round_id: string | null;
  monthly_period_id: string | null;
  title: string;
  status: string;
  revision: number;
  row_count: number;
  is_provisional: boolean;
  published_at: string;
  withdrawn_at: string | null;
};
type Entry = {
  registration_id: string;
  manager_name: string | null;
  team_name: string | null;
  provider_entry_id: string;
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "Not completed";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function movementLabel(value: number) {
  if (value > 0) return `▲ ${value}`;
  if (value < 0) return `▼ ${Math.abs(value)}`;
  return "—";
}

function statusClasses(status: string) {
  if (["completed", "succeeded", "final", "locked", "published"].includes(status)) {
    return "border-green-200 bg-green-50 text-green-800";
  }
  if (["partial", "awaiting_finalisation", "provisional", "active", "live"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (["failed", "cancelled", "withdrawn"].includes(status)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default async function LeaderboardAdminPage({ searchParams }: { searchParams: SearchParams }) {
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

  let rounds: Round[] = [];
  let providerRuns: ProviderRun[] = [];
  let monthlyPeriods: MonthlyPeriod[] = [];
  let publications: Publication[] = [];
  let promotionRuns: any[] = [];
  let roundScores: RoundScore[] = [];
  let monthlyScores: (AggregateScore & { monthly_period_id: string })[] = [];
  let seasonScores: AggregateScore[] = [];
  let entries: Entry[] = [];
  let loadError = seasonsError?.message ?? null;

  if (selectedSeasonId) {
    const [roundsResult, providerRunsResult, periodsResult, publicationsResult, promotionsResult] =
      await Promise.all([
        db
          .from("rounds")
          .select("id, external_round_id, name, status, is_current, is_final, locked_at")
          .eq("competition_season_id", selectedSeasonId)
          .order("external_round_id"),
        db
          .from("provider_sync_runs")
          .select(
            "id, provider, status, source_label, accepted_record_count, rejected_record_count, completed_at",
          )
          .eq("competition_season_id", selectedSeasonId)
          .in("status", ["succeeded", "partial"])
          .order("completed_at", { ascending: false })
          .limit(30),
        db
          .from("monthly_periods")
          .select("id, name, start_round, end_round, status")
          .eq("competition_season_id", selectedSeasonId)
          .order("start_round"),
        db
          .from("leaderboard_publications")
          .select(
            "id, scope, round_id, monthly_period_id, title, status, revision, row_count, is_provisional, published_at, withdrawn_at",
          )
          .eq("competition_season_id", selectedSeasonId)
          .order("published_at", { ascending: false })
          .limit(30),
        db
          .from("score_promotion_runs")
          .select(
            "id, round_id, provider_sync_run_id, status, source_record_count, promoted_record_count, rejected_record_count, rules_version, completed_at",
          )
          .eq("competition_season_id", selectedSeasonId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    rounds = (roundsResult.data ?? []) as Round[];
    providerRuns = (providerRunsResult.data ?? []) as ProviderRun[];
    monthlyPeriods = (periodsResult.data ?? []) as MonthlyPeriod[];
    publications = (publicationsResult.data ?? []) as Publication[];
    promotionRuns = promotionsResult.data ?? [];
    loadError =
      loadError ??
      roundsResult.error?.message ??
      providerRunsResult.error?.message ??
      periodsResult.error?.message ??
      publicationsResult.error?.message ??
      promotionsResult.error?.message ??
      null;
  }

  const selectedRoundId = rounds.some((round) => round.id === params.round)
    ? params.round!
    : rounds.find((round) => round.is_current)?.id ?? rounds[0]?.id;
  const selectedRound = rounds.find((round) => round.id === selectedRoundId);

  if (selectedSeasonId) {
    const periodIds = monthlyPeriods.map((period) => period.id);
    const [roundScoresResult, seasonScoresResult, monthlyScoresResult] = await Promise.all([
      selectedRoundId
        ? db
            .from("round_scores")
            .select(
              "id, registration_id, round_id, reported_points, effective_points, total_points, transfer_cost, chip_used, round_rank, overall_rank, is_provisional, score_status, weekly_eligible, eligibility_note, correction_count, updated_at",
            )
            .eq("round_id", selectedRoundId)
            .order("round_rank", { ascending: true, nullsFirst: false })
            .limit(200)
        : Promise.resolve({ data: [], error: null }),
      db
        .from("season_scores")
        .select(
          "registration_id, effective_points, provider_total_points, gameweeks_counted, rank, previous_rank, movement, is_provisional",
        )
        .eq("competition_season_id", selectedSeasonId)
        .order("rank", { ascending: true, nullsFirst: false })
        .limit(200),
      periodIds.length
        ? db
            .from("monthly_scores")
            .select(
              "monthly_period_id, registration_id, effective_points, provider_total_points, gameweeks_counted, rank, previous_rank, movement, is_provisional",
            )
            .in("monthly_period_id", periodIds)
            .order("rank", { ascending: true, nullsFirst: false })
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
    ]);

    roundScores = (roundScoresResult.data ?? []) as RoundScore[];
    seasonScores = (seasonScoresResult.data ?? []) as AggregateScore[];
    monthlyScores = (monthlyScoresResult.data ?? []) as (AggregateScore & {
      monthly_period_id: string;
    })[];
    loadError =
      loadError ??
      roundScoresResult.error?.message ??
      seasonScoresResult.error?.message ??
      monthlyScoresResult.error?.message ??
      null;

    const registrationIds = Array.from(
      new Set([
        ...roundScores.map((score) => score.registration_id),
        ...seasonScores.map((score) => score.registration_id),
        ...monthlyScores.map((score) => score.registration_id),
      ]),
    );
    if (registrationIds.length) {
      const { data, error } = await db
        .from("fantasy_entries")
        .select("registration_id, manager_name, team_name, provider_entry_id")
        .in("registration_id", registrationIds);
      entries = (data ?? []) as Entry[];
      loadError = loadError ?? error?.message ?? null;
    }
  }

  const entryMap = new Map(entries.map((entry) => [entry.registration_id, entry]));
  const roundMap = new Map(rounds.map((round) => [round.id, round]));
  const periodMap = new Map(monthlyPeriods.map((period) => [period.id, period]));
  const canManage = ["super_admin", "competition_manager"].includes(admin.role);
  const canPublish = ["super_admin", "competition_manager", "content_manager"].includes(admin.role);
  const provisionalCount = roundScores.filter((score) => score.is_provisional).length;
  const latestOverall = seasonScores.slice(0, 10);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">Phase 8</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            Scores and leaderboards
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Promote validated provider records, apply competition rules, review corrections, finalise Gameweeks and publish versioned public standings.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/leaderboards"
            className="rounded-xl border border-[var(--border)] bg-white px-5 py-3 text-center text-sm font-black text-[var(--brand)]"
          >
            View public leaderboard
          </Link>
          {seasons.length ? (
            <form method="get" className="flex rounded-xl border border-[var(--border)] bg-white p-1">
              <select name="season" defaultValue={selectedSeasonId} className="min-w-64 rounded-lg px-3 py-2 text-sm font-bold">
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>{season.name}</option>
                ))}
              </select>
              <button className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-black text-white">Load</button>
            </form>
          ) : null}
        </div>
      </div>

      {params.success ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">{params.success}</div>
      ) : null}
      {params.error || loadError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">{params.error ?? loadError}</div>
      ) : null}

      {!selectedSeason ? (
        <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white p-10 text-center">
          <h2 className="text-2xl font-black text-[var(--brand-strong)]">No competition season available</h2>
          <p className="mt-3 text-[var(--muted)]">Create a competition season before calculating scores.</p>
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Gameweeks", rounds.length, "Configured rounds"],
              ["Provider runs", providerRuns.length, "Ready for promotion"],
              ["Provisional", provisionalCount, selectedRound?.name ?? "Selected round"],
              ["Publications", publications.filter((item) => item.status === "published").length, "Currently visible"],
            ].map(([title, value, description]) => (
              <article key={String(title)} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">{title}</p>
                <p className="mt-3 text-4xl font-black text-[var(--brand-strong)]">{value}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-3">
            <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">1. Promote provider data</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Create Gameweek scores</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Only validated records belonging to approved and eligible participants are promoted.</p>
              {canManage ? (
                <form action={promoteScoresAction} className="mt-5 space-y-4">
                  <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                  <label className="block text-sm font-bold text-[var(--brand-strong)]">Gameweek
                    <select name="round_id" defaultValue={selectedRoundId} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-3">
                      {rounds.map((round) => <option key={round.id} value={round.id}>{round.name} · {label(round.status)}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm font-bold text-[var(--brand-strong)]">Provider run
                    <select name="provider_sync_run_id" required className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-3">
                      <option value="">Select a completed run</option>
                      {providerRuns.map((run) => (
                        <option key={run.id} value={run.id}>{run.provider} · {run.accepted_record_count} accepted · {formatDate(run.completed_at)}</option>
                      ))}
                    </select>
                  </label>
                  <button disabled={!rounds.length || !providerRuns.length} className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Promote and calculate</button>
                </form>
              ) : <p className="mt-5 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-[var(--muted)]">Your role has review-only access.</p>}
            </article>

            <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">2. Review and finalise</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">{selectedRound?.name ?? "Select a Gameweek"}</h2>
              <form method="get" className="mt-5 flex gap-2">
                <input type="hidden" name="season" value={selectedSeason.id} />
                <select name="round" defaultValue={selectedRoundId} className="min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 py-3 text-sm font-bold">
                  {rounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
                </select>
                <button className="rounded-xl border border-[var(--border)] px-4 text-sm font-black text-[var(--brand)]">Review</button>
              </form>
              {selectedRound ? (
                <div className="mt-5 space-y-4">
                  <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${statusClasses(selectedRound.status)}`}>{label(selectedRound.status)}</div>
                  <p className="text-sm text-[var(--muted)]">{roundScores.length} score record(s) · {provisionalCount} provisional</p>
                  {canManage ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <form action={refreshScoreboardsAction}>
                        <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                        <button className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-black text-[var(--brand)]">Refresh all rankings</button>
                      </form>
                      <form action={setRoundFinalityAction}>
                        <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                        <input type="hidden" name="round_id" value={selectedRound.id} />
                        <input type="hidden" name="final" value={selectedRound.is_final ? "false" : "true"} />
                        <button disabled={!roundScores.length || selectedRound.status === "locked"} className="w-full rounded-xl bg-[var(--brand-strong)] px-4 py-3 text-sm font-black text-white disabled:opacity-40">
                          {selectedRound.is_final ? "Reopen scores" : "Finalise scores"}
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>

            <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">3. Publish a snapshot</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Public leaderboard</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Publishing creates an immutable, privacy-safe snapshot containing only entries with publicity consent.</p>
              {canPublish ? (
                <form action={publishLeaderboardAction} className="mt-5 space-y-3">
                  <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                  <select name="scope" className="w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm font-bold">
                    <option value="round">Gameweek</option>
                    <option value="monthly">Monthly</option>
                    <option value="overall">Overall</option>
                  </select>
                  <select name="round_id" defaultValue={selectedRoundId} className="w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm">
                    <option value="">Gameweek target</option>
                    {rounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
                  </select>
                  <select name="monthly_period_id" className="w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm">
                    <option value="">Monthly target</option>
                    {monthlyPeriods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                  </select>
                  <input name="title" required placeholder="Publication title" className="w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm" />
                  <textarea name="notes" rows={2} placeholder="Optional publication notes" className="w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm" />
                  <p className="text-xs leading-5 text-[var(--muted)]">For overall, leave both target selectors unused. For monthly, choose a monthly target. For Gameweek, choose a Gameweek target.</p>
                  <button className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-black text-[var(--brand-strong)]">Publish leaderboard</button>
                </form>
              ) : <p className="mt-5 rounded-xl bg-[var(--surface-soft)] p-4 text-sm text-[var(--muted)]">Your role cannot publish leaderboard snapshots.</p>}
            </article>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white shadow-sm">
            <div className="border-b border-[var(--border)] px-6 py-5">
              <h2 className="text-2xl font-black text-[var(--brand-strong)]">{selectedRound?.name ?? "Gameweek"} standings</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Effective points include transfer deductions when enabled by the published rules.</p>
            </div>
            {roundScores.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-sm">
                  <thead className="bg-[var(--surface-soft)] text-xs uppercase tracking-[0.1em] text-[var(--muted)]">
                    <tr><th className="px-5 py-4">Rank</th><th className="px-5 py-4">Manager / Team</th><th className="px-5 py-4">Reported</th><th className="px-5 py-4">Transfer</th><th className="px-5 py-4">Effective</th><th className="px-5 py-4">Chip</th><th className="px-5 py-4">Eligibility</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Correction</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {roundScores.map((score) => {
                      const entry = entryMap.get(score.registration_id);
                      return (
                        <tr key={score.id} className="align-top">
                          <td className="px-5 py-4 text-lg font-black text-[var(--brand)]">{score.round_rank ?? "—"}</td>
                          <td className="px-5 py-4"><p className="font-black text-[var(--brand-strong)]">{entry?.manager_name ?? "Manager pending"}</p><p className="mt-1 text-xs text-[var(--muted)]">{entry?.team_name ?? "Team pending"} · Entry {entry?.provider_entry_id ?? "—"}</p></td>
                          <td className="px-5 py-4 font-bold">{score.reported_points}</td>
                          <td className="px-5 py-4">-{score.transfer_cost}</td>
                          <td className="px-5 py-4 text-lg font-black text-[var(--brand-strong)]">{score.effective_points}</td>
                          <td className="px-5 py-4">{score.chip_used ?? "—"}</td>
                          <td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-black ${score.weekly_eligible ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>{score.weekly_eligible ? "Eligible" : "Excluded"}</span></td>
                          <td className="px-5 py-4"><span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClasses(score.score_status)}`}>{label(score.score_status)}</span><p className="mt-2 text-xs text-[var(--muted)]">{score.correction_count} correction(s)</p></td>
                          <td className="px-5 py-4">
                            {canManage ? (
                              <details className="w-64">
                                <summary className="cursor-pointer text-xs font-black text-[var(--brand)]">Edit with audit reason</summary>
                                <form action={correctScoreAction} className="mt-3 grid gap-2">
                                  <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                                  <input type="hidden" name="round_id" value={score.round_id} />
                                  <input type="hidden" name="round_score_id" value={score.id} />
                                  <input name="reported_points" type="number" defaultValue={score.reported_points} className="rounded-lg border border-[var(--border)] px-3 py-2" aria-label="Reported points" />
                                  <input name="total_points" type="number" defaultValue={score.total_points} className="rounded-lg border border-[var(--border)] px-3 py-2" aria-label="Total points" />
                                  <input name="transfer_cost" type="number" min="0" defaultValue={score.transfer_cost} className="rounded-lg border border-[var(--border)] px-3 py-2" aria-label="Transfer cost" />
                                  <input name="chip_used" defaultValue={score.chip_used ?? ""} placeholder="Chip used" className="rounded-lg border border-[var(--border)] px-3 py-2" />
                                  <textarea name="reason" required minLength={8} rows={2} placeholder="Correction reason" className="rounded-lg border border-[var(--border)] px-3 py-2" />
                                  <button className="rounded-lg bg-[var(--brand)] px-3 py-2 text-xs font-black text-white">Apply correction</button>
                                </form>
                              </details>
                            ) : "Review only"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <div className="p-10 text-center text-[var(--muted)]">No promoted scores exist for this Gameweek. Complete participant approval and provider ingestion first.</div>}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <article className="rounded-3xl border border-[var(--border)] bg-white shadow-sm">
              <div className="border-b border-[var(--border)] px-6 py-5"><h2 className="text-2xl font-black text-[var(--brand-strong)]">Overall standings</h2></div>
              {latestOverall.length ? (
                <div className="divide-y divide-[var(--border)]">
                  {latestOverall.map((score) => {
                    const entry = entryMap.get(score.registration_id);
                    return <div key={score.registration_id} className="grid grid-cols-[60px_1fr_auto_auto] items-center gap-4 px-6 py-4"><span className="text-xl font-black text-[var(--brand)]">{score.rank ?? "—"}</span><span><span className="block font-black text-[var(--brand-strong)]">{entry?.manager_name ?? entry?.team_name ?? "Manager"}</span><span className="text-xs text-[var(--muted)]">{entry?.team_name ?? "Team"} · {score.gameweeks_counted} GW</span></span><span className="text-xs font-black text-[var(--muted)]">{movementLabel(score.movement)}</span><span className="text-xl font-black text-[var(--brand-strong)]">{score.effective_points}</span></div>;
                  })}
                </div>
              ) : <div className="p-8 text-center text-[var(--muted)]">Overall standings appear after the first promotion.</div>}
            </article>

            <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-black text-[var(--brand-strong)]">Monthly periods</h2>
              <div className="mt-5 space-y-3">
                {monthlyPeriods.length ? monthlyPeriods.map((period) => {
                  const rows = monthlyScores.filter((score) => score.monthly_period_id === period.id);
                  return <div key={period.id} className="rounded-2xl bg-[var(--surface-soft)] p-4"><div className="flex items-center justify-between"><p className="font-black text-[var(--brand-strong)]">{period.name}</p><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusClasses(period.status)}`}>{label(period.status)}</span></div><p className="mt-2 text-xs text-[var(--muted)]">GW{period.start_round}–GW{period.end_round} · {rows.length} ranked entries</p>{rows[0] ? <p className="mt-3 text-sm font-bold text-[var(--brand)]">Leader: {entryMap.get(rows[0].registration_id)?.team_name ?? "Manager"} · {rows[0].effective_points} pts</p> : null}</div>;
                }) : <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">Create monthly periods in Competition Operations.</p>}
              </div>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <article className="rounded-3xl border border-[var(--border)] bg-white shadow-sm">
              <div className="border-b border-[var(--border)] px-6 py-5"><h2 className="text-2xl font-black text-[var(--brand-strong)]">Promotion history</h2></div>
              <div className="divide-y divide-[var(--border)]">
                {promotionRuns.length ? promotionRuns.map((run) => <div key={run.id} className="px-6 py-4"><div className="flex items-center justify-between gap-4"><p className="font-black text-[var(--brand-strong)]">{roundMap.get(run.round_id)?.name ?? "Gameweek"}</p><span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClasses(run.status)}`}>{label(run.status)}</span></div><p className="mt-2 text-xs text-[var(--muted)]">{run.promoted_record_count}/{run.source_record_count} promoted · {run.rejected_record_count} rejected · Rules v{run.rules_version}</p></div>) : <p className="p-8 text-center text-sm text-[var(--muted)]">No promotion runs yet.</p>}
              </div>
            </article>

            <article className="rounded-3xl border border-[var(--border)] bg-white shadow-sm">
              <div className="border-b border-[var(--border)] px-6 py-5"><h2 className="text-2xl font-black text-[var(--brand-strong)]">Publication history</h2></div>
              <div className="divide-y divide-[var(--border)]">
                {publications.length ? publications.map((publication) => <div key={publication.id} className="px-6 py-4"><div className="flex items-start justify-between gap-4"><div><p className="font-black text-[var(--brand-strong)]">{publication.title}</p><p className="mt-1 text-xs text-[var(--muted)]">{label(publication.scope)} · Revision {publication.revision} · {publication.row_count} rows · {formatDate(publication.published_at)}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClasses(publication.status)}`}>{label(publication.status)}</span></div>{publication.status === "published" && canPublish ? <details className="mt-3"><summary className="cursor-pointer text-xs font-black text-red-700">Withdraw publication</summary><form action={withdrawLeaderboardAction} className="mt-3 flex gap-2"><input type="hidden" name="competition_season_id" value={selectedSeason.id} /><input type="hidden" name="publication_id" value={publication.id} /><input name="reason" required minLength={8} placeholder="Withdrawal reason" className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm" /><button className="rounded-lg bg-red-700 px-3 py-2 text-xs font-black text-white">Withdraw</button></form></details> : null}</div>) : <p className="p-8 text-center text-sm text-[var(--muted)]">No leaderboard publications yet.</p>}
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
