import Link from "next/link";
import { GameweekCountdown } from "@/components/public/gameweek-countdown";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import {
  formatPublicDate,
  getPublicCompetition,
  humanizeStatus,
} from "@/lib/public/competition";
import { getPublicGameweek } from "@/lib/public/fpl-fixtures";

export const dynamic = "force-dynamic";

const features = [
  {
    title: "One verified seasonal entry",
    description: "Register with the exact Team and Manager names shown in the official Vult FPL mini-league.",
  },
  {
    title: "Transparent competition standings",
    description: "Weekly, monthly and overall rankings will be published from validated score records.",
  },
  {
    title: "Controlled winner approval",
    description: "Provisional winners pass competition and compliance checks before confirmation and payment.",
  },
  {
    title: "A platform built for every season",
    description: "Historical seasons, winners and prize records remain available when a new season begins.",
  },
];

function formatKickoff(value: string | null) {
  if (!value) return "Time to be confirmed";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

export default async function Home() {
  const [competition, gameweek] = await Promise.all([
    getPublicCompetition(),
    getPublicGameweek(),
  ]);
  const firstKickoff = gameweek.firstKickoffTime
    ? new Date(gameweek.firstKickoffTime).getTime()
    : null;
  const seasonStarted =
    gameweek.fixtures.some((fixture) => fixture.started || fixture.finished) ||
    (firstKickoff !== null && Date.now() >= firstKickoff);
  const fixtures = seasonStarted ? gameweek.fixtures : [];
  const seasonLabel = competition.seasonName ?? competition.seasonCode ?? "Current season";
  const leagueJoinUrl = competition.fplLeagueCode
    ? `https://fantasy.premierleague.com/leagues/auto-join/${encodeURIComponent(competition.fplLeagueCode)}`
    : null;

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen} />

      <section className="relative overflow-hidden bg-[var(--brand-strong)] text-white">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_20%_20%,white_0,transparent_28%),radial-gradient(circle_at_80%_10%,#f8e71c_0,transparent_20%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-10 lg:py-24">
          <div>
            <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-blue-100">
              {humanizeStatus(competition.status)}
            </span>
            <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[1.02] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              Play the season. Climb the rankings. Win with Vult.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-blue-100">
              {competition.name} brings registration, verified entries, leaderboards, winner approval and prize records into one transparent competition platform.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/register" className="rounded-xl bg-[var(--accent)] px-6 py-3.5 text-sm font-black text-[var(--brand-strong)] shadow-xl shadow-black/20">
                {competition.registrationOpen ? "Register now" : "View registration"}
              </Link>
              <Link href="/how-it-works" className="rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-sm font-black text-white">
                How it works
              </Link>
            </div>
          </div>

          <aside className="space-y-5 rounded-[2rem] border border-white/10 bg-white/5 p-7 backdrop-blur sm:p-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Current season</p>
              <h2 className="mt-3 text-3xl font-black">{seasonLabel}</h2>
            </div>
            <GameweekCountdown target={gameweek.deadlineTime} gameweekName={gameweek.name} />
            <dl className="space-y-4">
              <div className="rounded-2xl bg-white/5 p-4">
                <dt className="text-xs font-bold text-blue-200">Registration closes</dt>
                <dd className="mt-2 text-lg font-black">{formatPublicDate(competition.registrationClosesAt)}</dd>
              </div>
              <div className="rounded-2xl bg-white/5 p-4">
                <dt className="text-xs font-bold text-blue-200">Entry status</dt>
                <dd className="mt-2 text-lg font-black text-[var(--accent)]">
                  {competition.registrationOpen ? "Open" : "Not open"}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      {seasonStarted ? (
        <section className="border-b border-[var(--border)] bg-white py-16">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--brand)]">Fixtures</p>
                <h2 className="mt-3 text-4xl font-black tracking-[-0.045em] text-[var(--brand-strong)]">{gameweek.name}</h2>
              </div>
              <p className="text-sm text-[var(--muted)]">Official fixture information from the FPL read-only provider.</p>
            </div>

            {fixtures.length ? (
              <div className="mt-8 grid gap-4 md:grid-cols-2">
                {fixtures.map((fixture) => (
                  <article key={fixture.id} className="rounded-3xl border border-[var(--border)] bg-[#f7f9fd] p-5">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{formatKickoff(fixture.kickoffTime)}</p>
                    <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <p className="font-black text-[var(--brand-strong)]">{fixture.homeTeam}</p>
                      <p className="rounded-xl bg-white px-3 py-2 text-sm font-black text-[var(--brand)]">
                        {fixture.started || fixture.finished
                          ? `${fixture.homeScore ?? 0} – ${fixture.awayScore ?? 0}`
                          : "v"}
                      </p>
                      <p className="text-right font-black text-[var(--brand-strong)]">{fixture.awayTeam}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-8 rounded-3xl border border-dashed border-[var(--border)] bg-[#f7f9fd] p-8 text-center text-[var(--muted)]">
                Gameweek fixtures are temporarily unavailable. They will appear automatically when the FPL provider returns them.
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--brand)]">Competition lifecycle</p>
          <h2 className="mt-4 text-4xl font-black tracking-[-0.045em] text-[var(--brand-strong)] sm:text-5xl">
            A fairer process from registration to payout.
          </h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <div className="h-2 w-12 rounded-full bg-[var(--accent)]" />
              <h3 className="mt-5 text-xl font-black text-[var(--brand-strong)]">{feature.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--border)] bg-white py-16">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-3 lg:px-10">
          {[
            ["Weekly", "Compete for Gameweek awards under the published eligibility and chip rules."],
            ["Monthly", "Build consistent scores across the Gameweeks assigned to each monthly prize period."],
            ["Overall", "Finish the full season at the top of the approved Vult competition standings."],
          ].map(([title, description]) => (
            <article key={title} className="rounded-3xl bg-[var(--surface-soft)] p-7">
              <p className="text-3xl font-black text-[var(--brand)]">{title}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
        <div className="rounded-[2rem] bg-[var(--brand)] p-8 text-white sm:flex sm:items-center sm:justify-between sm:p-10">
          <div>
            <p className="text-sm font-bold text-blue-100">Before you register</p>
            <h2 className="mt-2 text-3xl font-black">Join the Vult mini-league and copy your exact Team and Manager names.</h2>
          </div>
          <div className="mt-6 flex flex-wrap gap-3 sm:mt-0 sm:justify-end">
            <Link href="/rules" className="rounded-xl bg-white px-5 py-3 text-sm font-black text-[var(--brand)]">Read rules</Link>
            {leagueJoinUrl ? (
              <a href={leagueJoinUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-black text-white">Join Vult league</a>
            ) : (
              <Link href="/register" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-black text-white">View registration</Link>
            )}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
