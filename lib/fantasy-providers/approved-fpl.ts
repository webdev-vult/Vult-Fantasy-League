import type {
  FantasyDataProvider,
  PreparedProviderBatch,
  ProviderEntryContext,
  ProviderRecordInput,
  ProviderRoundContext,
  ProviderValidationIssue,
} from "./types";

const DEFAULT_FPL_BASE_URL = "https://fantasy.premierleague.com/api";
const ALLOWED_FPL_HOST = "fantasy.premierleague.com";
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;
const MAX_LEAGUE_PAGES = 500;

const READ_ONLY_ENDPOINTS = [
  "/bootstrap-static/",
  "/event-status/",
  "/entry/{entryId}/",
  "/entry/{entryId}/history/",
  "/entry/{entryId}/event/{eventId}/picks/",
  "/leagues-classic/{leagueId}/standings/",
] as const;

type FplEvent = {
  id: number;
  name?: string;
  finished?: boolean;
  data_checked?: boolean;
  is_current?: boolean;
  is_next?: boolean;
  deadline_time?: string;
  [key: string]: unknown;
};

type FplBootstrap = {
  events?: FplEvent[];
  total_players?: number;
  [key: string]: unknown;
};

type FplHistoryEvent = {
  event?: number;
  points?: number;
  total_points?: number;
  rank?: number | null;
  overall_rank?: number | null;
  event_transfers_cost?: number;
  [key: string]: unknown;
};

type FplHistory = {
  current?: FplHistoryEvent[];
  chips?: Array<{ name?: string; event?: number; [key: string]: unknown }>;
  [key: string]: unknown;
};

type FplPicks = {
  active_chip?: string | null;
  entry_history?: FplHistoryEvent;
  automatic_subs?: unknown[];
  picks?: unknown[];
  [key: string]: unknown;
};

type FplLeagueStanding = {
  entry?: number;
  entry_name?: string;
  player_name?: string;
  player_first_name?: string;
  player_last_name?: string;
  rank?: number | null;
  last_rank?: number | null;
  event_total?: number | null;
  total?: number | null;
  [key: string]: unknown;
};

type FplLeaguePage = {
  has_next?: boolean;
  page?: number;
  results?: FplLeagueStanding[];
  [key: string]: unknown;
};

type FplLeagueStandingsResponse = {
  league?: {
    id?: number;
    name?: string;
    [key: string]: unknown;
  };
  standings?: FplLeaguePage;
  new_entries?: FplLeaguePage;
  [key: string]: unknown;
};

type FplLeagueSnapshot = {
  id: number;
  name: string | null;
  standings: FplLeagueStanding[];
  pagesFetched: number;
};

type EntryFetchResult =
  | {
      ok: true;
      entry: ProviderEntryContext;
      history: FplHistory;
      picks: FplPicks;
    }
  | {
      ok: false;
      entry: ProviderEntryContext;
      error: unknown;
    };

export type ApprovedFplProviderInput = {
  entries: ProviderEntryContext[];
  round: ProviderRoundContext;
  timeoutSeconds?: number;
  concurrency?: number;
  baseUrl?: string;
  leagueId?: string | number | null;
  requireLeagueMembership?: boolean;
};

export type ApprovedFplHealth = {
  ok: true;
  baseUrl: string;
  checkedAt: string;
  eventCount: number;
  totalPlayers: number | null;
  currentEvent: number | null;
  nextEvent: number | null;
  allowedEndpoints: readonly string[];
  league: null | {
    id: number;
    name: string | null;
    standingsPageEntries: number;
    newEntriesPageEntries: number;
    hasMoreStandings: boolean;
    hasMoreNewEntries: boolean;
  };
};

class FplRequestError extends Error {
  readonly status: number | null;
  readonly retriable: boolean;
  readonly endpoint: string;

  constructor(message: string, endpoint: string, status: number | null, retriable: boolean) {
    super(message);
    this.name = "FplRequestError";
    this.endpoint = endpoint;
    this.status = status;
    this.retriable = retriable;
  }
}

