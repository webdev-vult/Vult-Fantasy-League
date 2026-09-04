import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { getPublicCompetition, humanizeStatus } from "@/lib/public/competition";

export const metadata: Metadata = {
  title: "Leaderboards",
  description: "Published Gameweek, monthly and overall Vult Fantasy standings.",
};

type SearchParams = Promise<{
  scope?: string;
  publication?: string;
  q?: string;
  page?: string;
}>;

type Publication = {
  id: string;
  scope: string;
  title: string;
  revision: number;
  row_count: number;
  is_provisional: boolean;
  published_at: string;
  round_id: string | null;
  monthly_period_id: string | null;
};

type LeaderboardRow = {
  id: number;
  rank: number;
  previous_rank: number | null;
  movement: number;
  display_name: string;
  team_name: string | null;
  points: number;
  provider_total_points: number;
  gameweeks_counted: number;
  chip_used: string | null;
  weekly_eligible: boolean;
  is_tied: boolean;
  metadata: Record<string, unknown>;
};

type Round = {
  id: string;
  external_round_id: number;
  name: string;
};

type MonthlyPeriod = {
  id: string;
  name: string;
  start_round: number;
  end_round: number;
  calendar_month: string | null;
};

const scopes = ["overall", "round", "monthly"] as const;
const pageSize = 25;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function movement(value: number) {
  if (value > 0) return { label: `▲ ${value}`, className: "text-green-700" };
  if (value < 0) return { label: `▼ ${Math.abs(value)}`, className: "text-red-700" };
  return { label: "—", className: "text-[var(--muted)]" };
}

function monthLabel(period: MonthlyPeriod) {
  if (period.calendar_month) {
    return new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "Africa/Freetown",
    }).format(new Date(`${period.calendar_month}T12:00:00Z`));
  }

  return period.name.replace(/\s+(game\s*week|prize period)$/i, "");
}

function publicationLabel(
  publication: Publication,
  roundMap: Map<string, Round>,
  periodMap: Map<string, MonthlyPeriod>,
) {
  if (publication.scope === "round" && publication.round_id) {
    const round = roundMap.get(publication.round_id);
    return round ? `Gameweek ${round.external_round_id} Leaderboard` : "Gameweek Leaderboard";
  }

  if (publication.scope === "monthly" && publication.monthly_period_id) {
    const period = periodMap.get(publication.monthly_period_id);
    return period
      ? `${monthLabel(period)} Monthly Leaderboard (GW${period.start_round}–GW${period.end_round})`
      : "Monthly Leaderboard";
  }

  return "Overall Leaderboard";
}

