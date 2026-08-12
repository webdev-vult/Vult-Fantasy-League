import "server-only";
import { fetchOfficialFplJson } from "./fpl-http";

const MAX_PAGES = 500;

type LeagueRow = {
  entry?: number;
  entry_name?: string;
  player_name?: string;
  player_first_name?: string;
  player_last_name?: string;
};

type LeaguePage = {
  has_next?: boolean;
  results?: LeagueRow[];
};

type LeagueResponse = {
  league?: { id?: number; name?: string };
  standings?: LeaguePage;
  new_entries?: LeaguePage;
};

export type FplLeagueIdentity = {
  entryId: string;
  teamName: string;
  managerName: string;
  leagueId: string;
  leagueName: string | null;
};

function normalizeIdentity(value: string) {
  return value
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

function rows(page?: LeaguePage) {
  return Array.isArray(page?.results) ? page.results : [];
}

function endpoint(leagueId: string, standingsPage: number, newEntriesPage: number) {
  const params = new URLSearchParams({
    page_standings: String(standingsPage),
    page_new_entries: String(newEntriesPage),
  });

  return `/leagues-classic/${encodeURIComponent(leagueId)}/standings/?${params.toString()}`;
}

async function fetchPage(path: string) {
  return fetchOfficialFplJson<LeagueResponse>(path, {
    timeoutMs: 15_000,
    attempts: 3,
    userAgent: "VultFantasyPlatform/1.0 league-registration-lookup",
  });
}

async function getAllLeagueRows(leagueId: string) {
  if (!/^\d+$/.test(leagueId)) {
    throw new Error("The official FPL league ID is invalid.");
  }

  const first = await fetchPage(endpoint(leagueId, 1, 1));
  const returnedLeagueId = first.league?.id;
  if (typeof returnedLeagueId === "number" && String(returnedLeagueId) !== leagueId) {
    throw new Error("FPL returned a different league from the configured Vult league.");
  }

  const collected = new Map<string, LeagueRow>();
  const add = (items: LeagueRow[]) => {
    for (const row of items) {
      if (Number.isInteger(row.entry) && Number(row.entry) > 0) {
        collected.set(String(row.entry), row);
      }
    }
  };

  add(rows(first.standings));
  add(rows(first.new_entries));

  let page = 1;
  let hasNext = first.standings?.has_next === true;
  while (hasNext) {
    page += 1;
    if (page > MAX_PAGES) {
      throw new Error("The Vult FPL league exceeded the lookup safety limit.");
    }
    const result = await fetchPage(endpoint(leagueId, page, 1));
    add(rows(result.standings));
    hasNext = result.standings?.has_next === true;
  }

  page = 1;
  hasNext = first.new_entries?.has_next === true;
  while (hasNext) {
    page += 1;
    if (page > MAX_PAGES) {
      throw new Error("The Vult FPL new-entry list exceeded the lookup safety limit.");
    }
    const result = await fetchPage(endpoint(leagueId, 1, page));
    add(rows(result.new_entries));
    hasNext = result.new_entries?.has_next === true;
  }

  return {
    leagueName: typeof first.league?.name === "string" ? first.league.name : null,
    rows: [...collected.values()],
  };
}

export async function resolveOfficialFplLeagueIdentity(input: {
  leagueId: string;
  teamName: string;
  managerName: string;
}): Promise<FplLeagueIdentity> {
  const requestedTeam = input.teamName.trim();
  const requestedManager = input.managerName.trim();

  if (requestedTeam.length < 2 || requestedTeam.length > 120) {
    throw new Error("Enter your exact FPL team name.");
  }
  if (requestedManager.length < 3 || requestedManager.length > 120) {
    throw new Error("Enter your exact FPL manager name.");
  }

  const league = await getAllLeagueRows(input.leagueId);
  const teamKey = normalizeIdentity(requestedTeam);
  const managerKey = normalizeIdentity(requestedManager);
  const matches = league.rows.filter(
    (row) =>
      normalizeIdentity(row.entry_name ?? "") === teamKey &&
      normalizeIdentity(rowManagerName(row)) === managerKey,
  );

  if (matches.length === 0) {
    throw new Error("No matching team was found in the official Vult FPL league.");
  }
  if (matches.length > 1) {
    throw new Error("More than one matching team was found. Contact Vult support.");
  }

  const match = matches[0];
  if (!Number.isInteger(match.entry) || Number(match.entry) < 1) {
    throw new Error("The FPL team could not be resolved to a valid Entry ID.");
  }

  return {
    entryId: String(match.entry),
    teamName: match.entry_name?.trim() || requestedTeam,
    managerName: rowManagerName(match) || requestedManager,
    leagueId: input.leagueId,
    leagueName: league.leagueName,
  };
}
