import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  enableReadOnlyFplAction,
  runReadOnlyFplSyncAction,
  testReadOnlyFplAction,
} from "./actions";

const MANAGEMENT_ROLES = ["super_admin", "competition_manager"];

type SearchParams = Promise<{
  season?: string;
  run?: string;
  success?: string;
  error?: string;
}>;

type Season = {
  id: string;
  name: string;
  status: string;
  data_provider: string;
};

type Settings = {
  provider: string;
  is_enabled: boolean;
  sync_mode: string;
  request_timeout_seconds: number;
  last_successful_sync_at: string | null;
  last_failed_sync_at: string | null;
  config: Record<string, unknown> | null;
};

type Round = {
  id: string;
  external_round_id: number;
  name: string;
  status: string;
  is_current: boolean;
  is_final: boolean;
};

type SyncRun = {
  id: string;
  status: string;
  source_label: string | null;
  raw_record_count: number;
  accepted_record_count: number;
  rejected_record_count: number;
  warning_count: number;
  started_at: string;
  completed_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

function badge(value: string) {
  if (["succeeded", "enabled", "approved_fpl"].includes(value)) {
    return "border-green-200 bg-green-50 text-green-800";
  }
  if (["failed", "disabled"].includes(value)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--brand-strong)]";

export default async function FplConnectorPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;

  const { data: seasonRows, error: seasonError } = await db
    .from("competition_seasons")
    .select("id, name, status, data_provider")
    .order("starts_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const seasons = (seasonRows ?? []) as Season[];
  const selectedSeason = seasons.find((season) => season.id === params.season) ?? seasons[0] ?? null;

  if (!selectedSeason) {
    return (
      <div className="mx-auto max-w-5xl rounded-3xl border border-[var(--border)] bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-black text-[var(--brand-strong)]">Read-only FPL connector</h1>
        <p className="mt-4 text-[var(--muted)]">Create a competition season before enabling the connector.</p>
      </div>
    );
  }

  const [settingsResult, roundsResult, entryCountResult, runsResult] = await Promise.all([
    db
      .from("fantasy_provider_settings")
      .select(
        "provider, is_enabled, sync_mode, request_timeout_seconds, last_successful_sync_at, last_failed_sync_at, config",
      )
      .eq("competition_season_id", selectedSeason.id)
      .maybeSingle(),
    db
      .from("rounds")
      .select("id, external_round_id, name, status, is_current, is_final")
      .eq("competition_season_id", selectedSeason.id)
      .order("external_round_id"),
    db
      .from("fantasy_entries")
      .select("id, registration:registrations!inner(status, eligibility_status)", {
        count: "exact",
        head: true,
      })
      .eq("competition_season_id", selectedSeason.id)
      .eq("registrations.status", "approved")
      .eq("registrations.eligibility_status", "eligible"),
    db
      .from("provider_sync_runs")
      .select(
        "id, status, source_label, raw_record_count, accepted_record_count, rejected_record_count, warning_count, started_at, completed_at",
      )
      .eq("competition_season_id", selectedSeason.id)
      .eq("provider", "approved_fpl")
      .order("started_at", { ascending: false })
      .limit(12),
  ]);

  const settings = settingsResult.data as Settings | null;
  const rounds = (roundsResult.data ?? []) as Round[];
  const runs = (runsResult.data ?? []) as SyncRun[];
  const canManage = MANAGEMENT_ROLES.includes(admin.role);
  const isEnabled =
    selectedSeason.data_provider === "approved_fpl" &&
    settings?.provider === "approved_fpl" &&
    settings.is_enabled;
  const config = settings?.config ?? {};
  const configuredEndpoints = Array.isArray(config.allowed_endpoints)
    ? config.allowed_endpoints.map(String)
    : [];
  const preferredRound =
    rounds.find((round) => round.is_current) ??
    rounds.find((round) => !round.is_final) ??
    rounds[0] ??
    null;
  const pageError = seasonError ?? settingsResult.error ?? roundsResult.error ?? runsResult.error;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
            Read-only integration
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            Fantasy Premier League connector
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Retrieve public Gameweek history and picks, validate every record, and stage the data through the existing provider pipeline. This connector never signs in to FPL and never changes a participant&apos;s team.
          </p>
        </div>

        <form method="get" className="w-full rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm lg:max-w-sm">
          <label className="text-xs font-black uppercase tracking-[0.13em] text-[var(--brand)]">
            Competition season
            <select name="season" defaultValue={selectedSeason.id} className={inputClass}>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </label>
          <button className="mt-3 w-full rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-black text-white">
            Load connector
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

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
        <p className="font-black">Integration boundary</p>
        <p className="mt-2 max-w-4xl text-sm leading-6">
          The uploaded contract is community-maintained and the upstream endpoints can change without notice. Only public GET endpoints are enabled. Session cookies, CSRF tokens, `/me/`, `/my-team/` and transfer submission are excluded from the application.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-[var(--muted)]">Connector status</p>
          <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase ${badge(isEnabled ? "enabled" : "disabled")}`}>
            {isEnabled ? "Enabled" : "Disabled"}
          </span>
        </article>
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-[var(--muted)]">Season provider</p>
          <p className="mt-3 text-xl font-black capitalize text-[var(--brand-strong)]">
            {label(selectedSeason.data_provider)}
          </p>
        </article>
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-[var(--muted)]">Approved entries</p>
          <p className="mt-3 text-3xl font-black text-[var(--brand-strong)]">{entryCountResult.count ?? 0}</p>
        </article>
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-[var(--muted)]">FPL sync runs</p>
          <p className="mt-3 text-3xl font-black text-[var(--brand-strong)]">{runs.length}</p>
        </article>
      </section>

      <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-8">
          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-2xl font-black text-[var(--brand-strong)]">Enable and test</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Enabling changes this season to `approved_fpl`, turns on provider ingestion and stores the read-only endpoint allowlist.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <form action={enableReadOnlyFplAction}>
                <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                <button
                  disabled={!canManage}
                  className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Enable read-only FPL
                </button>
              </form>
              <form action={testReadOnlyFplAction}>
                <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                <button
                  disabled={!canManage}
                  className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-black text-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Test FPL connection
                </button>
              </form>
            </div>

            {!canManage ? (
              <p className="mt-4 text-xs font-bold text-amber-700">
                Only Super Admin and Competition Manager can enable or run the connector.
              </p>
            ) : null}

            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-3">
                <dt className="font-bold text-[var(--muted)]">Base URL</dt>
                <dd className="break-all text-right font-black text-[var(--brand-strong)]">
                  {String(config.base_url ?? "https://fantasy.premierleague.com/api")}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-3">
                <dt className="font-bold text-[var(--muted)]">Mode</dt>
                <dd className="font-black text-[var(--brand-strong)]">Read-only public GET</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-3">
                <dt className="font-bold text-[var(--muted)]">Last successful sync</dt>
                <dd className="text-right font-black text-[var(--brand-strong)]">
                  {formatDate(settings?.last_successful_sync_at ?? null)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-3">
                <dt className="font-bold text-[var(--muted)]">Last failed sync</dt>
                <dd className="text-right font-black text-[var(--brand-strong)]">
                  {formatDate(settings?.last_failed_sync_at ?? null)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-2xl font-black text-[var(--brand-strong)]">Allowed endpoints</h2>
            <div className="mt-5 space-y-2">
              {(configuredEndpoints.length
                ? configuredEndpoints
                : [
                    "/bootstrap-static/",
                    "/event-status/",
                    "/entry/{entryId}/",
                    "/entry/{entryId}/history/",
                    "/entry/{entryId}/event/{eventId}/picks/",
                  ]
              ).map((endpoint) => (
                <code key={endpoint} className="block rounded-xl bg-[#f7f9fd] px-3 py-2 text-xs font-bold text-[var(--brand-strong)]">
                  GET {endpoint}
                </code>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-8">
          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
            <h2 className="text-2xl font-black text-[var(--brand-strong)]">Retrieve Gameweek scores</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              The sync retrieves official entry history and picks, captures transfer costs and chip usage, and stages the results. It does not publish or promote the scores automatically.
            </p>

            <form action={runReadOnlyFplSyncAction} className="mt-6">
              <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
              <label className="text-xs font-black uppercase tracking-[0.13em] text-[var(--brand)]">
                Gameweek
                <select name="round_id" defaultValue={preferredRound?.id ?? ""} className={inputClass}>
                  {rounds.map((round) => (
                    <option key={round.id} value={round.id}>
                      {round.name} — {label(round.status)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={!canManage || !isEnabled || !preferredRound || (entryCountResult.count ?? 0) === 0}
                className="mt-4 w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Retrieve and stage FPL data
              </button>
            </form>

            {!isEnabled ? (
              <p className="mt-4 text-xs font-bold text-amber-700">Enable the connector before running a score sync.</p>
            ) : (entryCountResult.count ?? 0) === 0 ? (
              <p className="mt-4 text-xs font-bold text-amber-700">
                No approved and eligible entries currently exist, so a score sync cannot run yet.
              </p>
            ) : null}
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-black text-[var(--brand-strong)]">Recent FPL syncs</h2>
              <Link href={`/admin/providers?season=${selectedSeason.id}`} className="text-sm font-black text-[var(--brand)]">
                Open provider staging
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {runs.length ? (
                runs.map((run) => (
                  <article key={run.id} className="rounded-2xl border border-[var(--border)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-[var(--brand-strong)]">{run.source_label ?? "FPL sync"}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(run.started_at)}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${badge(run.status)}`}>
                        {label(run.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-xs font-bold text-[var(--muted)]">
                      Raw {run.raw_record_count} · Accepted {run.accepted_record_count} · Rejected {run.rejected_record_count} · Warnings {run.warning_count}
                    </p>
                  </article>
                ))
              ) : (
                <p className="rounded-2xl bg-[#f7f9fd] p-5 text-sm text-[var(--muted)]">
                  No read-only FPL sync has been run for this season.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
