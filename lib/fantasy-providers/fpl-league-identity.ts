import "server-only";
import { fetchOfficialFplJson } from "./fpl-http";
import { matchIdentity } from "./identity-matching";

const MAX_PAGES = 500;
const LEAGUE_CACHE_TTL_MS = 90_000;
const MAX_CACHED_LEAGUES = 8;

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

type LeagueRowsResult = {
  leagueName: string | null;
  rows: LeagueRow[];
};

type LeagueCacheEntry = {
  expiresAt: number;
  value: Promise<LeagueRowsResult>;
};

const leagueCache = new Map<string, LeagueCacheEntry>();

export type FplLeagueIdentity = {
  entryId: string;
  teamName: string;
  managerName: string;
  leagueId: string;
  leagueName: string | null;
};

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

async function fetchAllLeagueRows(leagueId: string): Promise<LeagueRowsResult> {
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

function trimLeagueCache(now: number) {
  for (const [key, entry] of leagueCache) {
    if (entry.expiresAt <= now) leagueCache.delete(key);
  }

  while (leagueCache.size >= MAX_CACHED_LEAGUES) {
    const oldestKey = leagueCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    leagueCache.delete(oldestKey);
  }
}

async function getAllLeagueRows(leagueId: string) {
  if (!/^\d+$/.test(leagueId)) {
    throw new Error("The official FPL league ID is invalid.");
  }

  const now = Date.now();
  const cached = leagueCache.get(leagueId);
  if (cached && cached.expiresAt > now) return cached.value;

  if (cached) leagueCache.delete(leagueId);
  trimLeagueCache(now);

  const value = fetchAllLeagueRows(leagueId).catch((error) => {
    leagueCache.delete(leagueId);
    throw error;
  });
  leagueCache.set(leagueId, {
    expiresAt: now + LEAGUE_CACHE_TTL_MS,
    value,
  });

  return value;
}

export async function resolveOfficialFplLeagueIdentity(input: {
  leagueId: string;
  teamName: string;
  managerName: string;
}): Promise<FplLeagueIdentity> {
  const requestedTeam = input.teamName.trim();
  const requestedManager = input.managerName.trim();

  if (requestedTeam.length < 2 || requestedTeam.length > 120) {
    throw new Error("Enter a valid FPL team name.");
  }
  if (requestedManager.length < 3 || requestedManager.length > 120) {
    throw new Error("Enter a valid FPL manager name.");
  }

  const league = await getAllLeagueRows(input.leagueId);
  const result = matchIdentity(
    { teamName: requestedTeam, managerName: requestedManager },
    league.rows.map((row) => ({
      value: row,
      teamName: row.entry_name ?? "",
      managerName: rowManagerName(row),
    })),
  );

  if (result.status === "not_found") {
    throw new Error("No matching team was found in the official Vult FPL league.");
  }
  if (result.status === "ambiguous") {
    throw new Error("More than one matching team was found. Contact Vult support.");
  }

  const match = result.candidate;
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
