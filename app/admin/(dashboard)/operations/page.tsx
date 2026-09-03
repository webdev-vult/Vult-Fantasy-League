import {
  createMonthlyPeriodAction,
  createPrizeAction,
  createRuleVersionAction,
  publishRuleVersionAction,
  seedRoundsAction,
  syncMonthlyPeriodsFromFplAction,
  togglePrizeAction,
  updatePrizeAction,
  updateDraftRuleVersionAction,
  updateMonthlyPeriodAction,
  updateRoundAction,
} from "./actions";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SearchParams = Promise<{
  season?: string;
  success?: string;
  error?: string;
}>;

type CompetitionSeason = {
  id: string;
  name: string;
  status: string;
  rules_version: number;
  data_provider: string;
};

type Round = {
  id: string;
  external_round_id: number;
  name: string;
  deadline_at: string | null;
  status: string;
  is_current: boolean;
  is_final: boolean;
  finalised_at: string | null;
  locked_at: string | null;
};

type MonthlyPeriod = {
  id: string;
  name: string;
  description: string | null;
  start_round: number;
  end_round: number;
  status: string;
  source: string;
  calendar_month: string | null;
  last_synced_at: string | null;
};

type CompetitionRule = {
  id: string;
  version: number;
  title: string;
  status: string;
  minimum_vult_kyc_level: number;
  eligible_country_codes: string[];
  one_entry_per_participant: boolean;
  employees_eligible: boolean;
  weekly_chip_policy: string;
  include_transfer_deductions: boolean;
  repeat_weekly_winners_allowed: boolean;
  dispute_window_hours: number;
  tie_breakers: unknown;
  disqualification_rules: unknown;
  notes: string | null;
  effective_at: string | null;
  published_at: string | null;
};

type Prize = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  frequency: string;
  position: number;
  amount: number;
  currency: string;
  prize_type: string;
  non_cash_description: string | null;
  payment_method: string;
  payment_deadline_days: number;
  is_active: boolean;
};

const roundStatuses = [
  "scheduled",
  "live",
  "awaiting_finalisation",
  "final",
  "locked",
  "cancelled",
];
const periodStatuses = ["draft", "active", "completed", "locked"];

function label(value: string) {
  return value.replaceAll("_", " ");
}

function dateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string | null) {
  if (!value) return "Not set";
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

function stringList(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function PrizeFormFields({
  prize,
  compact = false,
}: {
  prize?: Prize;
  compact?: boolean;
}) {
  const mediumSpan = compact ? "" : "xl:col-span-2";
  const fullSpan = compact ? "" : "sm:col-span-2 xl:col-span-4";

  return (
    <>
      <label className="text-xs font-bold text-[var(--muted)]">Code<input name="code" required defaultValue={prize?.code ?? ""} placeholder="WEEKLY_WINNER" className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
      <label className={`text-xs font-bold text-[var(--muted)] ${mediumSpan}`}>Name<input name="name" required defaultValue={prize?.name ?? ""} placeholder="Weekly Winner" className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
      <label className="text-xs font-bold text-[var(--muted)]">Frequency<select name="frequency" defaultValue={prize?.frequency ?? "weekly"} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm capitalize"><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="overall">Overall</option><option value="special">Special</option></select></label>
      <label className="text-xs font-bold text-[var(--muted)]">Position<input name="position" type="number" min="1" defaultValue={prize?.position ?? 1} required className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
      <label className="text-xs font-bold text-[var(--muted)]">Amount<input name="amount" type="number" min="0" step="0.01" defaultValue={prize?.amount ?? 0} required className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
      <label className="text-xs font-bold text-[var(--muted)]">Currency<input name="currency" defaultValue={prize?.currency ?? "SLE"} required className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm uppercase" /></label>
      <label className="text-xs font-bold text-[var(--muted)]">Prize type<select name="prize_type" defaultValue={prize?.prize_type ?? "cash"} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"><option value="cash">Cash</option><option value="non_cash">Non-cash</option><option value="mixed">Mixed</option></select></label>
      <label className="text-xs font-bold text-[var(--muted)]">Payment method<input name="payment_method" defaultValue={prize?.payment_method ?? "vult_wallet"} required className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
      <label className="text-xs font-bold text-[var(--muted)]">Payment deadline days<input name="payment_deadline_days" type="number" min="1" defaultValue={prize?.payment_deadline_days ?? 14} required className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
      <label className={`text-xs font-bold text-[var(--muted)] ${mediumSpan}`}>Non-cash description<input name="non_cash_description" defaultValue={prize?.non_cash_description ?? ""} placeholder="Official jersey" className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
      <label className={`text-xs font-bold text-[var(--muted)] ${fullSpan}`}>Description<textarea name="description" rows={3} defaultValue={prize?.description ?? ""} className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
    </>
  );
}

function RuleFormFields({
  rule,
  defaultTitle,
}: {
  rule?: CompetitionRule;
  defaultTitle: string;
}) {
  return (
    <>
      <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
        Title
        <input name="title" required defaultValue={rule?.title ?? defaultTitle} className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-bold text-[var(--muted)]">
        Minimum Vult KYC level for prizes
        <input name="minimum_vult_kyc_level" type="number" min="1" max="3" defaultValue={rule?.minimum_vult_kyc_level ?? 1} required className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-bold text-[var(--muted)]">
        Eligible country codes
        <input name="eligible_country_codes" defaultValue={rule?.eligible_country_codes.join(", ") ?? "SL"} required className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
      </label>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
        <strong className="block text-[var(--brand-strong)]">Chip usage: recorded only</strong>
        Chips remain visible in score records but do not change rank or prize eligibility.
      </div>
      <label className="text-xs font-bold text-[var(--muted)]">
        Dispute window (hours)
        <input name="dispute_window_hours" type="number" min="1" defaultValue={rule?.dispute_window_hours ?? 72} required className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
      </label>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-xs leading-5 text-[var(--muted)] sm:col-span-2">
        <strong className="block text-[var(--brand-strong)]">Tie-break: point arrival order</strong>
        The team first observed reaching the tied score ranks higher. If both arrive in the same provider sync, official FPL order decides.
      </div>
      <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
        Disqualification rules, one per line
        <textarea name="disqualification_rules" rows={3} defaultValue={stringList(rule?.disqualification_rules).join("\n")} placeholder="Duplicate entry&#10;False identity information" className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
      </label>
      <div className="grid gap-2 text-xs font-bold text-[var(--brand-strong)] sm:col-span-2 sm:grid-cols-2">
        <p className="rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-[var(--muted)]"><strong className="text-[var(--brand-strong)]">Entry:</strong> no age limit and no Vult account required to play.</p>
        <label className="flex items-center gap-2"><input name="one_entry_per_participant" type="checkbox" defaultChecked={rule?.one_entry_per_participant ?? true} /> One entry per participant</label>
        <p className="rounded-lg bg-[var(--surface-soft)] px-3 py-2 text-[var(--muted)]"><strong className="text-[var(--brand-strong)]">Transfers:</strong> costs are displayed but never deducted from ranking points.</p>
        <label className="flex items-center gap-2"><input name="repeat_weekly_winners_allowed" type="checkbox" defaultChecked={rule?.repeat_weekly_winners_allowed ?? true} /> Allow repeat weekly winners</label>
        <label className="flex items-center gap-2"><input name="employees_eligible" type="checkbox" defaultChecked={rule?.employees_eligible ?? false} /> Employees eligible</label>
      </div>
      <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
        Effective date
        <input name="effective_at" type="datetime-local" defaultValue={rule?.status === "draft" ? dateTimeLocal(rule.effective_at) : ""} className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">
        Notes
        <textarea name="notes" rows={2} defaultValue={rule?.notes ?? ""} className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" />
      </label>
    </>
  );
}

export default async function CompetitionOperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;

  const { data: seasonRows, error: seasonsError } = await db
    .from("competition_seasons")
    .select("id, name, status, rules_version, data_provider")
    .order("created_at", { ascending: false });

  const competitionSeasons = (seasonRows ?? []) as CompetitionSeason[];
  const selectedSeasonId = competitionSeasons.some((season) => season.id === params.season)
    ? params.season!
    : competitionSeasons[0]?.id;
  const selectedSeason = competitionSeasons.find((season) => season.id === selectedSeasonId);

  let rounds: Round[] = [];
  let monthlyPeriods: MonthlyPeriod[] = [];
  let rules: CompetitionRule[] = [];
  let prizes: Prize[] = [];
  let loadError = seasonsError?.message ?? null;

  if (selectedSeasonId) {
    const [roundsResult, periodsResult, rulesResult, prizesResult] = await Promise.all([
      db
        .from("rounds")
        .select(
          "id, external_round_id, name, deadline_at, status, is_current, is_final, finalised_at, locked_at",
        )
        .eq("competition_season_id", selectedSeasonId)
        .order("external_round_id"),
      db
        .from("monthly_periods")
        .select("id, name, description, start_round, end_round, status, source, calendar_month, last_synced_at")
        .eq("competition_season_id", selectedSeasonId)
        .order("start_round"),
      db
        .from("competition_rules")
        .select(
          "id, version, title, status, minimum_vult_kyc_level, eligible_country_codes, one_entry_per_participant, employees_eligible, weekly_chip_policy, include_transfer_deductions, repeat_weekly_winners_allowed, dispute_window_hours, tie_breakers, disqualification_rules, notes, effective_at, published_at",
        )
        .eq("competition_season_id", selectedSeasonId)
        .order("version", { ascending: false }),
      db
        .from("prizes")
        .select(
          "id, code, name, description, frequency, position, amount, currency, prize_type, non_cash_description, payment_method, payment_deadline_days, is_active",
        )
        .eq("competition_season_id", selectedSeasonId)
        .order("frequency")
        .order("position"),
    ]);

    rounds = (roundsResult.data ?? []) as Round[];
    monthlyPeriods = (periodsResult.data ?? []) as MonthlyPeriod[];
    rules = (rulesResult.data ?? []) as CompetitionRule[];
    prizes = (prizesResult.data ?? []) as Prize[];
    loadError =
      loadError ??
      roundsResult.error?.message ??
      periodsResult.error?.message ??
      rulesResult.error?.message ??
      prizesResult.error?.message ??
      null;
  }

  const canManage = ["super_admin", "competition_manager"].includes(admin.role);
  const canManagePrizes = [...["super_admin", "competition_manager"], "finance_officer"].includes(
    admin.role,
  );
  const currentRound = rounds.find((round) => round.is_current);
  const publishedRule = rules.find(
    (rule) =>
      rule.status === "published" &&
      rule.version === selectedSeason?.rules_version,
  );
  const activePrizes = prizes.filter((prize) => prize.is_active).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
            Phase 4
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            Competition operations
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Configure Gameweeks, monthly prize periods, versioned competition rules and prize categories for each season.
          </p>
        </div>

        {competitionSeasons.length ? (
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
                {competitionSeasons.map((season) => (
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
          <p className="mt-3 text-[var(--muted)]">Create a competition season before configuring operations.</p>
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Configured rounds", value: rounds.length, note: currentRound?.name ?? "No current round" },
              { label: "Monthly periods", value: monthlyPeriods.length, note: "Gameweek-based periods" },
              { label: "Published rules", value: publishedRule ? `v${publishedRule.version}` : "None", note: `Season setting v${selectedSeason.rules_version}` },
              { label: "Active prizes", value: activePrizes, note: `${prizes.length} configured` },
            ].map((metric) => (
              <article key={metric.label} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <p className="text-sm font-bold text-[var(--muted)]">{metric.label}</p>
                <p className="mt-3 text-3xl font-black text-[var(--brand-strong)]">{metric.value}</p>
                <p className="mt-2 text-xs font-semibold text-[var(--muted)]">{metric.note}</p>
              </article>
            ))}
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Rounds / Gameweeks</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Season round control</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Deadlines and statuses can later be synchronised from the approved data provider. Locked rounds require Super Admin access to reopen.
                </p>
              </div>
              {canManage && rounds.length === 0 ? (
                <form action={seedRoundsAction} className="flex items-end gap-2 rounded-2xl bg-[var(--surface-soft)] p-3">
                  <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                  <label className="text-xs font-black text-[var(--brand)]">
                    Total
                    <input
                      name="total_rounds"
                      type="number"
                      min="1"
                      max="60"
                      defaultValue="38"
                      className="mt-1 block w-20 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--brand-strong)]"
                    />
                  </label>
                  <button className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-black text-white">
                    Create Gameweeks
                  </button>
                </form>
              ) : null}
            </div>

            {rounds.length ? (
              <div className="mt-7 overflow-x-auto">
                <table className="w-full min-w-[850px] border-separate border-spacing-y-2 text-left">
                  <thead>
                    <tr className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                      <th className="px-3 py-2">Round</th>
                      <th className="px-3 py-2">Deadline</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Flags</th>
                      <th className="px-3 py-2">Control</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rounds.map((round) => (
                      <tr key={round.id} className="bg-[#f8f9fc] text-sm">
                        <td className="rounded-l-2xl px-3 py-3">
                          <p className="font-black text-[var(--brand-strong)]">{round.name}</p>
                          <p className="text-xs text-[var(--muted)]">GW{round.external_round_id}</p>
                        </td>
                        <td className="px-3 py-3 text-[var(--muted)]">{formatDate(round.deadline_at)}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-black capitalize text-[var(--brand)]">
                            {label(round.status)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs font-bold text-[var(--muted)]">
                          {round.is_current ? "Current" : "—"} {round.is_final ? "• Final" : ""}
                        </td>
                        <td className="rounded-r-2xl px-3 py-3">
                          {canManage ? (
                            <details>
                              <summary className="cursor-pointer font-black text-[var(--brand)]">Edit</summary>
                              <form action={updateRoundAction} className="mt-3 grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 sm:grid-cols-2">
                                <input type="hidden" name="id" value={round.id} />
                                <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                                <label className="text-xs font-bold text-[var(--muted)]">
                                  Deadline
                                  <input
                                    name="deadline_at"
                                    type="datetime-local"
                                    defaultValue={dateTimeLocal(round.deadline_at)}
                                    className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--brand-strong)]"
                                  />
                                </label>
                                <label className="text-xs font-bold text-[var(--muted)]">
                                  Status
                                  <select
                                    name="status"
                                    defaultValue={round.status}
                                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm capitalize text-[var(--brand-strong)]"
                                  >
                                    {roundStatuses.map((status) => (
                                      <option key={status} value={status}>{label(status)}</option>
                                    ))}
                                  </select>
                                </label>
                                <label className="flex items-center gap-2 text-xs font-bold text-[var(--brand-strong)] sm:col-span-2">
                                  <input name="is_current" type="checkbox" defaultChecked={round.is_current} />
                                  Mark as the current Gameweek
                                </label>
                                <button className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-black text-white sm:col-span-2">
                                  Save round
                                </button>
                              </form>
                            </details>
                          ) : (
                            <span className="text-xs font-bold text-[var(--muted)]">Read only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-7 rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">
                No rounds are configured yet. Creating the standard EPL structure will add Gameweek 1 through Gameweek 38 without setting deadlines.
              </div>
            )}
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Monthly periods</p>
                  <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Prize-period ranges</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    FPL seasons are grouped automatically by official Gameweek deadline month in Sierra Leone time.
                  </p>
                </div>
                {canManage && selectedSeason.data_provider === "approved_fpl" ? (
                  <form action={syncMonthlyPeriodsFromFplAction}>
                    <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                    <button className="whitespace-nowrap rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white">
                      Sync from FPL now
                    </button>
                  </form>
                ) : null}
              </div>

              <div className="mt-6 space-y-3">
                {monthlyPeriods.map((period) => (
                  <div key={period.id} className="rounded-2xl bg-[#f8f9fc] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-black text-[var(--brand-strong)]">{period.name}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">GW{period.start_round}–GW{period.end_round}</p>
                        {period.source === "official_fpl_deadlines" ? (
                          <p className="mt-2 text-xs font-bold text-green-700">
                            Official FPL deadlines{period.last_synced_at ? ` · synced ${formatDate(period.last_synced_at)}` : ""}
                          </p>
                        ) : null}
                        {period.description ? <p className="mt-2 text-xs text-[var(--muted)]">{period.description}</p> : null}
                      </div>
                      {canManage ? (
                        <form action={updateMonthlyPeriodAction} className="flex gap-2">
                          <input type="hidden" name="id" value={period.id} />
                          <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                          <select name="status" defaultValue={period.status} className="rounded-xl border border-[var(--border)] bg-white px-2 py-1 text-xs capitalize">
                            {periodStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                          </select>
                          <button className="rounded-xl bg-[var(--brand)] px-3 py-1 text-xs font-black text-white">Save</button>
                        </form>
                      ) : (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-black capitalize text-[var(--brand)]">{period.status}</span>
                      )}
                    </div>
                  </div>
                ))}
                {!monthlyPeriods.length ? <p className="text-sm text-[var(--muted)]">No monthly periods configured.</p> : null}
              </div>

              {canManage && selectedSeason.data_provider !== "approved_fpl" ? (
                <details className="mt-6 rounded-2xl border border-[var(--border)] p-4">
                  <summary className="cursor-pointer font-black text-[var(--brand)]">Add monthly period</summary>
                  <form action={createMonthlyPeriodAction} className="mt-4 grid gap-4 sm:grid-cols-2">
                    <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                    <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">Name<input name="name" required placeholder="August Prize Period" className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
                    <label className="text-xs font-bold text-[var(--muted)]">Start GW<input name="start_round" type="number" min="1" required className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
                    <label className="text-xs font-bold text-[var(--muted)]">End GW<input name="end_round" type="number" min="1" required className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
                    <label className="text-xs font-bold text-[var(--muted)]">Status<select name="status" defaultValue="draft" className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm capitalize">{periodStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label>
                    <label className="text-xs font-bold text-[var(--muted)] sm:col-span-2">Description<textarea name="description" rows={2} className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm" /></label>
                    <button className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white sm:col-span-2">Create period</button>
                  </form>
                </details>
              ) : canManage ? (
                <p className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-900">
                  Manual Gameweek ranges are disabled for the approved FPL provider. Use the official calendar sync above.
                </p>
              ) : null}
            </article>

            <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Competition rules</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Versioned rulebook</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Published versions remain read-only because participants consent to a specific version. Create or edit a draft, then publish it to make it active for new registrations.
              </p>

              <div className="mt-6 space-y-3">
                {rules.map((rule) => (
                  <details key={rule.id} className="rounded-2xl bg-[#f8f9fc] p-4">
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-black text-[var(--brand-strong)]">v{rule.version} — {rule.title}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">KYC Level {rule.minimum_vult_kyc_level}+ required for prizes • Dispute window {rule.dispute_window_hours} hours</p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          {rule.version === selectedSeason.rules_version ? (
                            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">Active</span>
                          ) : null}
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-black capitalize text-[var(--brand)]">{rule.status}</span>
                        </div>
                      </div>
                    </summary>
                    <div className="mt-4 grid gap-3 text-sm text-[var(--muted)] sm:grid-cols-2">
                      <p><strong className="text-[var(--brand-strong)]">Countries:</strong> {rule.eligible_country_codes.join(", ")}</p>
                      <p><strong className="text-[var(--brand-strong)]">Chip usage:</strong> Recorded only</p>
                      <p><strong className="text-[var(--brand-strong)]">Transfer costs:</strong> Recorded only</p>
                      <p><strong className="text-[var(--brand-strong)]">Vult account to play:</strong> No</p>
                      <p><strong className="text-[var(--brand-strong)]">Prize KYC:</strong> Level {rule.minimum_vult_kyc_level} or higher</p>
                      <p><strong className="text-[var(--brand-strong)]">Employees eligible:</strong> {rule.employees_eligible ? "Yes" : "No"}</p>
                      <p className="sm:col-span-2"><strong className="text-[var(--brand-strong)]">Tie-breaker:</strong> Point arrival order</p>
                    </div>
                    {canManage && rule.status === "draft" ? (
                      <div className="mt-5 space-y-4 border-t border-[var(--border)] pt-4">
                        <details className="rounded-2xl border border-[var(--border)] bg-white p-4">
                          <summary className="cursor-pointer font-black text-[var(--brand)]">Edit this draft</summary>
                          <form action={updateDraftRuleVersionAction} className="mt-4 grid gap-4 sm:grid-cols-2">
                            <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                            <input type="hidden" name="rule_id" value={rule.id} />
                            <RuleFormFields rule={rule} defaultTitle={`${selectedSeason.name} Competition Rules`} />
                            <button className="rounded-xl border border-[var(--brand)] bg-white px-4 py-3 text-sm font-black text-[var(--brand)] sm:col-span-2">Save draft changes</button>
                          </form>
                        </details>
                        <form action={publishRuleVersionAction}>
                          <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                          <input type="hidden" name="rule_id" value={rule.id} />
                          <button className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-black text-white">Publish and activate this version</button>
                        </form>
                      </div>
                    ) : null}
                  </details>
                ))}
                {!rules.length ? <p className="text-sm text-[var(--muted)]">No rule versions configured.</p> : null}
              </div>

              {canManage ? (
                <details className="mt-6 rounded-2xl border border-[var(--border)] p-4">
                  <summary className="cursor-pointer font-black text-[var(--brand)]">Create editable draft from the active rules</summary>
                  <form action={createRuleVersionAction} className="mt-4 grid gap-4 sm:grid-cols-2">
                    <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                    <RuleFormFields rule={publishedRule} defaultTitle={`${selectedSeason.name} Competition Rules`} />
                    <button className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white sm:col-span-2">Create draft version</button>
                  </form>
                </details>
              ) : null}
            </article>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Prize configuration</p>
              <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Weekly, monthly and overall awards</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Prize records define the award value and payment expectation. Actual winner payments are handled in Phase 10.</p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {prizes.map((prize) => (
                <article key={prize.id} className="rounded-2xl bg-[#f8f9fc] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">{prize.code}</p>
                      <h3 className="mt-2 text-lg font-black text-[var(--brand-strong)]">{prize.name}</h3>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${prize.is_active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"}`}>
                      {prize.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-4 text-2xl font-black text-[var(--brand-strong)]">{formatMoney(prize.amount, prize.currency)}</p>
                  <p className="mt-2 text-sm capitalize text-[var(--muted)]">{prize.frequency} • Position {prize.position} • {label(prize.prize_type)}</p>
                  <p className="mt-2 text-xs text-[var(--muted)]">Payment: {label(prize.payment_method)} within {prize.payment_deadline_days} days</p>
                  {prize.non_cash_description ? <p className="mt-2 text-xs text-[var(--muted)]">{prize.non_cash_description}</p> : null}
                  {canManagePrizes ? (
                    <div className="mt-4 space-y-3">
                      <form action={togglePrizeAction}>
                        <input type="hidden" name="id" value={prize.id} />
                        <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                        <input type="hidden" name="is_active" value={prize.is_active ? "false" : "true"} />
                        <button className="rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-xs font-black text-[var(--brand)]">
                          {prize.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                      <details className="rounded-xl border border-[var(--border)] bg-white p-3">
                        <summary className="cursor-pointer text-xs font-black text-[var(--brand)]">Edit prize details</summary>
                        <form action={updatePrizeAction} className="mt-4 grid gap-4">
                          <input type="hidden" name="id" value={prize.id} />
                          <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                          <PrizeFormFields prize={prize} compact />
                          <button className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white">Save prize changes</button>
                        </form>
                      </details>
                    </div>
                  ) : null}
                </article>
              ))}
              {!prizes.length ? <p className="text-sm text-[var(--muted)]">No prizes configured.</p> : null}
            </div>

            {canManagePrizes ? (
              <details className="mt-6 rounded-2xl border border-[var(--border)] p-4">
                <summary className="cursor-pointer font-black text-[var(--brand)]">Add prize category</summary>
                <form action={createPrizeAction} className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <input type="hidden" name="competition_season_id" value={selectedSeason.id} />
                  <PrizeFormFields />
                  <button className="rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white sm:col-span-2 xl:col-span-4">Create prize</button>
                </form>
              </details>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}