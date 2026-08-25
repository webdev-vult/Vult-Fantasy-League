import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { getPublicCompetition } from "@/lib/public/competition";
import {
  getPublicGameweek,
  type PublicFixture,
} from "@/lib/public/fpl-fixtures";

export const metadata: Metadata = {
  title: "Fixtures & Results",
  description:
    "Complete current and previous Gameweek fixtures and results for Vult EPL Fantasy.",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ gw?: string }>;

const FIRST_GAMEWEEK = 1;
const LAST_GAMEWEEK = 38;
const gameweekOptions = Array.from(
  { length: LAST_GAMEWEEK },
  (_, index) => index + 1,
);

function requestedGameweek(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return parsed >= FIRST_GAMEWEEK && parsed <= LAST_GAMEWEEK
    ? parsed
    : undefined;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function formatTime(value: string | null) {
  if (!value) return "TBC";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function formatDeadline(value: string | null) {
  if (!value) return "Deadline to be confirmed";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function dateKey(value: string | null) {
  if (!value) return "tbc";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function groupFixtures(fixtures: PublicFixture[]) {
  const groups = new Map<
    string,
    { label: string; fixtures: PublicFixture[] }
  >();

  for (const fixture of fixtures) {
    const key = dateKey(fixture.kickoffTime);
    const group = groups.get(key) ?? {
      label: fixture.kickoffTime
        ? formatDate(fixture.kickoffTime)
        : "Date to be confirmed",
      fixtures: [],
    };
    group.fixtures.push(fixture);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
}

function gameweekRange(fixtures: PublicFixture[]) {
  const dated = fixtures.filter(
    (fixture): fixture is PublicFixture & { kickoffTime: string } =>
      Boolean(fixture.kickoffTime),
  );
  if (!dated.length) return "Dates to be confirmed";

  const first = formatShortDate(dated[0].kickoffTime);
  const last = formatShortDate(dated[dated.length - 1].kickoffTime);
  return first === last ? first : `${first} – ${last}`;
}

function fixtureStatus(fixture: PublicFixture) {
  if (fixture.finished) return "FT";
  if (fixture.started) return "LIVE";
  return formatTime(fixture.kickoffTime);
}

function gameweekHref(gameweek: number) {
  return `/fixtures?gw=${gameweek}`;
}

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const selectedByUser = requestedGameweek(params.gw);
  const [competition, gameweek] = await Promise.all([
    getPublicCompetition(),
    getPublicGameweek(selectedByUser),
  ]);

  const selectedGameweek =
    gameweek.id >= FIRST_GAMEWEEK && gameweek.id <= LAST_GAMEWEEK
      ? gameweek.id
      : selectedByUser;
  const groupedFixtures = groupFixtures(gameweek.fixtures);
  const completedMatches = gameweek.fixtures.filter(
    (fixture) => fixture.finished,
  ).length;
  const previousGameweek =
    selectedGameweek && selectedGameweek > FIRST_GAMEWEEK
      ? selectedGameweek - 1
      : null;
  const nextGameweek =
    selectedGameweek && selectedGameweek < LAST_GAMEWEEK
      ? selectedGameweek + 1
      : null;

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen} />

      <section className="bg-[var(--brand-strong)] text-white">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end lg:px-10 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent)]">
              Official FPL schedule
            </p>
            <h1 className="mt-4 text-5xl font-black tracking-[-0.06em] sm:text-6xl">
              Fixtures &amp; Results
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-blue-100">
              Follow every match in the active Gameweek, with kickoff times and
              results shown automatically in Sierra Leone time.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:min-w-[360px]">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-200">
                Showing
              </p>
              <p className="mt-2 text-xl font-black">{gameweek.name}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-200">
                Match dates
              </p>
              <p className="mt-2 text-xl font-black">
                {gameweekRange(gameweek.fixtures)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/fixtures"
              className={`rounded-full px-4 py-2.5 text-sm font-black transition ${
                selectedByUser === undefined
                  ? "bg-[var(--brand)] text-white"
                  : "border border-[var(--border)] bg-white text-[var(--brand)] hover:bg-[var(--surface-soft)]"
              }`}
            >
              Live Gameweek
            </Link>
            {previousGameweek ? (
              <Link
                href={gameweekHref(previousGameweek)}
                aria-label={`View Gameweek ${previousGameweek}`}
                className="rounded-full border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-black text-[var(--brand)] transition hover:bg-[var(--surface-soft)]"
              >
                ← Previous
              </Link>
            ) : (
              <span aria-disabled="true" className="cursor-not-allowed rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-black text-slate-300">
                ← Previous
              </span>
            )}
            {nextGameweek ? (
              <Link
                href={gameweekHref(nextGameweek)}
                aria-label={`View Gameweek ${nextGameweek}`}
                className="rounded-full border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-black text-[var(--brand)] transition hover:bg-[var(--surface-soft)]"
              >
                Next →
              </Link>
            ) : (
              <span aria-disabled="true" className="cursor-not-allowed rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-black text-slate-300">
                Next →
              </span>
            )}
          </div>

          <form method="get" action="/fixtures" className="flex items-end gap-2">
            <label className="min-w-0 flex-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)] lg:min-w-48">
              Choose Gameweek
              <select
                name="gw"
                defaultValue={selectedGameweek ? String(selectedGameweek) : ""}
                className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-black normal-case tracking-normal text-[var(--brand-strong)]"
              >
                {!selectedGameweek ? (
                  <option value="" disabled>
                    Select a Gameweek
                  </option>
                ) : null}
                {gameweekOptions.map((gameweekNumber) => (
                  <option key={gameweekNumber} value={gameweekNumber}>
                    Gameweek {gameweekNumber}
                  </option>
                ))}
              </select>
            </label>
            <button className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-black text-[var(--brand-strong)] transition hover:bg-[var(--accent-strong)]">
              View
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 lg:py-14">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              FPL deadline
            </p>
            <p className="mt-2 font-black text-[var(--brand-strong)]">
              {formatDeadline(gameweek.deadlineTime)}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Fixtures
            </p>
            <p className="mt-2 text-2xl font-black text-[var(--brand-strong)]">
              {gameweek.fixtures.length}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
              Completed
            </p>
            <p className="mt-2 text-2xl font-black text-[var(--brand-strong)]">
              {completedMatches}
            </p>
          </div>
        </div>

        {!gameweek.sourceAvailable ? (
          <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-7 text-amber-950">
            <h2 className="text-xl font-black">Fixtures are temporarily unavailable.</h2>
            <p className="mt-3 leading-7">
              The official FPL service could not be reached. Refresh this page
              shortly; no fixture information has been guessed or stored as a
              substitute.
            </p>
          </div>
        ) : groupedFixtures.length ? (
          <div className="mt-8 space-y-6">
            {groupedFixtures.map((group) => (
              <section
                key={group.key}
                className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm"
              >
                <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4 sm:px-7">
                  <h2 className="text-lg font-black text-[var(--brand-strong)]">
                    {group.label}
                  </h2>
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[var(--brand)]">
                    {group.fixtures.length} {group.fixtures.length === 1 ? "match" : "matches"}
                  </span>
                </div>

                <div className="divide-y divide-[var(--border)]">
                  {group.fixtures.map((fixture) => {
                    const matchHasScore = fixture.started || fixture.finished;
                    return (
                      <article
                        key={fixture.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-5 sm:gap-6 sm:px-7"
                      >
                        <p className="text-right text-sm font-black text-[var(--brand-strong)] sm:text-base">
                          {fixture.homeTeam}
                        </p>
                        <div className="min-w-[76px] text-center">
                          <span
                            className={`inline-flex min-w-[68px] justify-center rounded-xl px-3 py-2 text-sm font-black ${
                              fixture.started && !fixture.finished
                                ? "bg-red-600 text-white"
                                : "bg-[var(--brand)] text-white"
                            }`}
                          >
                            {matchHasScore
                              ? `${fixture.homeScore ?? 0}–${fixture.awayScore ?? 0}`
                              : "VS"}
                          </span>
                          <p
                            className={`mt-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                              fixture.started && !fixture.finished
                                ? "text-red-600"
                                : "text-[var(--muted)]"
                            }`}
                          >
                            {fixtureStatus(fixture)}
                          </p>
                        </div>
                        <p className="text-left text-sm font-black text-[var(--brand-strong)] sm:text-base">
                          {fixture.awayTeam}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-[var(--border)] bg-white p-10 text-center">
            <h2 className="text-2xl font-black text-[var(--brand-strong)]">
              No fixtures have been published for {gameweek.name}.
            </h2>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-[var(--muted)]">
              This page will populate automatically when the official FPL
              provider releases or reschedules the matches.
            </p>
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}
