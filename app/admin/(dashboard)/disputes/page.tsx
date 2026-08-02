import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SearchParams = Promise<{
  season?: string;
  status?: string;
  category?: string;
  priority?: string;
  q?: string;
  page?: string;
}>;

type Dispute = {
  id: string;
  case_reference: string;
  competition_season_id: string;
  participant_id: string;
  category: string;
  subject: string;
  related_reference: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  due_at: string | null;
  last_activity_at: string;
  created_at: string;
};
type Season = { id: string; name: string; status: string };
type Participant = { id: string; full_name: string; email: string | null; phone: string };
type Admin = { id: string; full_name: string; role: string };

const PAGE_SIZE = 20;
const STATUSES = ["all", "open", "assigned", "under_review", "awaiting_participant", "escalated", "resolved", "rejected", "closed"];
const CATEGORIES = ["all", "registration", "score", "eligibility", "winner", "payment", "other"];
const PRIORITIES = ["all", "low", "normal", "high", "urgent"];

function label(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (["resolved", "closed"].includes(status)) return "border-green-200 bg-green-50 text-green-800";
  if (["rejected"].includes(status)) return "border-red-200 bg-red-50 text-red-800";
  if (["escalated", "urgent"].includes(status)) return "border-red-200 bg-red-50 text-red-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function pageHref(query: Record<string, string | undefined>, page: number) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => value && params.set(key, value));
  params.set("page", String(page));
  return `/admin/disputes?${params.toString()}`;
}

