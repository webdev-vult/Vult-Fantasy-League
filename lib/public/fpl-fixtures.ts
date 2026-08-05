const FPL_BASE_URL = "https://fantasy.premierleague.com/api";

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

type BootstrapTeam = { id?: number; name?: string };
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
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`FPL returned HTTP ${response.status} for ${path}.`);
  return (await response.json()) as T;
}

export async function getPublicGameweekFixtures(eventId = 1): Promise<PublicFixture[]> {
  try {
    const [bootstrap, fixtures] = await Promise.all([
      fetchJson<{ teams?: BootstrapTeam[] }>("/bootstrap-static/"),
      fetchJson<FixtureRow[]>(`/fixtures/?event=${eventId}`),
    ]);
    const teams = new Map(
      (bootstrap.teams ?? [])
        .filter((team) => Number.isInteger(team.id) && typeof team.name === "string")
        .map((team) => [team.id as number, team.name as string]),
    );

    return (Array.isArray(fixtures) ? fixtures : [])
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
  } catch (error) {
    console.error("Unable to load public FPL fixtures", error);
    return [];
  }
}
