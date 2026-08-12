import { createAdminSupabaseClient } from "@/lib/supabase/server";

export const PRIMARY_COMPETITION_SLUG =
  process.env.PRIMARY_COMPETITION_SLUG?.trim() || "vult-epl-fantasy-league";

export type PublicCompetition = {
  id: string | null;
  competitionId: string | null;
  competitionSlug: string;
  slug: string;
  name: string;
  status: string;
  seasonCode: string | null;
  seasonName: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  rulesVersion: number;
  externalLeagueId: string | null;
  fplLeagueCode: string | null;
  fplLeagueName: string | null;
  registrationOpen: boolean;
};

export type PublicRule = {
  id: string;
  version: number;
  title: string;
  minimum_age: number;
  eligible_country_codes: string[];
  requires_vult_account: boolean;
  one_entry_per_participant: boolean;
  employees_eligible: boolean;
  weekly_chip_policy: string;
  include_transfer_deductions: boolean;
  repeat_weekly_winners_allowed: boolean;
  dispute_window_hours: number;
  tie_breakers: unknown;
  disqualification_rules: unknown;
  notes: string | null;
  published_at: string | null;
};

export type PublicPrize = {
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
};

type CompetitionSeasonRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  season_id: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  rules_version: number;
  external_league_id: string | null;
  settings: unknown;
  created_at: string;
};

const fallbackCompetition: PublicCompetition = {
  id: null,
  competitionId: null,
  competitionSlug: PRIMARY_COMPETITION_SLUG,
  slug: "",
  name: "Vult EPL Fantasy League",
  status: "draft",
  seasonCode: null,
  seasonName: null,
  registrationOpensAt: null,
  registrationClosesAt: null,
  startsAt: null,
  endsAt: null,
  rulesVersion: 1,
  externalLeagueId: null,
  fplLeagueCode: null,
  fplLeagueName: null,
  registrationOpen: false,
};

function settingsObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function settingText(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRegistrationOpen(
  status: string,
  opensAt: string | null,
  closesAt: string | null,
) {
  if (status !== "registration_open") return false;

  const now = Date.now();
  if (opensAt && now < new Date(opensAt).getTime()) return false;
  if (closesAt && now > new Date(closesAt).getTime()) return false;
  return true;
}

function seasonPriority(row: CompetitionSeasonRow) {
  const now = Date.now();
  const opensAt = row.registration_opens_at
    ? new Date(row.registration_opens_at).getTime()
    : null;
  const endsAt = row.ends_at ? new Date(row.ends_at).getTime() : null;

  if (row.status === "registration_open") return 0;
  if (row.status === "active") return 1;
  if (row.status === "registration_closed") return 2;
  if (row.status === "draft" && opensAt !== null && opensAt >= now) return 3;
  if (row.status === "draft") return 4;
  if (row.status === "completed" && (endsAt === null || endsAt <= now)) return 5;
  return 6;
}

function selectPublicSeason(rows: CompetitionSeasonRow[]) {
  return [...rows]
    .filter((row) => !["archived", "cancelled"].includes(row.status))
    .sort((a, b) => {
      const priorityDifference = seasonPriority(a) - seasonPriority(b);
      if (priorityDifference !== 0) return priorityDifference;

      const aStart = a.starts_at ? new Date(a.starts_at).getTime() : 0;
      const bStart = b.starts_at ? new Date(b.starts_at).getTime() : 0;
      if (aStart !== bStart) return bStart - aStart;

      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })[0] ?? null;
}

export async function getPublicCompetition(): Promise<PublicCompetition> {
  try {
    const db = createAdminSupabaseClient() as any;
    const { data: competition, error: competitionError } = await db
      .from("competitions")
      .select("id, slug, name")
      .eq("slug", PRIMARY_COMPETITION_SLUG)
      .eq("is_active", true)
      .maybeSingle();

    if (competitionError || !competition) return fallbackCompetition;

    const { data: seasonRows, error: seasonsError } = await db
      .from("competition_seasons")
      .select(
        "id, slug, name, status, season_id, registration_opens_at, registration_closes_at, starts_at, ends_at, rules_version, external_league_id, settings, created_at",
      )
      .eq("competition_id", competition.id);

    if (seasonsError || !seasonRows?.length) {
      return {
        ...fallbackCompetition,
        competitionId: competition.id,
        competitionSlug: competition.slug,
        name: competition.name,
      };
    }

    const selected = selectPublicSeason(seasonRows as CompetitionSeasonRow[]);
    if (!selected) {
      return {
        ...fallbackCompetition,
        competitionId: competition.id,
        competitionSlug: competition.slug,
        name: competition.name,
      };
    }

    const { data: season } = await db
      .from("seasons")
      .select("code, name")
      .eq("id", selected.season_id)
      .maybeSingle();
    const settings = settingsObject(selected.settings);

    return {
      id: selected.id,
      competitionId: competition.id,
      competitionSlug: competition.slug,
      slug: selected.slug,
      name: selected.name,
      status: selected.status,
      seasonCode: season?.code ?? null,
      seasonName: season?.name ?? null,
      registrationOpensAt: selected.registration_opens_at,
      registrationClosesAt: selected.registration_closes_at,
      startsAt: selected.starts_at,
      endsAt: selected.ends_at,
      rulesVersion: selected.rules_version,
      externalLeagueId: selected.external_league_id,
      fplLeagueCode: settingText(settings, "fpl_league_code"),
      fplLeagueName: settingText(settings, "fpl_league_name"),
      registrationOpen: isRegistrationOpen(
        selected.status,
        selected.registration_opens_at,
        selected.registration_closes_at,
      ),
    };
  } catch (error) {
    console.error("Unable to load public competition state", error);
    return fallbackCompetition;
  }
}

export async function getPublishedRules(competitionSeasonId: string | null) {
  if (!competitionSeasonId) return null;

  try {
    const db = createAdminSupabaseClient() as any;
    const { data, error } = await db
      .from("competition_rules")
      .select(
        "id, version, title, minimum_age, eligible_country_codes, requires_vult_account, one_entry_per_participant, employees_eligible, weekly_chip_policy, include_transfer_deductions, repeat_weekly_winners_allowed, dispute_window_hours, tie_breakers, disqualification_rules, notes, published_at",
      )
      .eq("competition_season_id", competitionSeasonId)
      .eq("status", "published")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return (data as PublicRule | null) ?? null;
  } catch (error) {
    console.error("Unable to load published rules", error);
    return null;
  }
}

export async function getActivePrizes(competitionSeasonId: string | null) {
  if (!competitionSeasonId) return [] as PublicPrize[];

  try {
    const db = createAdminSupabaseClient() as any;
    const { data, error } = await db
      .from("prizes")
      .select(
        "id, code, name, description, frequency, position, amount, currency, prize_type, non_cash_description, payment_method, payment_deadline_days",
      )
      .eq("competition_season_id", competitionSeasonId)
      .eq("is_active", true)
      .order("frequency")
      .order("position");

    if (error) return [];
    return (data as PublicPrize[] | null) ?? [];
  } catch (error) {
    console.error("Unable to load active prizes", error);
    return [];
  }
}

export function formatPublicDate(value: string | null) {
  if (!value) return "To be announced";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

export function humanizeStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
