import "server-only";

const FPL_BASE_URL = "https://fantasy.premierleague.com/api";
const MAX_PAGES = 500;
const REQUEST_TIMEOUT_MS = 15_000;

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
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en");
}

function managerName(row: LeagueRow) {
  if (typeof row.player_name === "string" && row.player_name.trim()) {
    return row.player_name.trim();
  }

  return [row.player_first_name, row.player_last_name]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .trim();
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

async function fetchPage(path: string): Promise<LeagueResponse> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${FPL_BASE_URL}${path}`, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "VultFantasyPlatform/1.0 league-registration-lookup",
        },
      });

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === 3) {
          throw new Error(`FPL returned HTTP ${response.status} while checking the Vult league.`);
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
        continue;
      }

      return (await response.json()) as LeagueResponse;
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("The FPL league could not be checked at this time.");
}

async function getAllLeagueRows(leagueId: string) {
  if (!/^\d+$/.test(leagueId)) {
    throw new Error("The official FPL league ID is invalid.");
  }

  const first = await fetchPage(endpoint(leagueId, 1, 1));
  const returnedId = first.league?.id;
  if (typeof returnedId === "number" && String(returnedId) !== leagueId) {
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
    if (page > MAX_PAGES) throw new Error("The Vult FPL league exceeded the lookup safety limit.");
    const result = await fetchPage(endpoint(leagueId, page, 1));
    add(rows(result.standings));
    hasNext = result.standings?.has_next === true;
  }

  page = 1;
  hasNext = first.new_entries?.has_next === true;
  while (hasNext) {
    page += 1;
    if (page > MAX_PAGES) throw new Error("The Vult FPL new-entry list exceeded the lookup safety limit.");
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
    throw new Error("Enter the team name exactly as it appears in the Vult FPL league.");
  }
  if (requestedManager.length < 3 || requestedManager.length > 120) {
    throw new Error("Enter the manager name exactly as it appears in the Vult FPL league.");
  }

  const league = await getAllLeagueRows(input.leagueId);
  const teamKey = normalizeIdentity(requestedTeam);
  const managerKey = normalizeIdentity(requestedManager);
  const matches = league.rows.filter((row) => {
    const rowTeam = typeof row.entry_name === "string" ? row.entry_name : "";
    return normalizeIdentity(rowTeam) === teamKey && normalizeIdentity(managerName(row)) === managerKey;
  });

  if (matches.length === 0) {
    throw new Error(
      "We could not find that Team name and Manager name in the official Vult FPL league. Join the league first and enter both names exactly as shown in FPL.",
    );
  }

  if (matches.length > 1) {
    throw new Error(
      "More than one Vult FPL entry matches those names. Contact Vult support so the correct team can be verified.",
    );
  }

  const match = matches[0];
  if (!Number.isInteger(match.entry) || Number(match.entry) < 1) {
    throw new Error("The matching FPL league entry does not contain a valid Entry ID.");
  }

  return {
    entryId: String(match.entry),
    teamName: typeof match.entry_name === "string" ? match.entry_name.trim() : requestedTeam,
    managerName: managerName(match) || requestedManager,
    leagueId: input.leagueId,
    leagueName: league.leagueName,
  };
}