export default async function DisputesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const query = await searchParams;
  const page = Math.max(1, Number(query.page ?? "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;

  const { data: seasonsData } = await db.from("competition_seasons").select("id, name, status").order("created_at", { ascending: false });
  const seasons = (seasonsData ?? []) as Season[];
  const selectedSeason = query.season || seasons[0]?.id || "";

  let participantIds: string[] = [];
  const safeSearch = (query.q ?? "").trim().replace(/[%(),]/g, "");
  if (safeSearch) {
    const { data } = await db
      .from("participants")
      .select("id")
      .or(`full_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%`)
      .limit(100);
    participantIds = (data ?? []).map((item: { id: string }) => item.id);
  }

  let disputesQuery = db
    .from("disputes")
    .select("id, case_reference, competition_season_id, participant_id, category, subject, related_reference, status, priority, assigned_to, due_at, last_activity_at, created_at", { count: "exact" })
    .order("last_activity_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (selectedSeason) disputesQuery = disputesQuery.eq("competition_season_id", selectedSeason);
  if (query.status && query.status !== "all") disputesQuery = disputesQuery.eq("status", query.status);
  if (query.category && query.category !== "all") disputesQuery = disputesQuery.eq("category", query.category);
  if (query.priority && query.priority !== "all") disputesQuery = disputesQuery.eq("priority", query.priority);
  if (safeSearch) {
    const clauses = [
      `case_reference.ilike.%${safeSearch}%`,
      `subject.ilike.%${safeSearch}%`,
      `related_reference.ilike.%${safeSearch}%`,
    ];
    if (participantIds.length) clauses.push(`participant_id.in.(${participantIds.join(",")})`);
    disputesQuery = disputesQuery.or(clauses.join(","));
  }

  const [disputesResult, adminsResult, openCount, awaitingCount, escalatedCount, overdueCount] = await Promise.all([
    disputesQuery,
    db.from("admin_profiles").select("id, full_name, role").eq("is_active", true).order("full_name"),
    selectedSeason ? db.from("disputes").select("id", { count: "exact", head: true }).eq("competition_season_id", selectedSeason).in("status", ["open", "assigned", "under_review"]) : Promise.resolve({ count: 0 }),
    selectedSeason ? db.from("disputes").select("id", { count: "exact", head: true }).eq("competition_season_id", selectedSeason).eq("status", "awaiting_participant") : Promise.resolve({ count: 0 }),
    selectedSeason ? db.from("disputes").select("id", { count: "exact", head: true }).eq("competition_season_id", selectedSeason).eq("status", "escalated") : Promise.resolve({ count: 0 }),
    selectedSeason ? db.from("disputes").select("id", { count: "exact", head: true }).eq("competition_season_id", selectedSeason).lt("due_at", new Date().toISOString()).not("status", "in", "(resolved,rejected,closed)") : Promise.resolve({ count: 0 }),
  ]);

  const disputes = (disputesResult.data ?? []) as Dispute[];
  const total = disputesResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const participantIdsOnPage = [...new Set(disputes.map((item) => item.participant_id))];
  const { data: participantRows } = participantIdsOnPage.length
    ? await db.from("participants").select("id, full_name, email, phone").in("id", participantIdsOnPage)
    : { data: [] };
  const participants = new Map<string, Participant>(((participantRows ?? []) as Participant[]).map((item) => [item.id, item]));
  const admins = new Map<string, Admin>(((adminsResult.data ?? []) as Admin[]).map((item) => [item.id, item]));
  const seasonMap = new Map(seasons.map((item) => [item.id, item.name]));

  const filters = { season: selectedSeason, status: query.status, category: query.category, priority: query.priority, q: query.q };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div>
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">Phase 11</p>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">Disputes</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
          Triage participant cases, assign ownership, track response deadlines, preserve evidence and communication history, and route final decisions to the appropriate role.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active review", openCount.count ?? 0],
          ["Awaiting participant", awaitingCount.count ?? 0],
          ["Escalated", escalatedCount.count ?? 0],
          ["Overdue", overdueCount.count ?? 0],
        ].map(([name, value]) => (
          <article key={String(name)} className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">{name}</p>
            <p className="mt-3 text-3xl font-black text-[var(--brand-strong)]">{value}</p>
          </article>
        ))}
      </section>

      <form className="grid gap-4 rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-black uppercase tracking-[0.1em] text-[var(--muted)]">Season
          <select name="season" defaultValue={selectedSeason} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm">
            {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-black uppercase tracking-[0.1em] text-[var(--muted)]">Status
          <select name="status" defaultValue={query.status ?? "all"} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm">
            {STATUSES.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
        </label>
        <label className="text-xs font-black uppercase tracking-[0.1em] text-[var(--muted)]">Category
          <select name="category" defaultValue={query.category ?? "all"} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm">
            {CATEGORIES.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
        </label>
        <label className="text-xs font-black uppercase tracking-[0.1em] text-[var(--muted)]">Priority
          <select name="priority" defaultValue={query.priority ?? "all"} className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-3 text-sm">
            {PRIORITIES.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
        </label>
        <label className="text-xs font-black uppercase tracking-[0.1em] text-[var(--muted)]">Search
          <div className="mt-2 flex gap-2"><input name="q" defaultValue={query.q ?? ""} className="min-w-0 flex-1 rounded-xl border border-[var(--border)] px-3 py-3 text-sm" placeholder="Case, subject, participant" /><button className="rounded-xl bg-[var(--brand)] px-4 text-sm font-black text-white">Apply</button></div>
        </label>
      </form>

      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--surface-soft)] text-xs font-black uppercase tracking-[0.1em] text-[var(--muted)]">
              <tr><th className="px-5 py-4">Case</th><th className="px-5 py-4">Participant</th><th className="px-5 py-4">Category</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Owner</th><th className="px-5 py-4">Due</th><th className="px-5 py-4"></th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {disputes.length ? disputes.map((item) => {
                const participant = participants.get(item.participant_id);
                const assignee = item.assigned_to ? admins.get(item.assigned_to) : null;
                const overdue = item.due_at && new Date(item.due_at).getTime() < Date.now() && !["resolved", "rejected", "closed"].includes(item.status);
                return (
                  <tr key={item.id} className="align-top">
                    <td className="px-5 py-5"><p className="font-black text-[var(--brand-strong)]">{item.case_reference}</p><p className="mt-1 max-w-xs text-[var(--muted)]">{item.subject}</p><p className="mt-2 text-xs text-[var(--muted)]">{seasonMap.get(item.competition_season_id)}</p></td>
                    <td className="px-5 py-5"><p className="font-bold text-[var(--brand-strong)]">{participant?.full_name ?? "Unknown participant"}</p><p className="mt-1 text-xs text-[var(--muted)]">{participant?.email ?? participant?.phone}</p></td>
                    <td className="px-5 py-5"><span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-black capitalize text-[var(--brand)]">{label(item.category)}</span><p className="mt-2 text-xs font-bold capitalize text-[var(--muted)]">{label(item.priority)} priority</p></td>
                    <td className="px-5 py-5"><span className={`rounded-full border px-3 py-1.5 text-xs font-black capitalize ${statusClass(item.status)}`}>{label(item.status)}</span><p className="mt-2 text-xs text-[var(--muted)]">Updated {formatDate(item.last_activity_at)}</p></td>
                    <td className="px-5 py-5"><p className="font-bold text-[var(--brand-strong)]">{assignee?.full_name ?? "Unassigned"}</p><p className="mt-1 text-xs capitalize text-[var(--muted)]">{assignee ? label(assignee.role) : "Needs triage"}</p></td>
                    <td className="px-5 py-5"><p className={overdue ? "font-black text-red-700" : "font-bold text-[var(--brand-strong)]"}>{formatDate(item.due_at)}</p>{overdue ? <p className="mt-1 text-xs font-black text-red-700">Overdue</p> : null}</td>
                    <td className="px-5 py-5"><Link href={`/admin/disputes/${item.id}`} className="inline-flex rounded-xl bg-[var(--brand)] px-4 py-2 text-xs font-black text-white">Review</Link></td>
                  </tr>
                );
              }) : <tr><td colSpan={7} className="px-5 py-12 text-center text-[var(--muted)]">No disputes match the selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-4 text-sm">
          <p className="text-[var(--muted)]">{total} case{total === 1 ? "" : "s"}</p>
          <div className="flex gap-2">
            {page > 1 ? <Link href={pageHref(filters, page - 1)} className="rounded-xl border border-[var(--border)] px-4 py-2 font-black text-[var(--brand)]">Previous</Link> : null}
            <span className="rounded-xl bg-[var(--surface-soft)] px-4 py-2 font-bold text-[var(--muted)]">Page {page} of {totalPages}</span>
            {page < totalPages ? <Link href={pageHref(filters, page + 1)} className="rounded-xl border border-[var(--border)] px-4 py-2 font-black text-[var(--brand)]">Next</Link> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