function resolveBaseUrl(input?: string) {
  const url = new URL(input || process.env.FPL_BASE_URL || DEFAULT_FPL_BASE_URL);
  if (url.protocol !== "https:" || url.hostname !== ALLOWED_FPL_HOST) {
    throw new Error("The FPL connector only permits HTTPS requests to fantasy.premierleague.com.");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString();
}

function integer(value: unknown, fallback: number | null = null) {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function normalizeLeagueId(value: string | number | null | undefined) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const leagueId = Number.parseInt(String(value), 10);
  if (!Number.isInteger(leagueId) || leagueId < 1 || String(leagueId) !== String(value).trim()) {
    throw new Error("The FPL classic league ID must be a positive integer.");
  }
  return leagueId;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJson<T>(baseUrl: string, endpoint: string, timeoutSeconds: number): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "VultFantasyPlatform/1.0 read-only-provider",
        },
      });

      const declaredBytes = Number(response.headers.get("content-length") ?? "0");
      if (declaredBytes > MAX_RESPONSE_BYTES) {
        throw new FplRequestError("The FPL response exceeded the size limit.", endpoint, response.status, false);
      }

      if (!response.ok) {
        const retriable = response.status === 429 || response.status >= 500;
        const requestError = new FplRequestError(
          `FPL returned HTTP ${response.status} for ${endpoint}.`,
          endpoint,
          response.status,
          retriable,
        );
        if (!retriable || attempt === 3) throw requestError;
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await sleep(retryAfter > 0 ? retryAfter * 1000 : attempt * 750);
        lastError = requestError;
        continue;
      }

      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
        throw new FplRequestError("The FPL response exceeded the size limit.", endpoint, response.status, false);
      }

      try {
        return JSON.parse(body) as T;
      } catch {
        throw new FplRequestError("FPL returned invalid JSON.", endpoint, response.status, true);
      }
    } catch (error) {
      lastError = error;
      const retriable =
        error instanceof FplRequestError ? error.retriable : error instanceof Error && error.name === "AbortError";
      if (!retriable || attempt === 3) {
        if (error instanceof FplRequestError) throw error;
        throw new FplRequestError(
          error instanceof Error && error.name === "AbortError"
            ? `FPL request timed out after ${timeoutSeconds} seconds.`
            : error instanceof Error
              ? error.message
              : "FPL request failed.",
          endpoint,
          null,
          retriable,
        );
      }
      await sleep(attempt * 750);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("FPL request failed.");
}

function leagueEndpoint(leagueId: number, standingsPage: number, newEntriesPage: number) {
  const params = new URLSearchParams({
    page_standings: String(standingsPage),
    page_new_entries: String(newEntriesPage),
  });
  return `/leagues-classic/${leagueId}/standings/?${params.toString()}`;
}

function leagueRows(page: FplLeaguePage | undefined) {
  return Array.isArray(page?.results) ? page.results : [];
}

function addLeagueRows(target: Map<string, FplLeagueStanding>, rows: FplLeagueStanding[]) {
  for (const row of rows) {
    const entryId = integer(row.entry);
    if (entryId) target.set(String(entryId), row);
  }
}

async function fetchLeagueFirstPage(baseUrl: string, leagueId: number, timeoutSeconds: number) {
  const endpoint = leagueEndpoint(leagueId, 1, 1);
  const response = await fetchJson<FplLeagueStandingsResponse>(baseUrl, endpoint, timeoutSeconds);
  const returnedLeagueId = integer(response.league?.id);
  if (returnedLeagueId !== null && returnedLeagueId !== leagueId) {
    throw new Error(`FPL returned league ${returnedLeagueId} instead of league ${leagueId}.`);
  }
  return response;
}

