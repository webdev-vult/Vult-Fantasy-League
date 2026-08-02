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
  const candidate = new URL(input || process.env.FPL_BASE_URL || DEFAULT_FPL_BASE_URL);
  if (candidate.protocol !== "https:" || candidate.hostname !== ALLOWED_FPL_HOST) {
    throw new Error("The FPL connector only permits HTTPS requests to fantasy.premierleague.com.");
  }
  candidate.pathname = candidate.pathname.replace(/\/$/, "");
  candidate.search = "";
  candidate.hash = "";
  return candidate.toString();
}

function safeInteger(value: unknown, fallback: number | null = null) {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchFplJson<T>(
  baseUrl: string,
  endpoint: string,
  timeoutSeconds: number,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "GET",
        cache: "no-store",
        redirect: "error",
        credentials: "omit",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": "VultFantasyPlatform/1.0 read-only-provider",
        },
      });

      const contentLength = Number(response.headers.get("content-length") ?? "0");
      if (contentLength > MAX_RESPONSE_BYTES) {
        throw new FplRequestError("The FPL response exceeded the configured size limit.", endpoint, response.status, false);
      }

      if (!response.ok) {
        const retriable = response.status === 429 || response.status >= 500;
        const error = new FplRequestError(
          `FPL returned HTTP ${response.status} for ${endpoint}.`,
          endpoint,
          response.status,
          retriable,
        );
        if (!retriable || attempt === maxAttempts) throw error;

        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await sleep(retryAfter > 0 ? retryAfter * 1000 : attempt * 750);
        lastError = error;
        continue;
      }

      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
        throw new FplRequestError("The FPL response exceeded the configured size limit.", endpoint, response.status, false);
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new FplRequestError("FPL returned an invalid JSON response.", endpoint, response.status, true);
      }
    } catch (error) {
      lastError = error;
      const retriable =
        error instanceof FplRequestError ? error.retriable : error instanceof Error && error.name === "AbortError";
      if (!retriable || attempt === maxAttempts) {
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
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("FPL request failed.");
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return results;
}

function getChip(history: FplHistory, picks: FplPicks, eventId: number) {
  if (typeof picks.active_chip === "string" && picks.active_chip.trim()) return picks.active_chip.trim();
  const historyChip = history.chips?.find((chip) => chip.event === eventId)?.name;
  return typeof historyChip === "string" && historyChip.trim() ? historyChip.trim() : null;
}

function requestIssue(entry: ProviderEntryContext, roundId: number, error: unknown): ProviderValidationIssue {
  const fplError = error instanceof FplRequestError ? error : null;
  return {
    provider_entry_id: entry.provider_entry_id,
    external_round_id: roundId,
    stage: "fetch",
    error_code: fplError?.status === 404 ? "fpl_entry_or_round_not_found" : "fpl_request_failed",
    message: error instanceof Error ? error.message : "Unable to retrieve FPL data.",
    retriable: fplError?.retriable ?? true,
    details: {
      endpoint: fplError?.endpoint ?? null,
      http_status: fplError?.status ?? null,
      read_only: true,
    },
  };
}

export async function testApprovedFplConnection(input?: {
  timeoutSeconds?: number;
  baseUrl?: string;
}): Promise<ApprovedFplHealth> {
  const baseUrl = resolveBaseUrl(input?.baseUrl);
  const timeoutSeconds = Math.min(120, Math.max(5, input?.timeoutSeconds ?? 30));
  const bootstrap = await fetchFplJson<FplBootstrap>(baseUrl, "/bootstrap-static/", timeoutSeconds);
  const events = Array.isArray(bootstrap.events) ? bootstrap.events : [];

  if (!events.length) throw new Error("FPL bootstrap data did not contain any Gameweeks.");

  return {
    ok: true,
    baseUrl,
    checkedAt: new Date().toISOString(),
    eventCount: events.length,
    totalPlayers: safeInteger(bootstrap.total_players),
    currentEvent: events.find((event) => event.is_current)?.id ?? null,
    nextEvent: events.find((event) => event.is_next)?.id ?? null,
    allowedEndpoints: READ_ONLY_ENDPOINTS,
  };
}

export class ApprovedFplProvider implements FantasyDataProvider<ApprovedFplProviderInput> {
  readonly kind = "approved_fpl" as const;

  async prepare(input: ApprovedFplProviderInput): Promise<PreparedProviderBatch> {
    const baseUrl = resolveBaseUrl(input.baseUrl);
    const timeoutSeconds = Math.min(120, Math.max(5, input.timeoutSeconds ?? 30));
    const concurrency = Math.min(5, Math.max(1, input.concurrency ?? 3));
    const eventId = input.round.external_round_id;

    const bootstrap = await fetchFplJson<FplBootstrap>(baseUrl, "/bootstrap-static/", timeoutSeconds);
    const events = Array.isArray(bootstrap.events) ? bootstrap.events : [];
    const event = events.find((item) => item.id === eventId);
    if (!event) throw new Error(`FPL bootstrap data does not contain Gameweek ${eventId}.`);

    const records: ProviderRecordInput[] = [];
    const issues: ProviderValidationIssue[] = [];
    const rawEntries: Array<Record<string, unknown>> = [];

    const results = await mapWithConcurrency(input.entries, concurrency, async (entry) => {
      if (!/^\d+$/.test(entry.provider_entry_id)) {
        return {
          entry,
          error: new FplRequestError("The FPL Entry ID must contain digits only.", "entry", null, false),
        };
      }

      try {
        const encodedEntryId = encodeURIComponent(entry.provider_entry_id);
        const [history, picks] = await Promise.all([
          fetchFplJson<FplHistory>(baseUrl, `/entry/${encodedEntryId}/history/`, timeoutSeconds),
          fetchFplJson<FplPicks>(baseUrl, `/entry/${encodedEntryId}/event/${eventId}/picks/`, timeoutSeconds),
        ]);
        return { entry, history, picks, error: null };
      } catch (error) {
        return { entry, error };
      }
    });

    for (const result of results) {
      if (result.error || !("history" in result) || !("picks" in result)) {
        issues.push(requestIssue(result.entry, eventId, result.error));
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

      const record: ProviderRecordInput = {
        provider_entry_id: result.entry.provider_entry_id,
        external_round_id: eventId,
        manager_name: result.entry.manager_name,
        team_name: result.entry.team_name,
        reported_points: safeInteger(historyRow.points),
        total_points: safeInteger(historyRow.total_points),
        transfer_cost: safeInteger(historyRow.event_transfers_cost, 0) ?? 0,
        chip_used: getChip(result.history, result.picks, eventId),
        round_rank: safeInteger(historyRow.rank),
        overall_rank: safeInteger(historyRow.overall_rank),
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
      };
      records.push(record);
      rawEntries.push({
        provider_entry_id: result.entry.provider_entry_id,
        entry_history: historyRow,
        active_chip: result.picks.active_chip ?? null,
        automatic_subs: result.picks.automatic_subs ?? [],
        picks: result.picks.picks ?? [],
      });
    }

    if (!records.length) {
      const firstIssue = issues[0]?.message ?? "FPL returned no usable score records.";
      throw new Error(firstIssue);
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
