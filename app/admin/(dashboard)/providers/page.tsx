import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  retryProviderRunAction,
  runMockProviderAction,
  updateProviderSettingsAction,
  uploadCsvProviderAction,
} from "./actions";

const PROVIDERS = ["mock", "csv", "approved_fpl", "licensed"] as const;
const MANAGEMENT_ROLES = ["super_admin", "competition_manager"];

type SearchParams = Promise<{
  season?: string;
  run?: string;
  success?: string;
  error?: string;
}>;

type CompetitionSeason = {
  id: string;
  name: string;
  status: string;
  data_provider: string;
  external_league_id: string | null;
};

type ProviderSettings = {
  id: string;
  provider: string;
  is_enabled: boolean;
  sync_mode: string;
  schedule_cron: string | null;
  max_attempts: number;
  request_timeout_seconds: number;
  last_successful_sync_at: string | null;
  last_failed_sync_at: string | null;
  updated_at: string;
};

type Round = {
  id: string;
  external_round_id: number;
  name: string;
  status: string;
  is_current: boolean;
};

type SyncRun = {
  id: string;
  provider: string;
  trigger_source: string;
  status: string;
  source_label: string | null;
  attempt_number: number;
  parent_run_id: string | null;
  raw_record_count: number;
  accepted_record_count: number;
  rejected_record_count: number;
  warning_count: number;
  error_summary: string | null;
  started_at: string;
  completed_at: string | null;
  requester: { full_name: string; role: string } | null;
};

type SyncError = {
  id: number;
  provider_entry_id: string | null;
  external_round_id: number | null;
  stage: string;
  error_code: string;
  message: string;
  retriable: boolean;
  attempt_number: number;
  created_at: string;
};

type StagedRecord = {
  id: string;
  provider_entry_id: string | null;
  external_round_id: number | null;
  manager_name: string | null;
  team_name: string | null;
  reported_points: number | null;
  total_points: number | null;
  transfer_cost: number;
  chip_used: string | null;
  validation_status: string;
  validation_errors: unknown;
  imported_at: string;
};

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