async function fetchAllLeagueStandings(
  baseUrl: string,
  leagueId: number,
  timeoutSeconds: number,
): Promise<FplLeagueSnapshot> {
  const firstPage = await fetchLeagueFirstPage(baseUrl, leagueId, timeoutSeconds);
  const rows = new Map<string, FplLeagueStanding>();
  addLeagueRows(rows, leagueRows(firstPage.standings));
  addLeagueRows(rows, leagueRows(firstPage.new_entries));

  let pagesFetched = 1;
  let standingsPage = 1;
  let hasNextStandings = firstPage.standings?.has_next === true;
  while (hasNextStandings) {
    standingsPage += 1;
    if (standingsPage > MAX_LEAGUE_PAGES) {
      throw new Error(`FPL league ${leagueId} exceeded the ${MAX_LEAGUE_PAGES}-page safety limit.`);
    }
    const page = await fetchJson<FplLeagueStandingsResponse>(
      baseUrl,
      leagueEndpoint(leagueId, standingsPage, 1),
      timeoutSeconds,
    );
    pagesFetched += 1;
    addLeagueRows(rows, leagueRows(page.standings));
    hasNextStandings = page.standings?.has_next === true;
  }

  let newEntriesPage = 1;
  let hasNextNewEntries = firstPage.new_entries?.has_next === true;
  while (hasNextNewEntries) {
    newEntriesPage += 1;
    if (newEntriesPage > MAX_LEAGUE_PAGES) {
      throw new Error(`FPL league ${leagueId} new entries exceeded the ${MAX_LEAGUE_PAGES}-page safety limit.`);
    }
    const page = await fetchJson<FplLeagueStandingsResponse>(
      baseUrl,
      leagueEndpoint(leagueId, 1, newEntriesPage),
      timeoutSeconds,
    );
    pagesFetched += 1;
    addLeagueRows(rows, leagueRows(page.new_entries));
    hasNextNewEntries = page.new_entries?.has_next === true;
  }

  return {
    id: leagueId,
    name: typeof firstPage.league?.name === "string" ? firstPage.league.name : null,
    standings: [...rows.values()],
    pagesFetched,
  };
}

function chipForEvent(history: FplHistory, picks: FplPicks, eventId: number) {
  if (typeof picks.active_chip === "string" && picks.active_chip.trim()) return picks.active_chip.trim();
  const chip = history.chips?.find((item) => item.event === eventId)?.name;
  return typeof chip === "string" && chip.trim() ? chip.trim() : null;
}

function fetchIssue(entry: ProviderEntryContext, eventId: number, error: unknown): ProviderValidationIssue {
  const requestError = error instanceof FplRequestError ? error : null;
  return {
    provider_entry_id: entry.provider_entry_id,
    external_round_id: eventId,
    stage: "fetch",
    error_code: requestError?.status === 404 ? "fpl_entry_or_round_not_found" : "fpl_request_failed",
    message: error instanceof Error ? error.message : "Unable to retrieve FPL data.",
    retriable: requestError?.retriable ?? true,
    details: {
      endpoint: requestError?.endpoint ?? null,
      http_status: requestError?.status ?? null,
      read_only: true,
    },
  };
}

function membershipIssue(entry: ProviderEntryContext, eventId: number, leagueId: number): ProviderValidationIssue {
  return {
    provider_entry_id: entry.provider_entry_id,
    external_round_id: eventId,
    stage: "validation",
    error_code: "fpl_entry_not_in_official_league",
    message: `FPL Entry ID ${entry.provider_entry_id} was not found in official league ${leagueId}.`,
    retriable: false,
    details: {
      league_id: leagueId,
      required_membership: true,
      read_only: true,
    },
  };
}

async function fetchEntry(
  baseUrl: string,
  entry: ProviderEntryContext,
  eventId: number,
  timeoutSeconds: number,
): Promise<EntryFetchResult> {
  if (!/^\d+$/.test(entry.provider_entry_id)) {
    return {
      ok: false,
      entry,
      error: new FplRequestError("The FPL Entry ID must contain digits only.", "entry", null, false),
    };
  }

  try {
    const entryId = encodeURIComponent(entry.provider_entry_id);
    const [history, picks] = await Promise.all([
      fetchJson<FplHistory>(baseUrl, `/entry/${entryId}/history/`, timeoutSeconds),
      fetchJson<FplPicks>(baseUrl, `/entry/${entryId}/event/${eventId}/picks/`, timeoutSeconds),
    ]);
    return { ok: true, entry, history, picks };
  } catch (error) {
    return { ok: false, entry, error };
  }
}

