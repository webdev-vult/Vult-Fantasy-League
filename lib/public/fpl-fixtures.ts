import "server-only";
import { fetchOfficialFplJson } from "@/lib/fantasy-providers/fpl-http";

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
  deadlineTime: string | null;
  firstKickoffTime: string | null;
  fixtures: PublicFixture[];
  sourceAvailable: boolean;
};

type BootstrapTeam = { id?: number; name?: string };
type BootstrapEvent = {
  id?: number;
  name?: string;
  deadline_time?: string;
  is_current?: boolean;
  is_next?: boolean;
  finished?: boolean;
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

function fetchJson<T>(path: string) {
  return fetchOfficialFplJson<T>(path, {
    timeoutMs: 15_000,
    attempts: 3,
    userAgent: "VultFantasyPlatform/1.0 public-fixtures",
  });
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

function selectEvent(events: BootstrapEvent[], requestedEventId?: number) {
  if (requestedEventId !== undefined) {
    return events.find((event) => event.id === requestedEventId) ?? null;
  }

  const current = events.find((event) => event.is_current === true);
  if (current) return current;

  const next = events.find((event) => event.is_next === true);
  if (next) return next;

  const upcoming = events
    .filter((event) => event.finished !== true && typeof event.deadline_time === "string")
    .sort(
      (a, b) =>
        new Date(a.deadline_time as string).getTime() -
        new Date(b.deadline_time as string).getTime(),
    )[0];
  if (upcoming) return upcoming;

  return [...events]
    .filter((event) => Number.isInteger(event.id))
    .sort((a, b) => Number(b.id) - Number(a.id))[0] ?? null;
}

export async function getPublicGameweek(eventId?: number): Promise<PublicGameweek> {
  try {
    const bootstrap = await fetchJson<{
      events?: BootstrapEvent[];
      teams?: BootstrapTeam[];
    }>("/bootstrap-static/");
    const events = Array.isArray(bootstrap.events) ? bootstrap.events : [];
    const selectedEvent = selectEvent(events, eventId);

    if (!selectedEvent || !Number.isInteger(selectedEvent.id)) {
      throw new Error("FPL did not return a valid current or upcoming Gameweek.");
    }

    const selectedEventId = selectedEvent.id as number;
    const teams = new Map(
      (bootstrap.teams ?? [])
        .filter((team) => Number.isInteger(team.id) && typeof team.name === "string")
        .map((team) => [team.id as number, team.name as string]),
    );

    let mappedFixtures: PublicFixture[] = [];
    let fixturesAvailable = true;
    try {
      const fixtures = await fetchJson<FixtureRow[]>(`/fixtures/?event=${selectedEventId}`);
      mappedFixtures = mapFixtures(teams, Array.isArray(fixtures) ? fixtures : []);
    } catch (error) {
      fixturesAvailable = false;
      console.error("Unable to load public FPL fixtures", error);
    }

    const firstKickoff = mappedFixtures.find((fixture) => fixture.kickoffTime)?.kickoffTime ?? null;

    return {
      id: selectedEventId,
      name: selectedEvent.name ?? `Gameweek ${selectedEventId}`,
      deadlineTime: selectedEvent.deadline_time ?? null,
      firstKickoffTime: firstKickoff,
      fixtures: mappedFixtures,
      sourceAvailable: fixturesAvailable,
    };
  } catch (error) {
    console.error("Unable to load public FPL gameweek", error);
    return {
      id: eventId ?? 0,
      name: eventId ? `Gameweek ${eventId}` : "Current Gameweek",
      deadlineTime: null,
      firstKickoffTime: null,
      fixtures: [],
      sourceAvailable: false,
    };
  }
}

export async function getPublicGameweekFixtures(eventId?: number): Promise<PublicFixture[]> {
  return (await getPublicGameweek(eventId)).fixtures;
}
