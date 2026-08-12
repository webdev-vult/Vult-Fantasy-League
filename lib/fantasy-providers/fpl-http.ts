import "server-only";

const DEFAULT_FPL_BASE_URL = "https://fantasy.premierleague.com/api";
const ALLOWED_FPL_HOST = "fantasy.premierleague.com";
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;

export class FplHttpError extends Error {
  readonly status: number | null;
  readonly retriable: boolean;
  readonly endpoint: string;

  constructor(
    message: string,
    endpoint: string,
    status: number | null,
    retriable: boolean,
  ) {
    super(message);
    this.name = "FplHttpError";
    this.endpoint = endpoint;
    this.status = status;
    this.retriable = retriable;
  }
}

function resolveBaseUrl() {
  const url = new URL(process.env.FPL_BASE_URL || DEFAULT_FPL_BASE_URL);
  if (url.protocol !== "https:" || url.hostname !== ALLOWED_FPL_HOST) {
    throw new Error(
      "The FPL connector only permits HTTPS requests to fantasy.premierleague.com.",
    );
  }

  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.toString();
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchOfficialFplJson<T>(
  endpoint: string,
  options?: {
    timeoutMs?: number;
    userAgent?: string;
    attempts?: number;
  },
): Promise<T> {
  if (!endpoint.startsWith("/") || endpoint.startsWith("//")) {
    throw new Error("The FPL endpoint must be an absolute API path.");
  }

  const baseUrl = resolveBaseUrl();
  const timeoutMs = Math.max(1_000, Math.min(options?.timeoutMs ?? 15_000, 60_000));
  const attempts = Math.max(1, Math.min(options?.attempts ?? 3, 3));
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "user-agent": options?.userAgent ?? "VultFantasyPlatform/1.0 read-only-fpl",
        },
      });

      const declaredBytes = Number(response.headers.get("content-length") ?? "0");
      if (declaredBytes > MAX_RESPONSE_BYTES) {
        throw new FplHttpError(
          "The FPL response exceeded the size limit.",
          endpoint,
          response.status,
          false,
        );
      }

      if (!response.ok) {
        const retriable = response.status === 429 || response.status >= 500;
        const requestError = new FplHttpError(
          `FPL returned HTTP ${response.status} for ${endpoint}.`,
          endpoint,
          response.status,
          retriable,
        );

        if (!retriable || attempt === attempts) throw requestError;

        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await sleep(retryAfter > 0 ? retryAfter * 1_000 : attempt * 750);
        lastError = requestError;
        continue;
      }

      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) {
        throw new FplHttpError(
          "The FPL response exceeded the size limit.",
          endpoint,
          response.status,
          false,
        );
      }

      try {
        return JSON.parse(body) as T;
      } catch {
        throw new FplHttpError(
          "FPL returned invalid JSON.",
          endpoint,
          response.status,
          true,
        );
      }
    } catch (error) {
      lastError = error;
      const retriable =
        error instanceof FplHttpError
          ? error.retriable
          : error instanceof Error && error.name === "AbortError";

      if (!retriable || attempt === attempts) {
        if (error instanceof FplHttpError) throw error;
        throw new FplHttpError(
          error instanceof Error && error.name === "AbortError"
            ? `FPL request timed out after ${timeoutMs} milliseconds.`
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
