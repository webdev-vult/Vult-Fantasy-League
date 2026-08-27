import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

type SearchParams = Promise<{
  q?: string;
  season?: string;
  status?: string;
  fpl?: string;
  vult?: string;
  risk?: string;
  page?: string;
}>;

type CompetitionSeason = {
  id: string;
  name: string;
  status: string;
};

type ParticipantRow = {
  id: string;
  public_reference: string;
  status: string;
  eligibility_status: string;
  registered_at: string;
  registration_channel: string;
  competition_season_id: string;
  participant: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string;
    city: string | null;
    country: string;
    status: string;
  } | null;
  fantasy_entry: {
    provider_entry_id: string;
    manager_name: string | null;
    team_name: string | null;
    verified_at: string | null;
  } | null;
  verification: {
    fpl_status: string;
    vult_status: string;
    vult_kyc_level: number;
    duplicate_risk: string;
    duplicate_checked_at: string | null;
  } | null;
  competition_season: {
    id: string;
    name: string;
    status: string;
  } | null;
};

const registrationStatuses = ["pending", "approved", "rejected", "suspended", "disqualified"];
const verificationStatuses = ["pending", "verified", "failed", "review_required", "not_required"];
const riskStatuses = ["none", "low", "medium", "high"];

function label(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function badgeClasses(value: string) {
  if (["approved", "eligible", "verified", "none", "not_required"].includes(value)) {
    return "border-green-200 bg-green-50 text-green-800";
  }
  if (["rejected", "disqualified", "failed", "high"].includes(value)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (["suspended", "review_required", "medium"].includes(value)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function buildPageHref(params: Record<string, string | undefined>, page: number) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  query.set("page", String(page));
  return `/admin/participants?${query.toString()}`;
}

export default async function ParticipantsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const search = (params.q ?? "").replace(/[,%()]/g, " ").trim();

  const { data: seasonRows, error: seasonsError } = await db
    .from("competition_seasons")
    .select("id, name, status")
    .order("created_at", { ascending: false });
  const seasons = (seasonRows ?? []) as CompetitionSeason[];
  const selectedSeasonId = seasons.some((season) => season.id === params.season)
    ? params.season
    : undefined;

  let matchingRegistrationIds: string[] | null = null;
  if (search) {
    const searchPattern = `%${search}%`;
    const [participantMatches, entryMatches, registrationMatches] = await Promise.all([
      db
        .from("participants")
        .select("id")
        .or(
          `full_name.ilike.${searchPattern},phone.ilike.${searchPattern},email.ilike.${searchPattern},vult_customer_ref.ilike.${searchPattern}`,
        )
        .limit(250),
      db
        .from("fantasy_entries")
        .select("registration_id")
        .or(
          `provider_entry_id.ilike.${searchPattern},team_name.ilike.${searchPattern},manager_name.ilike.${searchPattern}`,
        )
        .limit(250),
      db
        .from("registrations")
        .select("id")
        .ilike("public_reference", searchPattern)
        .limit(250),
    ]);

    const participantIds = (participantMatches.data ?? []).map((row: { id: string }) => row.id);
    let participantRegistrationIds: string[] = [];
    if (participantIds.length) {
      const { data } = await db
        .from("registrations")
        .select("id")
        .in("participant_id", participantIds)
        .limit(250);
      participantRegistrationIds = (data ?? []).map((row: { id: string }) => row.id);
    }

    matchingRegistrationIds = Array.from(
      new Set([
        ...participantRegistrationIds,
        ...(entryMatches.data ?? []).map((row: { registration_id: string }) => row.registration_id),
        ...(registrationMatches.data ?? []).map((row: { id: string }) => row.id),
      ]),
    );
  }

  const verificationJoin = params.fpl || params.vult || params.risk ? "!inner" : "";
  let registrationsQuery = db.from("registrations").select(
    `
      id,
      public_reference,
      status,
      eligibility_status,
      registered_at,
      registration_channel,
      competition_season_id,
      participant:participants!registrations_participant_id_fkey(
        id, full_name, email, phone, city, country, status
      ),
      fantasy_entry:fantasy_entries(
        provider_entry_id, manager_name, team_name, verified_at
      ),
      verification:registration_verifications${verificationJoin}(
        fpl_status, vult_status, vult_kyc_level, duplicate_risk, duplicate_checked_at
      ),
      competition_season:competition_seasons!registrations_competition_season_id_fkey(
        id, name, status
      )
    `,
    { count: "exact" },
  );

  if (selectedSeasonId) registrationsQuery = registrationsQuery.eq("competition_season_id", selectedSeasonId);
  if (params.status && registrationStatuses.includes(params.status)) {
    registrationsQuery = registrationsQuery.eq("status", params.status);
  }
  if (params.fpl && verificationStatuses.includes(params.fpl)) {
    registrationsQuery = registrationsQuery.eq("registration_verifications.fpl_status", params.fpl);
  }
  if (params.vult && verificationStatuses.includes(params.vult)) {
    registrationsQuery = registrationsQuery.eq("registration_verifications.vult_status", params.vult);
  }
  if (params.risk && riskStatuses.includes(params.risk)) {
    registrationsQuery = registrationsQuery.eq("registration_verifications.duplicate_risk", params.risk);
  }
  if (matchingRegistrationIds) {
    registrationsQuery = registrationsQuery.in(
      "id",
      matchingRegistrationIds.length ? matchingRegistrationIds : ["00000000-0000-0000-0000-000000000000"],
    );
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data, count, error } = await registrationsQuery
    .order("registered_at", { ascending: false })
    .range(from, to);

  const registrations = (data ?? []) as ParticipantRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const summaryBase = selectedSeasonId ? { competition_season_id: selectedSeasonId } : null;
  const countQuery = (status?: string) => {
    let query = db.from("registrations").select("id", { count: "exact", head: true });
    if (summaryBase) query = query.eq("competition_season_id", summaryBase.competition_season_id);
    if (status) query = query.eq("status", status);
    return query;
  };

  let highRiskQuery = db
    .from("registration_verifications")
    .select("registration_id, registrations!inner(competition_season_id)", { count: "exact", head: true })
    .eq("duplicate_risk", "high");
  if (selectedSeasonId) {
    highRiskQuery = highRiskQuery.eq("registrations.competition_season_id", selectedSeasonId);
  }

  const [allCount, pendingCount, approvedCount, highRiskCount] = await Promise.all([
    countQuery(),
    countQuery("pending"),
    countQuery("approved"),
    highRiskQuery,
  ]);

  const canVerify = ["super_admin", "competition_manager", "compliance_officer"].includes(admin.role);
  const filterParams = {
    q: params.q,
    season: selectedSeasonId,
    status: params.status,
    fpl: params.fpl,
    vult: params.vult,
    risk: params.risk,
  };
  const currentListHref = buildPageHref(filterParams, page);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
            Phase 6
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            Participant verification
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Review seasonal registrations, verify Vult and FPL details, investigate duplicate risk and control eligibility status.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-white px-5 py-4 text-sm shadow-sm">
          <p className="font-black text-[var(--brand-strong)]">
            {canVerify ? "Verification access" : "Read-only access"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {canVerify
              ? "You can verify registrations and change workflow status."
              : "You can review records but cannot change verification results."}
          </p>
        </div>
      </div>

      {seasonsError || error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
          {seasonsError?.message ?? error?.message ?? "Unable to load registrations."}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [allCount.count ?? 0, "Total registrations"],
          [pendingCount.count ?? 0, "Pending review"],
          [approvedCount.count ?? 0, "Approved"],
          [highRiskCount.count ?? 0, "High duplicate risk"],
        ].map(([value, title]) => (
          <article key={String(title)} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <p className="text-3xl font-black text-[var(--brand-strong)]">{value}</p>
            <p className="mt-2 text-sm font-bold text-[var(--muted)]">{title}</p>
          </article>
        ))}
      </section>

      <form method="get" className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="xl:col-span-2">
            <span className="text-xs font-black uppercase tracking-[0.13em] text-[var(--brand)]">Search</span>
            <input
              name="q"
              defaultValue={params.q}
              placeholder="Name, phone, reference or FPL ID"
              className="mt-2 w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm"
            />
          </label>
          <label>
            <span className="text-xs font-black uppercase tracking-[0.13em] text-[var(--brand)]">Season</span>
            <select name="season" defaultValue={selectedSeasonId ?? ""} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm">
              <option value="">All seasons</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>{season.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs font-black uppercase tracking-[0.13em] text-[var(--brand)]">Status</span>
            <select name="status" defaultValue={params.status ?? ""} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm">
              <option value="">All statuses</option>
              {registrationStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs font-black uppercase tracking-[0.13em] text-[var(--brand)]">FPL</span>
            <select name="fpl" defaultValue={params.fpl ?? ""} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm">
              <option value="">Any FPL state</option>
              {verificationStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs font-black uppercase tracking-[0.13em] text-[var(--brand)]">Vult</span>
            <select name="vult" defaultValue={params.vult ?? ""} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm">
              <option value="">Any Vult state</option>
              {verificationStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="w-full sm:max-w-xs">
            <span className="text-xs font-black uppercase tracking-[0.13em] text-[var(--brand)]">Duplicate risk</span>
            <select name="risk" defaultValue={params.risk ?? ""} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm">
              <option value="">Any risk level</option>
              {riskStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <Link href="/admin/participants" className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-black text-[var(--brand)]">
              Clear
            </Link>
            <button className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-black text-white">Apply filters</button>
          </div>
        </div>
      </form>

      <section className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-[var(--brand-strong)]">Registrations</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{total} matching record{total === 1 ? "" : "s"}</p>
          </div>
          <p className="text-xs font-bold text-[var(--muted)]">Page {page} of {totalPages}</p>
        </div>

        {registrations.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)] text-left text-sm">
              <thead className="bg-[#f8f9fc] text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                <tr>
                  <th className="px-5 py-4 font-black">Participant</th>
                  <th className="px-5 py-4 font-black">FPL entry</th>
                  <th className="px-5 py-4 font-black">Verification</th>
                  <th className="px-5 py-4 font-black">Registration</th>
                  <th className="px-5 py-4 font-black">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {registrations.map((registration) => {
                  const participant = registration.participant;
                  const entry = registration.fantasy_entry;
                  const verification = registration.verification;
                  return (
                    <tr key={registration.id} className="align-top hover:bg-[#fbfcff]">
                      <td className="px-5 py-5">
                        <p className="font-black text-[var(--brand-strong)]">{participant?.full_name ?? "Unknown participant"}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{participant?.phone ?? "No phone"}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{registration.public_reference}</p>
                      </td>
                      <td className="px-5 py-5">
                        <p className="font-bold text-[var(--brand-strong)]">{entry?.team_name ?? "Team name pending"}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">ID: {entry?.provider_entry_id ?? "—"}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{entry?.manager_name ?? "Manager unverified"}</p>
                      </td>
                      <td className="px-5 py-5">
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${badgeClasses(verification?.fpl_status ?? "pending")}`}>
                            FPL {label(verification?.fpl_status ?? "pending")}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${badgeClasses(verification?.vult_status ?? "pending")}`}>
                            Vult {label(verification?.vult_status ?? "pending")} · KYC {verification?.vult_kyc_level ?? 0}
                          </span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${badgeClasses(verification?.duplicate_risk ?? "none")}`}>
                            Risk {label(verification?.duplicate_risk ?? "none")}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-5">
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${badgeClasses(registration.status)}`}>
                          {label(registration.status)}
                        </span>
                        <p className="mt-3 text-xs text-[var(--muted)]">{registration.competition_season?.name ?? "Unknown season"}</p>
                        <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(registration.registered_at)}</p>
                      </td>
                      <td className="px-5 py-5">
                        <Link href={`/admin/participants/${registration.id}?return_to=${encodeURIComponent(currentListHref)}`} className="inline-flex rounded-xl bg-[var(--brand)] px-4 py-2 text-xs font-black text-white">
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
          <div className="px-6 py-16 text-center">
            <h3 className="text-xl font-black text-[var(--brand-strong)]">No matching registrations</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">Registrations will appear here after the public window opens or records are imported.</p>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-4">
            {page > 1 ? (
              <Link href={buildPageHref(filterParams, page - 1)} className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-black text-[var(--brand)]">Previous</Link>
            ) : <span />}
            {page < totalPages ? (
              <Link href={buildPageHref(filterParams, page + 1)} className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-black text-white">Next</Link>
            ) : <span />}
          </div>
        ) : null}
      </section>
    </div>
  );
}