export default async function LeaderboardsPage({ searchParams }: { searchParams: SearchParams }) {
  const competition = await getPublicCompetition();
  const params = await searchParams;
  const selectedScope = scopes.includes(params.scope as (typeof scopes)[number])
    ? (params.scope as (typeof scopes)[number])
    : "overall";
  const query = String(params.q ?? "").trim().slice(0, 80);
  const currentPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  let publications: Publication[] = [];
  let selectedPublication: Publication | undefined;
  let roundMap = new Map<string, Round>();
  let periodMap = new Map<string, MonthlyPeriod>();
  let rows: LeaderboardRow[] = [];
  let totalRows = 0;
  let loadError: string | null = null;

  if (competition.id) {
    try {
      // Database types are intentionally narrowed after each public query below.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createAdminSupabaseClient() as any;
      const { data: publicationRows, error: publicationError } = await db
        .from("leaderboard_publications")
        .select(
          "id, scope, title, revision, row_count, is_provisional, published_at, round_id, monthly_period_id",
        )
        .eq("competition_season_id", competition.id)
        .eq("status", "published")
        .eq("scope", selectedScope)
        .order("published_at", { ascending: false });

      if (publicationError) throw new Error(publicationError.message);
      publications = (publicationRows ?? []) as Publication[];
      const roundIds = [...new Set(publications.flatMap((item) => item.round_id ? [item.round_id] : []))];
      const periodIds = [...new Set(publications.flatMap((item) => item.monthly_period_id ? [item.monthly_period_id] : []))];
      const [{ data: roundRows, error: roundError }, { data: periodRows, error: periodError }] = await Promise.all([
        roundIds.length
          ? db.from("rounds").select("id, external_round_id, name").in("id", roundIds)
          : Promise.resolve({ data: [], error: null }),
        periodIds.length
          ? db.from("monthly_periods").select("id, name, start_round, end_round, calendar_month").in("id", periodIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (roundError) throw new Error(roundError.message);
      if (periodError) throw new Error(periodError.message);
      roundMap = new Map(((roundRows ?? []) as Round[]).map((round) => [round.id, round]));
      periodMap = new Map(((periodRows ?? []) as MonthlyPeriod[]).map((period) => [period.id, period]));
      selectedPublication = publications.find((item) => item.id === params.publication) ?? publications[0];

      if (selectedPublication) {
        let rowQuery = db
          .from("public_leaderboard_rows")
          .select(
            "id, rank, previous_rank, movement, display_name, team_name, points, provider_total_points, gameweeks_counted, chip_used, weekly_eligible, is_tied, metadata",
            { count: "exact" },
          )
          .eq("publication_id", selectedPublication.id)
          .order("rank", { ascending: true })
          .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

        if (query) {
          const escaped = query.replaceAll(",", " ").replaceAll("%", "");
          rowQuery = rowQuery.or(`display_name.ilike.%${escaped}%,team_name.ilike.%${escaped}%`);
        }

        const { data, error, count } = await rowQuery;
        if (error) throw new Error(error.message);
        rows = (data ?? []) as LeaderboardRow[];
        totalRows = count ?? 0;
      }
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Unable to load the leaderboard.";
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const buildPageHref = (page: number) => {
    const search = new URLSearchParams({ scope: selectedScope, page: String(page) });
    if (selectedPublication) search.set("publication", selectedPublication.id);
    if (query) search.set("q", query);
    return `/leaderboards?${search.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen} />

      <section className="bg-[var(--brand-strong)] text-white">
        <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Published standings</p>
          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-5xl font-black tracking-[-0.05em] sm:text-6xl">Vult Fantasy Leaderboards</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-blue-100">
                Follow verified Gameweek, monthly and overall rankings for {competition.name}. Published snapshots remain versioned so changes are transparent.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
              <p className="text-xs font-bold text-blue-200">Competition status</p>
              <p className="mt-1 text-lg font-black">{humanizeStatus(competition.status)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl space-y-8 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
        <div className="flex flex-wrap gap-2">
          {scopes.map((scope) => (
            <Link
              key={scope}
              href={`/leaderboards?scope=${scope}`}
              className={`rounded-xl px-5 py-3 text-sm font-black capitalize ${
                selectedScope === scope
                  ? "bg-[var(--brand)] text-white"
                  : "border border-[var(--border)] bg-white text-[var(--muted)]"
              }`}
            >
              {scope === "round" ? "Gameweek" : scope}
            </Link>
          ))}
        </div>

        {loadError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">{loadError}</div>
        ) : null}

        {publications.length ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <form method="get" className="grid gap-3 rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="scope" value={selectedScope} />
              <label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                Published snapshot
                <select name="publication" defaultValue={selectedPublication?.id} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm font-bold normal-case tracking-normal text-[var(--brand-strong)]">
                  {publications.map((publication) => (
                    <option key={publication.id} value={publication.id}>{publicationLabel(publication, roundMap, periodMap)} · v{publication.revision}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                Search manager or team
                <input name="q" defaultValue={query} placeholder="Search..." className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm font-medium normal-case tracking-normal" />
              </label>
              <button className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">Apply</button>
            </form>
            {selectedPublication ? (
              <div className="rounded-2xl border border-[var(--border)] bg-white px-5 py-4 text-sm shadow-sm">
                <p className="font-black text-[var(--brand-strong)]">{selectedPublication.is_provisional ? "Provisional" : "Final"}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">Published {formatDate(selectedPublication.published_at)}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {selectedPublication ? (
          <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[var(--border)] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">{selectedScope === "round" ? "Gameweek" : selectedScope} leaderboard</p>
                <h2 className="mt-1 text-2xl font-black text-[var(--brand-strong)]">{publicationLabel(selectedPublication, roundMap, periodMap)}</h2>
              </div>
              <p className="text-sm font-bold text-[var(--muted)]">{totalRows} ranked entries</p>
            </div>

            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left">
                  <thead className="bg-[var(--surface-soft)] text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                    <tr>
                      <th className="px-6 py-4">Rank</th>
                      <th className="px-6 py-4">Manager / Team</th>
                      <th className="px-6 py-4">Movement</th>
                      <th className="px-6 py-4">Gameweeks</th>
                      <th className="px-6 py-4">Points</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {rows.map((row) => {
                      const move = movement(row.movement);
                      return (
                        <tr key={row.id} className={row.rank <= 3 ? "bg-amber-50/40" : ""}>
                          <td className="px-6 py-5"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-black text-white">{row.rank}</span></td>
                          <td className="px-6 py-5"><p className="font-black text-[var(--brand-strong)]">{row.display_name}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.team_name ?? "Team name not published"}</p></td>
                          <td className={`px-6 py-5 text-sm font-black ${move.className}`}>{move.label}</td>
                          <td className="px-6 py-5 text-sm font-bold text-[var(--muted)]">{row.gameweeks_counted}</td>
                          <td className="px-6 py-5 text-2xl font-black text-[var(--brand-strong)]">{row.points}</td>
                          <td className="px-6 py-5"><div className="flex flex-wrap gap-2">{row.is_tied ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">Ordered by point arrival</span> : null}<span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black text-green-800">Eligible</span>{row.chip_used ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-800">{row.chip_used}</span> : null}</div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center"><h3 className="text-xl font-black text-[var(--brand-strong)]">No matching entries</h3><p className="mt-2 text-sm text-[var(--muted)]">Try another search or published snapshot.</p></div>
            )}

            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-5">
                <Link href={buildPageHref(Math.max(1, currentPage - 1))} aria-disabled={currentPage === 1} className={`rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-black ${currentPage === 1 ? "pointer-events-none opacity-40" : "text-[var(--brand)]"}`}>Previous</Link>
                <p className="text-sm font-bold text-[var(--muted)]">Page {currentPage} of {totalPages}</p>
                <Link href={buildPageHref(Math.min(totalPages, currentPage + 1))} aria-disabled={currentPage === totalPages} className={`rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-black ${currentPage === totalPages ? "pointer-events-none opacity-40" : "text-[var(--brand)]"}`}>Next</Link>
              </div>
            ) : null}
          </section>
        ) : (
          <section className="rounded-3xl border border-dashed border-[var(--border)] bg-white p-12 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-soft)] text-2xl font-black text-[var(--brand)]">V</div>
            <h2 className="mt-5 text-2xl font-black text-[var(--brand-strong)]">No {selectedScope === "round" ? "Gameweek" : selectedScope} leaderboard published yet</h2>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--muted)]">Standings will appear after validated scores are reviewed and an administrator publishes a privacy-safe snapshot.</p>
            <Link href="/how-it-works" className="mt-6 inline-flex rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">How scoring works</Link>
          </section>
        )}

        <div className="rounded-3xl bg-[var(--brand)] p-7 text-white sm:flex sm:items-center sm:justify-between">
          <div><p className="text-sm font-bold text-blue-100">Leaderboard transparency</p><h2 className="mt-2 text-2xl font-black">Scores may be provisional until the Gameweek or period is finalised.</h2></div>
          <Link href="/rules" className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-black text-[var(--brand)] sm:mt-0">Read competition rules</Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
