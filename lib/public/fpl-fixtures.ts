import "server-only";

const FPL_BASE_URL = "https://fantasy.premierleague.com/api";
const GAMEWEEK_ONE_DEADLINE_FALLBACK = "2026-08-21T17:30:00Z";
const GAMEWEEK_ONE_KICKOFF_FALLBACK = "2026-08-21T19:00:00Z";

export type PublicFixture = {
  id: number;
  kickoffTime: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  started: boolean;
  finished: boolean;
};

export type PublicGameweek = {
  id: number;
  name: string;
  deadlineTime: string;
  firstKickoffTime: string;
  fixtures: PublicFixture[];
  sourceAvailable: boolean;
};

type BootstrapTeam = { id?: number; name?: string };
type BootstrapEvent = {
  id?: number;
  name?: string;
  deadline_time?: string;
};
type FixtureRow = {
  id?: number;
  kickoff_time?: string | null;
  team_h?: number;
  team_a?: number;
  team_h_score?: number | null;
  team_a_score?: number | null;
  started?: boolean;
  finished?: boolean;
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${FPL_BASE_URL}${path}`, {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: "application/json",
      "user-agent": "VultFantasyPlatform/1.0 public-fixtures",
    },
  });
  if (!response.ok) throw new Error(`FPL returned HTTP ${response.status} for ${path}.`);
  return (await response.json()) as T;
}

function mapFixtures(teams: Map<number, string>, fixtures: FixtureRow[]) {
  return fixtures
    .filter((fixture) => Number.isInteger(fixture.id))
    .map((fixture) => ({
      id: fixture.id as number,
      kickoffTime: fixture.kickoff_time ?? null,
      homeTeam: teams.get(fixture.team_h ?? -1) ?? "Home team",
      awayTeam: teams.get(fixture.team_a ?? -1) ?? "Away team",
      homeScore: typeof fixture.team_h_score === "number" ? fixture.team_h_score : null,
      awayScore: typeof fixture.team_a_score === "number" ? fixture.team_a_score : null,
      started: fixture.started === true,
      finished: fixture.finished === true,
    }))
    .sort((a, b) => {
      if (!a.kickoffTime) return 1;
      if (!b.kickoffTime) return -1;
      return new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime();
    });
}

export async function getPublicGameweek(eventId = 1): Promise<PublicGameweek> {
  try {
    const [bootstrap, fixtures] = await Promise.all([
      fetchJson<{ events?: BootstrapEvent[]; teams?: BootstrapTeam[] }>("/bootstrap-static/"),
      fetchJson<FixtureRow[]>(`/fixtures/?event=${eventId}`),
    ]);
    const teams = new Map(
      (bootstrap.teams ?? [])
        .filter((team) => Number.isInteger(team.id) && typeof team.name === "string")
        .map((team) => [team.id as number, team.name as string]),
    );
    const event = (bootstrap.events ?? []).find((item) => item.id === eventId);
    const mappedFixtures = mapFixtures(teams, Array.isArray(fixtures) ? fixtures : []);
    const firstKickoff = mappedFixtures.find((fixture) => fixture.kickoffTime)?.kickoffTime;

    return {
      id: eventId,
      name: event?.name ?? `Gameweek ${eventId}`,
      deadlineTime:
        event?.deadline_time ??
        (eventId === 1 ? GAMEWEEK_ONE_DEADLINE_FALLBACK : new Date().toISOString()),
      firstKickoffTime:
        firstKickoff ??
        (eventId === 1 ? GAMEWEEK_ONE_KICKOFF_FALLBACK : event?.deadline_time ?? new Date().toISOString()),
      fixtures: mappedFixtures,
      sourceAvailable: true,
    };
  } catch (error) {
    console.error("Unable to load public FPL gameweek", error);
    return {
      id: eventId,
      name: `Gameweek ${eventId}`,
      deadlineTime:
        eventId === 1 ? GAMEWEEK_ONE_DEADLINE_FALLBACK : new Date().toISOString(),
      firstKickoffTime:
        eventId === 1 ? GAMEWEEK_ONE_KICKOFF_FALLBACK : new Date().toISOString(),
      fixtures: [],
      sourceAvailable: false,
    };
  }
}

export async function getPublicGameweekFixtures(eventId = 1): Promise<PublicFixture[]> {
  return (await getPublicGameweek(eventId)).fixtures;
}
