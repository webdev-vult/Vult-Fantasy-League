"use server";

import { redirect } from "next/navigation";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export type RegistrationState = {
  error: string | null;
};

const FPL_BASE_URL = "https://fantasy.premierleague.com/api";
const OFFICIAL_LEAGUE_ID = 538121;
const MAX_LEAGUE_PAGES = 500;

const SAFE_MESSAGES = [
  "Registration is not currently open.",
  "Registration is not currently available.",
  "You must accept the competition rules and privacy notice.",
  "Enter your full legal name.",
  "Enter a valid phone number.",
  "Enter a valid email address.",
  "Your country is not eligible for this competition.",
  "Enter your exact FPL team name.",
  "Enter your exact FPL manager name.",
  "The FPL team could not be resolved to a valid Entry ID.",
  "No matching team was found in the official Vult FPL league.",
  "More than one matching team was found. Contact Vult support.",
  "This phone number is already linked to a participant. Contact support to register for another season.",
  "You are already registered for this competition season.",
  "A participant, email address, or FPL team in this registration is already in use.",
  "Unable to submit this registration.",
];

type LeagueRow = {
  entry?: number;
  entry_name?: string;
  player_name?: string;
  player_first_name?: string;
  player_last_name?: string;
};

type LeagueResponse = {
  standings?: { has_next?: boolean; results?: LeagueRow[] };
  new_entries?: { has_next?: boolean; results?: LeagueRow[] };
};

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function normalizeName(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function rowManagerName(row: LeagueRow) {
  if (row.player_name?.trim()) return row.player_name.trim();
  return `${row.player_first_name ?? ""} ${row.player_last_name ?? ""}`.trim();
}

async function fetchLeaguePage(standingsPage: number, newEntriesPage: number) {
  const params = new URLSearchParams({
    page_standings: String(standingsPage),
    page_new_entries: String(newEntriesPage),
  });
  const response = await fetch(
    `${FPL_BASE_URL}/leagues-classic/${OFFICIAL_LEAGUE_ID}/standings/?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(15000),
      headers: { accept: "application/json" },
    },
  );
  if (!response.ok) throw new Error(`FPL league lookup returned HTTP ${response.status}.`);
  return (await response.json()) as LeagueResponse;
}

async function resolveOfficialLeagueEntry(teamName: string, managerName: string) {
  const targetTeam = normalizeName(teamName);
  const targetManager = normalizeName(managerName);
  if (!targetTeam) throw new Error("Enter your exact FPL team name.");
  if (!targetManager) throw new Error("Enter your exact FPL manager name.");

  const rows = new Map<number, LeagueRow>();
  const addRows = (items?: LeagueRow[]) => {
    for (const row of items ?? []) {
      if (Number.isInteger(row.entry) && row.entry && row.entry > 0) rows.set(row.entry, row);
    }
  };

  const firstPage = await fetchLeaguePage(1, 1);
  addRows(firstPage.standings?.results);
  addRows(firstPage.new_entries?.results);

  let standingsPage = 1;
  while (firstPage.standings?.has_next && standingsPage < MAX_LEAGUE_PAGES) {
    standingsPage += 1;
    const page = await fetchLeaguePage(standingsPage, 1);
    addRows(page.standings?.results);
    if (!page.standings?.has_next) break;
  }

  let newEntriesPage = 1;
  while (firstPage.new_entries?.has_next && newEntriesPage < MAX_LEAGUE_PAGES) {
    newEntriesPage += 1;
    const page = await fetchLeaguePage(1, newEntriesPage);
    addRows(page.new_entries?.results);
    if (!page.new_entries?.has_next) break;
  }

  const matches = [...rows.values()].filter(
    (row) =>
      normalizeName(row.entry_name ?? "") === targetTeam &&
      normalizeName(rowManagerName(row)) === targetManager,
  );

  if (matches.length === 0) {
    throw new Error("No matching team was found in the official Vult FPL league.");
  }
  if (matches.length > 1) {
    throw new Error("More than one matching team was found. Contact Vult support.");
  }

  const match = matches[0];
  return {
    entryId: String(match.entry),
    teamName: match.entry_name?.trim() || teamName.trim(),
    managerName: rowManagerName(match) || managerName.trim(),
  };
}

function safeErrorMessage(message: string) {
  return SAFE_MESSAGES.find((safeMessage) => message.includes(safeMessage)) ??
    "We could not submit your registration. Review your details and try again.";
}

export async function submitRegistrationAction(
  _previousState: RegistrationState,
  formData: FormData,
): Promise<RegistrationState> {
  const competitionSlug = value(formData, "competition_slug");
  const teamName = value(formData, "fpl_team_name");
  const managerName = value(formData, "fpl_manager_name");

  if (!competitionSlug || !teamName || !managerName) {
    return { error: "Complete all required registration fields." };
  }

  let data: any;

  try {
    const resolved = await resolveOfficialLeagueEntry(teamName, managerName);
    const db = createAdminSupabaseClient() as any;
    const response = await db.rpc("submit_public_registration", {
      p_competition_season_slug: competitionSlug,
      p_full_name: value(formData, "full_name"),
      p_phone: value(formData, "phone"),
      p_whatsapp_phone: value(formData, "whatsapp_phone"),
      p_email: value(formData, "email"),
      p_country: value(formData, "country"),
      p_fpl_entry_id: resolved.entryId,
      p_fpl_team_name: resolved.teamName,
      p_fpl_manager_name: resolved.managerName,
      p_rules_consent: formData.get("rules_consent") === "on",
      p_privacy_consent: formData.get("privacy_consent") === "on",
      p_publicity_consent: formData.get("publicity_consent") === "on",
      p_honeypot: value(formData, "company"),
    });

    if (response.error) return { error: safeErrorMessage(response.error.message) };
    data = response.data;
  } catch (error) {
    console.error("Public registration error", error);
    return {
      error: safeErrorMessage(error instanceof Error ? error.message : "Unable to submit this registration."),
    };
  }

  const result = Array.isArray(data) ? data[0] : data;
  const reference = result?.registration_reference;

  if (!reference) {
    return { error: "Your registration was received, but the confirmation reference was unavailable." };
  }

  redirect(`/register/success?reference=${encodeURIComponent(reference)}`);
}
