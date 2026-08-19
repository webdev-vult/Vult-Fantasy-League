import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import {
  canViewAudit,
  loadAuditHistory,
  loadExportHistory,
  loadReportingDashboard,
  type CountBreakdown,
} from "@/lib/admin/reports";

type SearchParams = Promise<{
  season?: string;
  tab?: string;
  q?: string;
  action?: string;
  entity?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: string;
}>;

const TABS = ["overview", "operations", "comparison", "spending", "exports", "audit"] as const;

function label(value: string) {
  return value.replaceAll("_", " ");
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: unknown) {
  return new Intl.NumberFormat("en").format(number(value));
}

function formatMoney(value: unknown, currency?: string) {
  const amount = number(value);
  if (!currency) return formatNumber(amount);
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en", { maximumFractionDigits: 2 })}`;
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function tabHref(tab: string, season?: string) {
  const params = new URLSearchParams({ tab });
  if (season) params.set("season", season);
  return `/admin/reports?${params.toString()}`;
}

function exportHref(type: string, season?: string, extra?: Record<string, string | undefined>) {
  const params = new URLSearchParams({ type });
  if (season) params.set("season", season);
  Object.entries(extra ?? {}).forEach(([key, value]) => value && params.set(key, value));
  return `/admin/reports/export?${params.toString()}`;
}

function BreakdownCard({ title, rows }: { title: string; rows: CountBreakdown[] }) {
  const max = Math.max(1, ...rows.map((row) => number(row.count)));
  return (
    <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
      <h3 className="text-lg font-black text-[var(--brand-strong)]">{title}</h3>
      {rows.length ? (
        <div className="mt-5 space-y-4">
          {rows.map((row, index) => {
            const name = row.status ?? row.category ?? row.channel ?? "Unknown";
            const width = Math.max(4, (number(row.count) / max) * 100);
            return (
              <div key={`${name}-${row.currency ?? ""}-${index}`}>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-bold capitalize text-[var(--brand-strong)]">{label(name)}</span>
                  <span className="font-black text-[var(--brand)]">{formatNumber(row.count)}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf1f8]">
                  <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${width}%` }} />
                </div>
                {row.currency ? (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {formatMoney(row.amount, row.currency)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-[var(--muted)]">No records are available for this season yet.</p>
      )}
    </article>
  );
}

function MetricCard({ label: metricLabel, value, note }: { label: string; value: unknown; note: string }) {
  return (
    <article className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.13em] text-[var(--muted)]">{metricLabel}</p>
      <p className="mt-3 text-3xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">{formatNumber(value)}</p>
      <p className="mt-2 text-xs font-semibold text-[var(--muted)]">{note}</p>
    </article>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const auditAllowed = canViewAudit(admin);
  const requestedTab = TABS.includes((query.tab ?? "overview") as (typeof TABS)[number]) ? query.tab ?? "overview" : "overview";
  const tab = requestedTab === "audit" && !auditAllowed ? "overview" : requestedTab;
  const page = Math.max(1, Number(query.page ?? "1") || 1);

  const [dashboard, exportHistory, audit] = await Promise.all([
    loadReportingDashboard(admin, query.season),
    loadExportHistory(admin),
    tab === "audit"
      ? loadAuditHistory(admin, {
          search: query.q,
          action: query.action,
          entityType: query.entity,
          actorId: query.actor,
          from: query.from,
          to: query.to,
          page,
          pageSize: 25,
        })
      : Promise.resolve(null),
  ]);

  const selectedSeasonId = dashboard.selected_season_id ?? undefined;
  const selectedSeason = dashboard.selected_season;
  const h = dashboard.headline;
  const auditPages = audit ? Math.max(1, Math.ceil(audit.total / audit.limit)) : 1;
  const auditQuery = {
    season: selectedSeasonId,
    tab: "audit",
    q: query.q,
    action: query.action,
    entity: query.entity,
    actor: query.actor,
    from: query.from,
    to: query.to,
  };

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">Phase 12 reporting</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">Reports, analytics and audit</h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Review season performance, operational health, participant retention, prize spending and export history from one read-only workspace.
          </p>
        </div>
        <form className="flex w-full max-w-xl gap-3" method="get">
          <input type="hidden" name="tab" value={tab} />
          <select name="season" defaultValue={selectedSeasonId} className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-bold text-[var(--brand-strong)]">
            {dashboard.seasons.map((season) => (
              <option key={season.id} value={season.id}>{season.name}</option>
            ))}
          </select>
          <button className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">Apply</button>
        </form>
      </div>

      <section className="mt-7 rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">Selected season</p>
            <h2 className="mt-2 text-xl font-black text-[var(--brand-strong)]">{selectedSeason?.name ?? "No season configured"}</h2>
            <p className="mt-1 text-sm capitalize text-[var(--muted)]">
              {selectedSeason ? `${label(selectedSeason.status)} · ${label(selectedSeason.provider)} provider · rules v${selectedSeason.rules_version}` : "Reporting will activate after a season is configured."}
            </p>
          </div>
          <p className="text-xs font-semibold text-[var(--muted)]">Generated {formatDate(dashboard.generated_at)}</p>
        </div>
      </section>

      <nav className="mt-6 flex gap-2 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white p-2 shadow-sm">
        {TABS.filter((item) => item !== "audit" || auditAllowed).map((item) => (
          <Link key={item} href={tabHref(item, selectedSeasonId)} className={`whitespace-nowrap rounded-xl px-4 py-3 text-sm font-black capitalize ${tab === item ? "bg-[var(--brand)] text-white" : "text-[var(--muted)] hover:bg-[#f4f6fb] hover:text-[var(--brand)]"}`}>
            {item === "comparison" ? "Season comparison" : item === "spending" ? "Prize spending" : item === "audit" ? "Audit history" : item}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Registrations" value={h.registrations} note={`${formatNumber(h.approved)} approved · ${number(h.approval_rate).toFixed(2)}% approval`} />
            <MetricCard label="Unique participants" value={h.unique_participants} note="Distinct participant profiles in this season" />
            <MetricCard label="Verified entries" value={h.fpl_verified} note={`${formatNumber(h.vult_verified)} Vult records checked`} />
            <MetricCard label="Finalised rounds" value={h.rounds_finalised} note={`${formatNumber(h.rounds_total)} rounds configured`} />
            <MetricCard label="Published leaderboards" value={h.published_leaderboards} note={`${formatNumber(h.score_rows)} promoted score rows`} />
            <MetricCard label="Confirmed winners" value={h.confirmed_winners} note={`${formatNumber(h.active_settlements)} active settlements`} />
            <MetricCard label="Open disputes" value={h.open_disputes} note={`${formatNumber(h.overdue_disputes)} overdue cases`} />
            <MetricCard label="Delivery attention" value={number(h.queued_notifications) + number(h.failed_notifications)} note={`${formatNumber(h.failed_provider_runs)} failed provider runs`} />
          </section>
          <section className="mt-6 grid gap-6 xl:grid-cols-3">
            <BreakdownCard title="Registration status" rows={dashboard.registration_statuses} />
            <BreakdownCard title="Eligibility status" rows={dashboard.eligibility_statuses} />
            <BreakdownCard title="FPL verification" rows={dashboard.verification_statuses.fpl} />
            <BreakdownCard title="Vult KYC checks" rows={dashboard.verification_statuses.vult} />
            <BreakdownCard title="Duplicate risk" rows={dashboard.verification_statuses.duplicate_risk} />
            <article className="rounded-3xl bg-[var(--brand-strong)] p-6 text-white shadow-xl shadow-blue-950/15">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--accent)]">Data freshness</p>
              <div className="mt-5 space-y-3">
                {Object.entries(dashboard.freshness).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-4 border-b border-white/10 pb-3 text-sm last:border-0 last:pb-0">
                    <span className="font-bold capitalize text-blue-100">{label(key)}</span>
                    <span className="text-right text-xs font-black">{formatDate(value)}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </>
      ) : null}

      {tab === "operations" ? (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={exportHref("operations", selectedSeasonId)} className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">Export operations CSV</Link>
          </div>
          <section className="mt-6 grid gap-6 xl:grid-cols-3">
            <BreakdownCard title="Provider sync runs" rows={dashboard.provider_runs} />
            <BreakdownCard title="Round status" rows={dashboard.round_statuses} />
            <BreakdownCard title="Leaderboard publications" rows={dashboard.leaderboard_statuses} />
            <BreakdownCard title="Winner workflow" rows={dashboard.winner_statuses} />
            <BreakdownCard title="Payment workflow" rows={dashboard.payment_statuses} />
            <BreakdownCard title="Dispute workflow" rows={dashboard.dispute_statuses} />
            <BreakdownCard title="Dispute categories" rows={dashboard.dispute_categories} />
            <BreakdownCard title="Notification delivery" rows={dashboard.notification_statuses} />
            <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <h3 className="text-lg font-black text-[var(--brand-strong)]">Latest provider run</h3>
              {dashboard.latest_provider_run ? (
                <dl className="mt-5 space-y-3 text-sm">
                  {Object.entries(dashboard.latest_provider_run).filter(([key]) => !["id"].includes(key)).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-4 border-b border-[var(--border)] pb-3 last:border-0">
                      <dt className="font-bold capitalize text-[var(--muted)]">{label(key)}</dt>
                      <dd className="max-w-[60%] text-right font-black text-[var(--brand-strong)]">{key.endsWith("_at") ? formatDate(String(value ?? "")) : String(value ?? "—")}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="mt-5 text-sm text-[var(--muted)]">No provider sync has been recorded for this season.</p>}
            </article>
          </section>
        </>
      ) : null}

      {tab === "comparison" ? (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={exportHref("season_summary", selectedSeasonId)} className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">Export season comparison</Link>
            <Link href={exportHref("participant_retention", selectedSeasonId)} className="rounded-xl border border-[var(--border)] bg-white px-5 py-3 text-sm font-black text-[var(--brand)]">Export retention</Link>
          </div>
          <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f4f6fb] text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                  <tr><th className="px-5 py-4">Season</th><th className="px-5 py-4">Registrations</th><th className="px-5 py-4">Approved</th><th className="px-5 py-4">Participants</th><th className="px-5 py-4">Final rounds</th><th className="px-5 py-4">Leaderboards</th><th className="px-5 py-4">Winners</th><th className="px-5 py-4">Paid</th><th className="px-5 py-4">Open disputes</th></tr>
                </thead>
                <tbody>
                  {dashboard.seasons.map((season) => (
                    <tr key={season.id} className="border-t border-[var(--border)]">
                      <td className="px-5 py-4"><p className="font-black text-[var(--brand-strong)]">{season.name}</p><p className="mt-1 text-xs capitalize text-[var(--muted)]">{label(season.status)}</p></td>
                      <td className="px-5 py-4 font-bold">{formatNumber(season.registrations)}</td><td className="px-5 py-4 font-bold">{formatNumber(season.approved_registrations)}</td><td className="px-5 py-4 font-bold">{formatNumber(season.unique_participants)}</td><td className="px-5 py-4 font-bold">{formatNumber(season.finalised_rounds)}</td><td className="px-5 py-4 font-bold">{formatNumber(season.published_leaderboards)}</td><td className="px-5 py-4 font-bold">{formatNumber(season.confirmed_winners)}</td><td className="px-5 py-4 font-bold">{formatNumber(season.paid_prizes)}</td><td className="px-5 py-4 font-bold">{formatNumber(season.open_disputes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {dashboard.retention.map((row) => (
              <article key={row.season_id} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <p className="text-sm font-black text-[var(--brand-strong)]">{row.season_name}</p>
                <p className="mt-4 text-4xl font-black tracking-[-0.04em] text-[var(--brand)]">{number(row.retention_rate).toFixed(2)}%</p>
                <p className="mt-2 text-xs font-bold text-[var(--muted)]">Returning participant rate</p>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-[#f4f6fb] p-3"><strong className="block text-base text-[var(--brand-strong)]">{formatNumber(row.registered_participants)}</strong>Total</div>
                  <div className="rounded-xl bg-[#f4f6fb] p-3"><strong className="block text-base text-[var(--brand-strong)]">{formatNumber(row.returning_participants)}</strong>Returning</div>
                  <div className="rounded-xl bg-[#f4f6fb] p-3"><strong className="block text-base text-[var(--brand-strong)]">{formatNumber(row.new_participants)}</strong>New</div>
                </div>
              </article>
            ))}
          </section>
        </>
      ) : null}

      {tab === "spending" ? (
        <>
          <div className="mt-6"><Link href={exportHref("prize_spending", selectedSeasonId)} className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">Export prize spending</Link></div>
          <section className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {dashboard.prize_spending.length ? dashboard.prize_spending.map((row) => (
              <article key={row.currency} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">{row.currency}</p>
                <p className="mt-3 text-3xl font-black text-[var(--brand-strong)]">{formatMoney(row.paid, row.currency)}</p>
                <p className="mt-1 text-xs font-bold text-[var(--muted)]">Paid value</p>
                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-4"><dt className="font-bold text-[var(--muted)]">Configured value</dt><dd className="font-black">{formatMoney(row.configured_value, row.currency)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="font-bold text-[var(--muted)]">Committed</dt><dd className="font-black">{formatMoney(row.committed, row.currency)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="font-bold text-[var(--muted)]">Reversed</dt><dd className="font-black">{formatMoney(row.reversed, row.currency)}</dd></div>
                </dl>
              </article>
            )) : <article className="rounded-3xl border border-[var(--border)] bg-white p-8 text-sm text-[var(--muted)] shadow-sm">No active prize values or settlement records are available for this season.</article>}
          </section>
        </>
      ) : null}

      {tab === "exports" ? (
        <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
          <div className="border-b border-[var(--border)] p-6"><h2 className="text-xl font-black text-[var(--brand-strong)]">Export history</h2><p className="mt-2 text-sm text-[var(--muted)]">Super Admin and Auditor can see all exports. Other roles see only their own exports.</p></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm"><thead className="bg-[#f4f6fb] text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]"><tr><th className="px-5 py-4">Report</th><th className="px-5 py-4">Season</th><th className="px-5 py-4">Rows</th><th className="px-5 py-4">Requested by</th><th className="px-5 py-4">Created</th></tr></thead>
              <tbody>{exportHistory.length ? exportHistory.map((row) => <tr key={row.id} className="border-t border-[var(--border)]"><td className="px-5 py-4 font-black capitalize text-[var(--brand-strong)]">{label(row.report_type)}</td><td className="px-5 py-4">{row.competition_season_name ?? "All seasons"}</td><td className="px-5 py-4">{formatNumber(row.row_count)}</td><td className="px-5 py-4"><p className="font-bold">{row.requested_by_name}</p><p className="text-xs capitalize text-[var(--muted)]">{label(row.requested_by_role)}</p></td><td className="px-5 py-4">{formatDate(row.created_at)}</td></tr>) : <tr><td colSpan={5} className="px-5 py-10 text-center text-[var(--muted)]">No report exports have been recorded.</td></tr>}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "audit" && audit ? (
        <>
          <form method="get" className="mt-6 grid gap-3 rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-7">
            <input type="hidden" name="tab" value="audit" /><input type="hidden" name="season" value={selectedSeasonId} />
            <input name="q" defaultValue={query.q} placeholder="Search events or metadata" className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm xl:col-span-2" />
            <select name="action" defaultValue={query.action ?? ""} className="rounded-xl border border-[var(--border)] bg-white px-3 py-3 text-sm"><option value="">All actions</option>{audit.actions.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
            <select name="entity" defaultValue={query.entity ?? ""} className="rounded-xl border border-[var(--border)] bg-white px-3 py-3 text-sm"><option value="">All entities</option>{audit.entity_types.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
            <select name="actor" defaultValue={query.actor ?? ""} className="rounded-xl border border-[var(--border)] bg-white px-3 py-3 text-sm"><option value="">All actors</option>{audit.actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}</select>
            <input type="date" name="from" defaultValue={query.from} className="rounded-xl border border-[var(--border)] px-3 py-3 text-sm" />
            <input type="date" name="to" defaultValue={query.to} className="rounded-xl border border-[var(--border)] px-3 py-3 text-sm" />
            <div className="flex gap-2 xl:col-span-7"><button className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">Search audit</button><Link href={exportHref("audit_history", selectedSeasonId, { q: query.q, action: query.action, entity: query.entity, actor: query.actor, from: query.from, to: query.to })} className="rounded-xl border border-[var(--border)] px-5 py-3 text-sm font-black text-[var(--brand)]">Export filtered audit CSV</Link></div>
          </form>
          <section className="mt-6 space-y-3">
            {audit.rows.length ? audit.rows.map((row) => (
              <details key={row.id} className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
                <summary className="cursor-pointer list-none"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black capitalize text-[var(--brand-strong)]">{label(row.action)}</p><p className="mt-1 text-xs text-[var(--muted)]">{label(row.entity_type)} · {row.entity_id ?? "No entity reference"}</p></div><div className="text-left sm:text-right"><p className="text-sm font-bold">{row.actor_name}</p><p className="text-xs text-[var(--muted)]">{formatDate(row.created_at)}</p></div></div></summary>
                <pre className="mt-5 overflow-x-auto rounded-xl bg-[#0b1739] p-4 text-xs leading-6 text-blue-100">{JSON.stringify(row.metadata, null, 2)}</pre>
              </details>
            )) : <div className="rounded-3xl border border-[var(--border)] bg-white p-10 text-center text-[var(--muted)]">No audit events match the selected filters.</div>}
          </section>
          <div className="mt-5 flex items-center justify-between"><p className="text-sm text-[var(--muted)]">Page {page} of {auditPages} · {formatNumber(audit.total)} events</p><div className="flex gap-2">{page > 1 ? <Link href={`/admin/reports?${new URLSearchParams({ ...Object.fromEntries(Object.entries(auditQuery).filter(([, value]) => value)) as Record<string,string>, page: String(page - 1) }).toString()}`} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-black text-[var(--brand)]">Previous</Link> : null}{page < auditPages ? <Link href={`/admin/reports?${new URLSearchParams({ ...Object.fromEntries(Object.entries(auditQuery).filter(([, value]) => value)) as Record<string,string>, page: String(page + 1) }).toString()}`} className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-black text-white">Next</Link> : null}</div></div>
        </>
      ) : null}
    </div>
  );
}
