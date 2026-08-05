import "server-only";

const FPL_BASE_URL = "https://fantasy.premierleague.com/api";
const FALLBACK_DEADLINE = "2026-08-21T17:30:00Z";
const FALLBACK_FIRST_KICKOFF = "2026-08-21T19:00:00Z";

type BootstrapTeam = {
  id?: number;
  name?: string;
  short_name?: string;
};

type BootstrapEvent = {
  id?: number;
  name?: string;
  deadline_time?: string;
};

type BootstrapResponse = {
  events?: BootstrapEvent[];
  teams?: BootstrapTeam[];
};

type FixtureResponse = {
  id?: number;
  event?: number | null;
  kickoff_time?: string | null;
  team_h?: number;
  team_a?: number;
  team_h_score?: number | null;
  team_a_score?: number | null;
  started?: boolean;
  finished?: boolean;
};

export type PublicFixture = {
  id: number;
  kickoffTime: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  started: boolean;
  finished: boolean;
};

export type PublicGameweekOne = {
  name: string;
  deadlineTime: string;
  firstKickoffTime: string;
  fixturesVisible: boolean;
  fixtures: PublicFixture[];
  sourceAvailable: boolean;
};

async function getJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${FPL_BASE_URL}${path}`, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "VultFantasyPlatform/1.0 public-fixtures",
      },
    });

    if (!response.ok) throw new Error(`FPL returned HTTP ${response.status}.`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getPublicGameweekOne(): Promise<PublicGameweekOne> {
  try {
    const [bootstrap, fixtures] = await Promise.all([
      getJson<BootstrapResponse>("/bootstrap-static/"),
      getJson<FixtureResponse[]>("/fixtures/?event=1"),
    ]);

    const teams = new Map(
      (bootstrap.teams ?? [])
        .filter((team) => Number.isInteger(team.id))
        .map((team) => [Number(team.id), team.name ?? team.short_name ?? `Team ${team.id}`]),
    );
    const event = (bootstrap.events ?? []).find((item) => item.id === 1);
    const validFixtures = (Array.isArray(fixtures) ? fixtures : [])
      .filter(
        (fixture) =>
          Number.isInteger(fixture.id) &&
          typeof fixture.kickoff_time === "string" &&
          Number.isInteger(fixture.team_h) &&
          Number.isInteger(fixture.team_a),
      )
      .sort((a, b) => String(a.kickoff_time).localeCompare(String(b.kickoff_time)));

    const firstKickoffTime = validFixtures[0]?.kickoff_time ?? FALLBACK_FIRST_KICKOFF;

    return {
      name: event?.name ?? "Gameweek 1",
      deadlineTime: event?.deadline_time ?? FALLBACK_DEADLINE,
      firstKickoffTime,
      fixturesVisible: Date.now() >= new Date(firstKickoffTime).getTime(),
      fixtures: validFixtures.map((fixture) => ({
        id: Number(fixture.id),
        kickoffTime: String(fixture.kickoff_time),
        homeTeam: teams.get(Number(fixture.team_h)) ?? `Team ${fixture.team_h}`,
        awayTeam: teams.get(Number(fixture.team_a)) ?? `Team ${fixture.team_a}`,
        homeScore: typeof fixture.team_h_score === "number" ? fixture.team_h_score : null,
        awayScore: typeof fixture.team_a_score === "number" ? fixture.team_a_score : null,
        started: fixture.started === true,
        finished: fixture.finished === true,
      })),
      sourceAvailable: true,
    };
  } catch (error) {
    console.error("Unable to load public FPL Gameweek 1 data", error);
    return {
      name: "Gameweek 1",
      deadlineTime: FALLBACK_DEADLINE,
      firstKickoffTime: FALLBACK_FIRST_KICKOFF,
      fixturesVisible: Date.now() >= new Date(FALLBACK_FIRST_KICKOFF).getTime(),
      fixtures: [],
      sourceAvailable: false,
    };
  }
}

export function formatFixtureDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}