export async function testApprovedFplConnection(input?: {
  timeoutSeconds?: number;
  baseUrl?: string;
  leagueId?: string | number | null;
}): Promise<ApprovedFplHealth> {
  const baseUrl = resolveBaseUrl(input?.baseUrl);
  const timeoutSeconds = Math.min(120, Math.max(5, input?.timeoutSeconds ?? 30));
  const bootstrap = await fetchJson<FplBootstrap>(baseUrl, "/bootstrap-static/", timeoutSeconds);
  const events = Array.isArray(bootstrap.events) ? bootstrap.events : [];
  if (!events.length) throw new Error("FPL bootstrap data did not contain any Gameweeks.");

  const leagueId = normalizeLeagueId(input?.leagueId);
  const leaguePage = leagueId ? await fetchLeagueFirstPage(baseUrl, leagueId, timeoutSeconds) : null;

  return {
    ok: true,
    baseUrl,
    checkedAt: new Date().toISOString(),
    eventCount: events.length,
    totalPlayers: integer(bootstrap.total_players),
    currentEvent: events.find((event) => event.is_current)?.id ?? null,
    nextEvent: events.find((event) => event.is_next)?.id ?? null,
    allowedEndpoints: READ_ONLY_ENDPOINTS,
    league: leagueId && leaguePage
      ? {
          id: leagueId,
          name: typeof leaguePage.league?.name === "string" ? leaguePage.league.name : null,
          standingsPageEntries: leagueRows(leaguePage.standings).length,
          newEntriesPageEntries: leagueRows(leaguePage.new_entries).length,
          hasMoreStandings: leaguePage.standings?.has_next === true,
          hasMoreNewEntries: leaguePage.new_entries?.has_next === true,
        }
      : null,
  };
}

export class ApprovedFplProvider implements FantasyDataProvider<ApprovedFplProviderInput> {
  readonly kind = "approved_fpl" as const;

