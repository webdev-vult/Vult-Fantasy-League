import { adminHasRole, requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createCompetitionAction,
  createCompetitionSeasonAction,
  createSeasonAction,
  updateCompetitionSeasonAction,
} from "./actions";

const MANAGEMENT_ROLES = ["super_admin", "competition_manager"] as const;

const fieldClass =
  "mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-blue-100";
const labelClass = "text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]";

function formatDate(value: string | null) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function toDateTimeLocal(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

type PageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
};

export default async function CompetitionsPage({ searchParams }: PageProps) {
  const admin = await requireAdmin();
  const canManage = adminHasRole(admin, MANAGEMENT_ROLES);
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const [competitionsResult, seasonsResult, competitionSeasonsResult] = await Promise.all([
    supabase
      .from("competitions")
      .select("id, name, slug, description, is_active, created_at")
      .order("name"),
    supabase
      .from("seasons")
      .select("id, code, name, starts_on, ends_on, status, created_at")
      .order("starts_on", { ascending: false, nullsFirst: false }),
    supabase
      .from("competition_seasons")
      .select(
        "id, competition_id, season_id, name, slug, status, data_provider, external_league_id, registration_opens_at, registration_closes_at, starts_at, ends_at, rules_version, created_at",
      )
      .order("created_at", { ascending: false }),
  ]);

  const competitions = competitionsResult.data ?? [];
  const seasons = seasonsResult.data ?? [];
  const competitionSeasons = competitionSeasonsResult.data ?? [];
  const competitionNames = new Map(competitions.map((competition) => [competition.id, competition.name]));
  const seasonNames = new Map(seasons.map((season) => [season.id, season.name]));

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
            Competition control
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            Competitions and seasons
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Maintain the permanent Vult competition, create each new football season, and configure registration, provider and lifecycle settings without changing code.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            [competitions.length, "Competitions"],
            [seasons.length, "Seasons"],
            [competitionSeasons.length, "Configured"],
          ].map(([value, label]) => (
            <div key={String(label)} className="min-w-24 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-center shadow-sm">
              <p className="text-2xl font-black text-[var(--brand-strong)]">{value}</p>
              <p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--muted)]">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {params.success ? (
        <div className="mt-7 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">
          {params.success}
        </div>
      ) : null}
      {params.error ? (
        <div className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
          {params.error}
        </div>
      ) : null}

      {!canManage ? (
        <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-900">
          Your role has read-only access to competition configuration. A Super Admin or Competition Manager must make changes.
        </div>
      ) : null}

      <section className="mt-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">
              Configured competition seasons
            </p>
            <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">
              Operational seasons
            </h2>
          </div>
        </div>

        {competitionSeasons.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-[var(--muted)]">
            No competition season has been configured yet.
          </div>
        ) : (
          competitionSeasons.map((item) => (
            <article key={item.id} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-black capitalize text-[var(--brand)]">
                      {statusLabel(item.status)}
                    </span>
                    <span className="rounded-full bg-[#f7f9fd] px-3 py-1.5 text-xs font-black capitalize text-[var(--muted)]">
                      {statusLabel(item.data_provider)} provider
                    </span>
                  </div>
                  <h3 className="mt-4 text-2xl font-black text-[var(--brand-strong)]">{item.name}</h3>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {competitionNames.get(item.competition_id) ?? "Unknown competition"} · {seasonNames.get(item.season_id) ?? "Unknown season"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[560px]">
                  {[
                    ["Registration opens", formatDate(item.registration_opens_at)],
                    ["Registration closes", formatDate(item.registration_closes_at)],
                    ["Season starts", formatDate(item.starts_at)],
                    ["Rules version", String(item.rules_version)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-[#f7f9fd] p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--muted)]">{label}</p>
                      <p className="mt-2 text-sm font-black text-[var(--brand-strong)]">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {canManage ? (
                <details className="mt-6 border-t border-[var(--border)] pt-5">
                  <summary className="cursor-pointer text-sm font-black text-[var(--brand)]">
                    Edit season configuration
                  </summary>
                  <form action={updateCompetitionSeasonAction} className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                    <input type="hidden" name="id" value={item.id} />
                    <label className="md:col-span-2">
                      <span className={labelClass}>Display name</span>
                      <input className={fieldClass} name="name" defaultValue={item.name} required />
                    </label>
                    <label>
                      <span className={labelClass}>Status</span>
                      <select className={fieldClass} name="status" defaultValue={item.status}>
                        {[
                          "draft",
                          "registration_open",
                          "registration_closed",
                          "active",
                          "completed",
                          "archived",
                          "cancelled",
                        ].map((status) => (
                          <option key={status} value={status}>{statusLabel(status)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={labelClass}>Data provider</span>
                      <select className={fieldClass} name="data_provider" defaultValue={item.data_provider}>
                        {[
                          ["mock", "Mock data"],
                          ["csv", "CSV import"],
                          ["approved_fpl", "Approved FPL"],
                          ["licensed", "Licensed provider"],
                        ].map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={labelClass}>External league ID</span>
                      <input className={fieldClass} name="external_league_id" defaultValue={item.external_league_id ?? ""} />
                    </label>
                    <label>
                      <span className={labelClass}>Rules version</span>
                      <input className={fieldClass} type="number" min="1" name="rules_version" defaultValue={item.rules_version} required />
                    </label>
                    <label>
                      <span className={labelClass}>Registration opens (UTC)</span>
                      <input className={fieldClass} type="datetime-local" name="registration_opens_at" defaultValue={toDateTimeLocal(item.registration_opens_at)} />
                    </label>
                    <label>
                      <span className={labelClass}>Registration closes (UTC)</span>
                      <input className={fieldClass} type="datetime-local" name="registration_closes_at" defaultValue={toDateTimeLocal(item.registration_closes_at)} />
                    </label>
                    <label>
                      <span className={labelClass}>Competition starts (UTC)</span>
                      <input className={fieldClass} type="datetime-local" name="starts_at" defaultValue={toDateTimeLocal(item.starts_at)} />
                    </label>
                    <label>
                      <span className={labelClass}>Competition ends (UTC)</span>
                      <input className={fieldClass} type="datetime-local" name="ends_at" defaultValue={toDateTimeLocal(item.ends_at)} />
                    </label>
                    <div className="md:col-span-2 xl:col-span-4">
                      <button className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/15 transition hover:bg-[var(--brand-strong)]" type="submit">
                        Save season configuration
                      </button>
                    </div>
                  </form>
                </details>
              ) : null}
            </article>
          ))
        )}
      </section>

      {canManage ? (
        <section className="mt-8 grid gap-6 xl:grid-cols-3">
          <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Step 1</p>
            <h2 className="mt-2 text-xl font-black text-[var(--brand-strong)]">Create a competition</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Use this for a permanent product such as the Vult EPL Fantasy League.</p>
            <form action={createCompetitionAction} className="mt-6 space-y-4">
              <label className="block">
                <span className={labelClass}>Competition name</span>
                <input className={fieldClass} name="name" placeholder="Vult AFCON Challenge" required />
              </label>
              <label className="block">
                <span className={labelClass}>Slug (optional)</span>
                <input className={fieldClass} name="slug" placeholder="vult-afcon-challenge" />
              </label>
              <label className="block">
                <span className={labelClass}>Description</span>
                <textarea className={`${fieldClass} min-h-28 resize-y`} name="description" placeholder="Permanent competition description" />
              </label>
              <button className="w-full rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white" type="submit">Create competition</button>
            </form>
          </article>

          <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Step 2</p>
            <h2 className="mt-2 text-xl font-black text-[var(--brand-strong)]">Create a season</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Create the reusable calendar period before linking it to a competition.</p>
            <form action={createSeasonAction} className="mt-6 space-y-4">
              <label className="block">
                <span className={labelClass}>Season name</span>
                <input className={fieldClass} name="name" placeholder="2027/28" required />
              </label>
              <label className="block">
                <span className={labelClass}>Season code</span>
                <input className={fieldClass} name="code" placeholder="2027-28" required />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className={labelClass}>Starts</span>
                  <input className={fieldClass} type="date" name="starts_on" />
                </label>
                <label>
                  <span className={labelClass}>Ends</span>
                  <input className={fieldClass} type="date" name="ends_on" />
                </label>
              </div>
              <label className="block">
                <span className={labelClass}>Status</span>
                <select className={fieldClass} name="status" defaultValue="draft">
                  {['draft', 'active', 'completed', 'archived'].map((status) => (
                    <option key={status} value={status}>{statusLabel(status)}</option>
                  ))}
                </select>
              </label>
              <button className="w-full rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white" type="submit">Create season</button>
            </form>
          </article>

          <article className="rounded-3xl bg-[var(--brand-strong)] p-6 text-white shadow-xl shadow-blue-950/15">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--accent)]">Step 3</p>
            <h2 className="mt-2 text-xl font-black">Configure a competition season</h2>
            <p className="mt-2 text-sm leading-6 text-blue-100">Link a permanent competition to one season and define how that year will operate.</p>
            <form action={createCompetitionSeasonAction} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">Competition</span>
                <select className="mt-2 w-full rounded-xl border border-white/15 bg-white px-3.5 py-3 text-sm text-[var(--foreground)]" name="competition_id" required defaultValue="">
                  <option value="" disabled>Select competition</option>
                  {competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">Season</span>
                <select className="mt-2 w-full rounded-xl border border-white/15 bg-white px-3.5 py-3 text-sm text-[var(--foreground)]" name="season_id" required defaultValue="">
                  <option value="" disabled>Select season</option>
                  {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">Display name</span>
                <input className="mt-2 w-full rounded-xl border border-white/15 bg-white px-3.5 py-3 text-sm text-[var(--foreground)]" name="name" placeholder="Vult EPL Fantasy League 2027/28" required />
              </label>
              <input type="hidden" name="status" value="draft" />
              <input type="hidden" name="data_provider" value="mock" />
              <input type="hidden" name="rules_version" value="1" />
              <button disabled={competitions.length === 0 || seasons.length === 0} className="w-full rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-black text-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50" type="submit">
                Create draft configuration
              </button>
            </form>
          </article>
        </section>
      ) : null}
    </div>
  );
}
