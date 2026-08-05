import { createAdminSupabaseClient } from "@/lib/supabase/server";

export const PRIMARY_COMPETITION_SLUG = "vult-epl-fantasy-league-2026-27";

export type PublicCompetition = {
  id: string | null;
  slug: string;
  name: string;
  status: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  rulesVersion: number;
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

const fallbackCompetition: PublicCompetition = {
  id: null,
  slug: PRIMARY_COMPETITION_SLUG,
  name: "Vult EPL Fantasy 2026/27",
  status: "draft",
  registrationOpensAt: null,
  registrationClosesAt: null,
  startsAt: null,
  endsAt: null,
  rulesVersion: 1,
  registrationOpen: false,
};

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

export async function getPublicCompetition(): Promise<PublicCompetition> {
  try {
    const db = createAdminSupabaseClient() as any;
    const { data, error } = await db
      .from("competition_seasons")
      .select(
        "id, slug, name, status, registration_opens_at, registration_closes_at, starts_at, ends_at, rules_version",
      )
      .eq("slug", PRIMARY_COMPETITION_SLUG)
      .maybeSingle();

    if (error || !data) return fallbackCompetition;

    return {
      id: data.id,
      slug: data.slug,
      name: data.name,
      status: data.status,
      registrationOpensAt: data.registration_opens_at,
      registrationClosesAt: data.registration_closes_at,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      rulesVersion: data.rules_version,
      registrationOpen: isRegistrationOpen(
        data.status,
        data.registration_opens_at,
        data.registration_closes_at,
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