  async prepare(input: ApprovedFplProviderInput): Promise<PreparedProviderBatch> {
    if (!input.entries.length) throw new Error("No fantasy entries were supplied to the FPL provider.");

    const baseUrl = resolveBaseUrl(input.baseUrl);
    const timeoutSeconds = Math.min(120, Math.max(5, input.timeoutSeconds ?? 30));
    const concurrency = Math.min(5, Math.max(1, input.concurrency ?? 3));
    const eventId = input.round.external_round_id;
    const leagueId = normalizeLeagueId(input.leagueId);
    const requireLeagueMembership = input.requireLeagueMembership ?? leagueId !== null;
    if (requireLeagueMembership && !leagueId) {
      throw new Error("A numeric FPL league ID is required before official-league membership can be enforced.");
    }

    const bootstrap = await fetchJson<FplBootstrap>(baseUrl, "/bootstrap-static/", timeoutSeconds);
    const events = Array.isArray(bootstrap.events) ? bootstrap.events : [];
    const event = events.find((item) => item.id === eventId);
    if (!event) throw new Error(`FPL bootstrap data does not contain Gameweek ${eventId}.`);

    const leagueSnapshot = leagueId
      ? await fetchAllLeagueStandings(baseUrl, leagueId, timeoutSeconds)
      : null;
    const leagueMemberMap = new Map(
      (leagueSnapshot?.standings ?? [])
        .map((row) => [String(integer(row.entry) ?? ""), row] as const)
        .filter(([entryId]) => entryId.length > 0),
    );

    const records: ProviderRecordInput[] = [];
    const issues: ProviderValidationIssue[] = [];
    const rawEntries: Array<Record<string, unknown>> = [];

    const eligibleEntries = input.entries.filter((entry) => {
      if (!requireLeagueMembership || !leagueId) return true;
      if (leagueMemberMap.has(entry.provider_entry_id)) return true;
      issues.push(membershipIssue(entry, eventId, leagueId));
      return false;
    });

    for (let start = 0; start < eligibleEntries.length; start += concurrency) {
      const chunk = eligibleEntries.slice(start, start + concurrency);
      const results = await Promise.all(
        chunk.map((entry) => fetchEntry(baseUrl, entry, eventId, timeoutSeconds)),
      );

      for (const result of results) {
        if (!result.ok) {
          issues.push(fetchIssue(result.entry, eventId, result.error));
          continue;
        }

        const historyRows = Array.isArray(result.history.current) ? result.history.current : [];
        const historyRow = historyRows.find((row) => row.event === eventId) ?? result.picks.entry_history;
        if (!historyRow || historyRow.event !== eventId) {
          issues.push({
            provider_entry_id: result.entry.provider_entry_id,
            external_round_id: eventId,
            stage: "parse",
            error_code: "fpl_event_history_missing",
            message: `FPL did not return a Gameweek ${eventId} history row for this entry.`,
            retriable: true,
            details: { read_only: true },
          });
          continue;
        }

        const leagueStanding = leagueMemberMap.get(result.entry.provider_entry_id) ?? null;
        const historyPoints = integer(historyRow.points);
        const historyTotal = integer(historyRow.total_points);
        const standingEventPoints = integer(leagueStanding?.event_total);
        const standingTotal = integer(leagueStanding?.total);

        records.push({
          provider_entry_id: result.entry.provider_entry_id,
          external_round_id: eventId,
          manager_name: result.entry.manager_name,
          team_name: result.entry.team_name,
          reported_points: historyPoints,
          total_points: historyTotal,
          transfer_cost: integer(historyRow.event_transfers_cost, 0) ?? 0,
          chip_used: chipForEvent(result.history, result.picks, eventId),
          round_rank: integer(historyRow.rank),
          overall_rank: integer(historyRow.overall_rank),
          is_provisional: !(event.finished === true && event.data_checked === true),
          raw_record: {
            provider: "approved_fpl",
            read_only: true,
            event: eventId,
            official_league: leagueSnapshot
              ? {
                  id: leagueSnapshot.id,
                  name: leagueSnapshot.name,
                  membership_confirmed: leagueStanding !== null,
                  standing: leagueStanding,
                  reconciliation: {
                    event_points_match:
                      standingEventPoints === null || historyPoints === null
                        ? null
                        : standingEventPoints === historyPoints,
                    total_points_match:
                      standingTotal === null || historyTotal === null
                        ? null
                        : standingTotal === historyTotal,
                  },
                }
              : null,
            entry_history: historyRow,
            active_chip: result.picks.active_chip ?? null,
            automatic_subs: result.picks.automatic_subs ?? [],
            picks: result.picks.picks ?? [],
          },
        });

        rawEntries.push({
          provider_entry_id: result.entry.provider_entry_id,
          official_league_standing: leagueStanding,
          entry_history: historyRow,
          active_chip: result.picks.active_chip ?? null,
          automatic_subs: result.picks.automatic_subs ?? [],
          picks: result.picks.picks ?? [],
        });
      }
    }

    if (!records.length) {
      throw new Error(issues[0]?.message ?? "FPL returned no usable score records.");
    }

    return {
      records,
      issues,
      sourceLabel: `FPL Gameweek ${eventId} read-only sync`,
      sourceEndpoint: leagueId
        ? `${baseUrl}/leagues-classic/${leagueId}/standings/ + /entry/{entryId}/history/ + /entry/{entryId}/event/${eventId}/picks/`
        : `${baseUrl}/entry/{entryId}/history/ + /entry/{entryId}/event/${eventId}/picks/`,
      responseData: {
        provider: "approved_fpl",
        contract_version: "2026.27.1",
        read_only: true,
        fetched_at: new Date().toISOString(),
        official_league: leagueSnapshot
          ? {
              id: leagueSnapshot.id,
              name: leagueSnapshot.name,
              member_count: leagueSnapshot.standings.length,
              pages_fetched: leagueSnapshot.pagesFetched,
              membership_required: requireLeagueMembership,
            }
          : null,
        event: {
          id: event.id,
          name: event.name ?? input.round.name,
          deadline_time: event.deadline_time ?? null,
          finished: event.finished === true,
          data_checked: event.data_checked === true,
        },
        entries: rawEntries,
        failed_entries: issues.map((issue) => ({
          provider_entry_id: issue.provider_entry_id,
          error_code: issue.error_code,
          message: issue.message,
        })),
      },
    };
  }
}
