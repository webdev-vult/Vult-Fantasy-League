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

const READ_ONLY_ENDPOINTS = [
  "/bootstrap-static/",
  "/event-status/",
  "/entry/{entryId}/",
  "/entry/{entryId}/history/",
  "/entry/{entryId}/event/{eventId}/picks/",
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
}): Promise<ApprovedFplHealth> {
  const baseUrl = resolveBaseUrl(input?.baseUrl);
  const timeoutSeconds = Math.min(120, Math.max(5, input?.timeoutSeconds ?? 30));
  const bootstrap = await fetchJson<FplBootstrap>(baseUrl, "/bootstrap-static/", timeoutSeconds);
  const events = Array.isArray(bootstrap.events) ? bootstrap.events : [];
  if (!events.length) throw new Error("FPL bootstrap data did not contain any Gameweeks.");

  return {
    ok: true,
    baseUrl,
    checkedAt: new Date().toISOString(),
    eventCount: events.length,
    totalPlayers: integer(bootstrap.total_players),
    currentEvent: events.find((event) => event.is_current)?.id ?? null,
    nextEvent: events.find((event) => event.is_next)?.id ?? null,
    allowedEndpoints: READ_ONLY_ENDPOINTS,
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
    const bootstrap = await fetchJson<FplBootstrap>(baseUrl, "/bootstrap-static/", timeoutSeconds);
    const events = Array.isArray(bootstrap.events) ? bootstrap.events : [];
    const event = events.find((item) => item.id === eventId);
    if (!event) throw new Error(`FPL bootstrap data does not contain Gameweek ${eventId}.`);

    const records: ProviderRecordInput[] = [];
    const issues: ProviderValidationIssue[] = [];
    const rawEntries: Array<Record<string, unknown>> = [];

    for (let start = 0; start < input.entries.length; start += concurrency) {
      const chunk = input.entries.slice(start, start + concurrency);
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

        records.push({
          provider_entry_id: result.entry.provider_entry_id,
          external_round_id: eventId,
          manager_name: result.entry.manager_name,
          team_name: result.entry.team_name,
          reported_points: integer(historyRow.points),
          total_points: integer(historyRow.total_points),
          transfer_cost: integer(historyRow.event_transfers_cost, 0) ?? 0,
          chip_used: chipForEvent(result.history, result.picks, eventId),
          round_rank: integer(historyRow.rank),
          overall_rank: integer(historyRow.overall_rank),
          is_provisional: !(event.finished === true && event.data_checked === true),
          raw_record: {
            provider: "approved_fpl",
            read_only: true,
            event: eventId,
            entry_history: historyRow,
            active_chip: result.picks.active_chip ?? null,
            automatic_subs: result.picks.automatic_subs ?? [],
            picks: result.picks.picks ?? [],
          },
        });

        rawEntries.push({
          provider_entry_id: result.entry.provider_entry_id,
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
      sourceEndpoint: `${baseUrl}/entry/{entryId}/history/ + /entry/{entryId}/event/${eventId}/picks/`,
      responseData: {
        provider: "approved_fpl",
        contract_version: "2026.27.1",
        read_only: true,
        fetched_at: new Date().toISOString(),
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