function badgeClasses(value: string) {
  if (["succeeded", "valid", "active", "enabled"].includes(value)) {
    return "border-green-200 bg-green-50 text-green-800";
  }
  if (["failed", "rejected", "disabled", "cancelled"].includes(value)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (["partial", "warning", "running", "queued"].includes(value)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--brand-strong)]";
const labelClass = "text-xs font-black uppercase tracking-[0.13em] text-[var(--brand)]";

export default async function ProvidersPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;

  const { data: seasonRows, error: seasonsError } = await db
    .from("competition_seasons")
    .select("id, name, status, data_provider, external_league_id")
    .order("created_at", { ascending: false });
  const seasons = (seasonRows ?? []) as CompetitionSeason[];
  const selectedSeason =
    seasons.find((season) => season.id === params.season) ?? seasons[0] ?? null;

  if (!selectedSeason) {
    return (
      <div className="mx-auto max-w-6xl rounded-3xl border border-[var(--border)] bg-white p-8 shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-[var(--brand)]">Phase 7</p>
        <h1 className="mt-3 text-3xl font-black text-[var(--brand-strong)]">Fantasy data providers</h1>
        <p className="mt-4 text-[var(--muted)]">Create a competition season before configuring a fantasy data provider.</p>
      </div>
    );
  }

  const [settingsResult, roundsResult, runsResult, runCountResult, snapshotCountResult, stagingCountResult, errorCountResult, eligibleEntriesResult] =
    await Promise.all([
      db
        .from("fantasy_provider_settings")
        .select(
          "id, provider, is_enabled, sync_mode, schedule_cron, max_attempts, request_timeout_seconds, last_successful_sync_at, last_failed_sync_at, updated_at",
        )
        .eq("competition_season_id", selectedSeason.id)
        .maybeSingle(),
      db
        .from("rounds")
        .select("id, external_round_id, name, status, is_current")
        .eq("competition_season_id", selectedSeason.id)
        .order("external_round_id"),
      db
        .from("provider_sync_runs")
        .select(
          "id, provider, trigger_source, status, source_label, attempt_number, parent_run_id, raw_record_count, accepted_record_count, rejected_record_count, warning_count, error_summary, started_at, completed_at, requester:admin_profiles!provider_sync_runs_requested_by_fkey(full_name, role)",
        )
        .eq("competition_season_id", selectedSeason.id)
        .order("started_at", { ascending: false })
        .limit(20),
      db
        .from("provider_sync_runs")
        .select("id", { count: "exact", head: true })
        .eq("competition_season_id", selectedSeason.id),
      db
        .from("score_snapshots")
        .select("id", { count: "exact", head: true })
        .eq("competition_season_id", selectedSeason.id),
      db
        .from("provider_score_records")
        .select("id", { count: "exact", head: true })
        .eq("competition_season_id", selectedSeason.id),
      db
        .from("provider_sync_errors")
        .select("id", { count: "exact", head: true })
        .eq("competition_season_id", selectedSeason.id),
      db
        .from("fantasy_entries")
        .select("id, registration:registrations!inner(status, eligibility_status)", {
          count: "exact",
          head: true,
        })
        .eq("competition_season_id", selectedSeason.id)
        .eq("registrations.status", "approved")
        .eq("registrations.eligibility_status", "eligible"),
    ]);

  const settings = settingsResult.data as ProviderSettings | null;
  const rounds = (roundsResult.data ?? []) as Round[];
  const runs = (runsResult.data ?? []) as SyncRun[];
  const selectedRun = runs.find((run) => run.id === params.run) ?? runs[0] ?? null;

  const [errorsResult, recordsResult] = selectedRun
    ? await Promise.all([
        db
          .from("provider_sync_errors")
          .select(
            "id, provider_entry_id, external_round_id, stage, error_code, message, retriable, attempt_number, created_at",
          )
          .eq("sync_run_id", selectedRun.id)
          .order("created_at", { ascending: false })
          .limit(50),
        db
          .from("provider_score_records")
          .select(
            "id, provider_entry_id, external_round_id, manager_name, team_name, reported_points, total_points, transfer_cost, chip_used, validation_status, validation_errors, imported_at",
          )
          .eq("sync_run_id", selectedRun.id)
          .order("external_round_id")
          .order("provider_entry_id")
          .limit(100),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  const errors = (errorsResult.data ?? []) as SyncError[];
  const records = (recordsResult.data ?? []) as StagedRecord[];
  const canManage = MANAGEMENT_ROLES.includes(admin.role);
  const provider = settings?.provider ?? selectedSeason.data_provider;
  const pageError =
    seasonsError ??
    settingsResult.error ??
    roundsResult.error ??
    runsResult.error ??
    errorsResult.error ??
    recordsResult.error;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">Phase 7</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            Fantasy data providers
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Import, validate and preserve fantasy data before it reaches scoring. Provider records remain in staging until Phase 8 promotes approved data into leaderboards.
          </p>
        </div>
        <form method="get" className="w-full rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm lg:max-w-sm">
          <label>
            <span className={labelClass}>Competition season</span>
            <select name="season" defaultValue={selectedSeason.id} className={inputClass}>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </label>
          <button className="mt-3 w-full rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-black text-white">
            Load provider workspace
          </button>
        </form>
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
      {pageError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
          {pageError.message}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [provider.toUpperCase(), "Configured provider"],
          [eligibleEntriesResult.count ?? 0, "Approved entries"],
          [runCountResult.count ?? 0, "Sync runs"],
          [snapshotCountResult.count ?? 0, "Raw snapshots"],
          [stagingCountResult.count ?? 0, "Staged records"],
        ].map(([value, title]) => (
          <article key={String(title)} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <p className="text-3xl font-black text-[var(--brand-strong)]">{value}</p>
            <p className="mt-2 text-sm font-bold text-[var(--muted)]">{title}</p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <p className="font-black">Staging boundary</p>
        <p className="mt-2 leading-6">
          A successful provider run does not publish points or change rankings. Raw snapshots and normalized records are append-only. Phase 8 will add a separate reviewed promotion step into round scores.
        </p>
      </section>

      <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-8">
          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Configuration</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Season provider settings</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${badgeClasses(settings?.is_enabled ? "enabled" : "disabled")}`}>
                {settings?.is_enabled ? "enabled" : "disabled"}
              </span>
            </div>

            <form action={updateProviderSettingsAction} className="mt-6 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
              <label>
                <span className={labelClass}>Provider</span>
                <select name="provider" defaultValue={provider} disabled={!canManage} className={inputClass}>
                  {PROVIDERS.map((option) => (
                    <option key={option} value={option}>
                      {label(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelClass}>Sync mode</span>
                <select name="sync_mode" defaultValue={settings?.sync_mode ?? "manual"} disabled={!canManage} className={inputClass}>
                  <option value="manual">Manual</option>
                  <option value="scheduled">Scheduled</option>
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className={labelClass}>Schedule cron</span>
                <input
                  name="schedule_cron"
                  defaultValue={settings?.schedule_cron ?? ""}
                  placeholder="0 * * * *"
                  disabled={!canManage}
                  className={inputClass}
                />
                <span className="mt-1 block text-xs text-[var(--muted)]">Stored for later scheduler activation. CSV always remains manual.</span>
              </label>
              <label>
                <span className={labelClass}>Maximum attempts</span>
                <input name="max_attempts" type="number" min="1" max="10" defaultValue={settings?.max_attempts ?? 3} disabled={!canManage} className={inputClass} />
              </label>
              <label>
                <span className={labelClass}>Request timeout</span>
                <input name="request_timeout_seconds" type="number" min="5" max="120" defaultValue={settings?.request_timeout_seconds ?? 30} disabled={!canManage} className={inputClass} />
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-4 sm:col-span-2">
                <input name="is_enabled" type="checkbox" defaultChecked={settings?.is_enabled ?? true} disabled={!canManage} />
                <span className="text-sm font-black text-[var(--brand-strong)]">Enable provider ingestion for this season</span>
              </label>
              {canManage ? (
                <button className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white sm:col-span-2">
                  Save provider settings
                </button>
              ) : (
                <p className="text-sm text-[var(--muted)] sm:col-span-2">Your administrator role has read-only access.</p>
              )}
            </form>

            <div className="mt-5 grid gap-3 text-xs text-[var(--muted)] sm:grid-cols-2">
              <p>Last successful sync: <strong>{formatDate(settings?.last_successful_sync_at ?? null)}</strong></p>
              <p>Last failed sync: <strong>{formatDate(settings?.last_failed_sync_at ?? null)}</strong></p>
            </div>
          </section>

          {provider === "mock" ? (
            <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Mock provider</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Generate deterministic test data</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                Mock records are generated only for approved eligible entries and are blocked once the competition becomes active.
              </p>
              <form action={runMockProviderAction} className="mt-5">
                <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                <label>
                  <span className={labelClass}>Round</span>
                  <select name="round_id" required disabled={!canManage || !rounds.length} className={inputClass}>
                    <option value="">Select a round</option>
                    {rounds.map((round) => (
                      <option key={round.id} value={round.id}>
                        GW{round.external_round_id} — {round.name} ({label(round.status)})
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={!canManage || !rounds.length} className="mt-4 w-full rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                  Run mock provider
                </button>
              </form>
            </section>
          ) : null}

          {provider === "csv" ? (
            <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">CSV provider</p>
                  <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Upload provider records</h2>
                </div>
                <Link href="/admin/providers/template" className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-black text-[var(--brand)]">
                  Download template
                </Link>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                Maximum 2 MB and 5,000 data rows. Invalid rows are retained as rejected staging records with detailed validation errors.
              </p>
              <form action={uploadCsvProviderAction} className="mt-5">
                <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                <input name="csv_file" type="file" accept=".csv,text/csv" required disabled={!canManage} className={inputClass} />
                <button disabled={!canManage} className="mt-4 w-full rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                  Import and validate CSV
                </button>
              </form>
            </section>
          ) : null}

          {["approved_fpl", "licensed"].includes(provider) ? (
            <section className="rounded-3xl border border-blue-200 bg-blue-50 p-6 text-sm text-blue-950">
              <p className="font-black">External provider connector not activated</p>
              <p className="mt-2 leading-6">
                The database and provider contract support this selection, but network fetching remains disabled until Vult has written permission, credentials and an approved data agreement. Secrets will be stored server-side, never in season settings.
              </p>
            </section>
          ) : null}
        </div>

        <div className="space-y-8">
          <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[var(--border)] p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Execution history</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Recent provider syncs</h2>
              </div>
              <span className="rounded-full bg-[#f4f6fb] px-3 py-1 text-xs font-black text-[var(--muted)]">
                {errorCountResult.count ?? 0} logged issues
              </span>
            </div>

            {runs.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#f7f8fc] text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                    <tr>
                      <th className="px-5 py-3">Run</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Records</th>
                      <th className="px-5 py-3">Started</th>
                      <th className="px-5 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {runs.map((run) => (
                      <tr key={run.id} className={selectedRun?.id === run.id ? "bg-blue-50/50" : ""}>
                        <td className="px-5 py-4">
                          <Link href={`/admin/providers?season=${selectedSeason.id}&run=${run.id}`} className="font-black text-[var(--brand)]">
                            {run.source_label ?? `${label(run.provider)} sync`}
                          </Link>
                          <p className="mt-1 text-xs text-[var(--muted)]">{label(run.trigger_source)} · attempt {run.attempt_number}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${badgeClasses(run.status)}`}>
                            {label(run.status)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-[var(--muted)]">
                          <p>{run.accepted_record_count} accepted</p>
                          <p>{run.rejected_record_count} rejected · {run.warning_count} warnings</p>
                        </td>
                        <td className="px-5 py-4 text-xs text-[var(--muted)]">{formatDate(run.started_at)}</td>
                        <td className="px-5 py-4">
                          {canManage && ["failed", "partial"].includes(run.status) && run.attempt_number < (settings?.max_attempts ?? 3) ? (
                            <form action={retryProviderRunAction}>
                              <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                              <input type="hidden" name="run_id" value={run.id} />
                              <button className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-black text-[var(--brand)]">Retry</button>
                            </form>
                          ) : (
                            <span className="text-xs text-[var(--muted)]">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-[var(--muted)]">No provider sync has been run for this season.</div>
            )}
          </section>

          {selectedRun ? (
            <>
              <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Selected run</p>
                    <h2 className="mt-2 text-xl font-black text-[var(--brand-strong)]">{selectedRun.source_label ?? selectedRun.id}</h2>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${badgeClasses(selectedRun.status)}`}>
                    {label(selectedRun.status)}
                  </span>
                </div>
                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  <p><span className="text-[var(--muted)]">Provider:</span> <strong>{label(selectedRun.provider)}</strong></p>
                  <p><span className="text-[var(--muted)]">Requested by:</span> <strong>{selectedRun.requester?.full_name ?? "System/service role"}</strong></p>
                  <p><span className="text-[var(--muted)]">Started:</span> <strong>{formatDate(selectedRun.started_at)}</strong></p>
                  <p><span className="text-[var(--muted)]">Completed:</span> <strong>{formatDate(selectedRun.completed_at)}</strong></p>
                </div>
                {selectedRun.error_summary ? <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-800">{selectedRun.error_summary}</p> : null}
              </section>

              <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
                <div className="border-b border-[var(--border)] p-6">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Staging preview</p>
                  <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Normalized provider records</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">Showing up to 100 records from this immutable batch.</p>
                </div>
                {records.length ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-[#f7f8fc] text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
                        <tr>
                          <th className="px-5 py-3">Entry</th>
                          <th className="px-5 py-3">Round</th>
                          <th className="px-5 py-3">Points</th>
                          <th className="px-5 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {records.map((record) => (
                          <tr key={record.id}>
                            <td className="px-5 py-4">
                              <p className="font-black text-[var(--brand-strong)]">{record.provider_entry_id ?? "Missing Entry ID"}</p>
                              <p className="mt-1 text-xs text-[var(--muted)]">{record.team_name ?? record.manager_name ?? "No team details"}</p>
                            </td>
                            <td className="px-5 py-4">{record.external_round_id ? `GW${record.external_round_id}` : "—"}</td>
                            <td className="px-5 py-4">
                              <p className="font-black">{record.reported_points ?? "—"}</p>
                              <p className="text-xs text-[var(--muted)]">Total {record.total_points ?? "—"} · Cost {record.transfer_cost}</p>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${badgeClasses(record.validation_status)}`}>
                                {label(record.validation_status)}
                              </span>
                              {stringArray(record.validation_errors).length ? (
                                <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--muted)]">{stringArray(record.validation_errors).join(" · ")}</p>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-[var(--muted)]">This run has no staged records.</div>
                )}
              </section>

              <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Validation log</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Errors and warnings</h2>
                {errors.length ? (
                  <div className="mt-5 space-y-3">
                    {errors.map((issue) => (
                      <article key={issue.id} className="rounded-2xl border border-[var(--border)] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-black text-[var(--brand-strong)]">{issue.error_code}</p>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${issue.retriable ? badgeClasses("failed") : badgeClasses("warning")}`}>
                            {issue.retriable ? "retriable" : "review"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{issue.message}</p>
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          {issue.provider_entry_id ?? "No Entry ID"} · {issue.external_round_id ? `GW${issue.external_round_id}` : "No round"} · {label(issue.stage)}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-800">No validation issues were recorded for this run.</p>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
