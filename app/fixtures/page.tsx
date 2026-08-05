import type { Metadata } from "next";
import { GameweekCountdown } from "@/components/public/gameweek-countdown";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { getPublicCompetition } from "@/lib/public/competition";
import { formatFixtureDate, getPublicGameweekOne } from "@/lib/public/fpl-fixtures";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fixtures",
  description: "Gameweek fixtures for Vult EPL Fantasy 2026/27.",
};

export default async function FixturesPage() {
  const [competition, gameweek] = await Promise.all([
    getPublicCompetition(),
    getPublicGameweekOne(),
  ]);

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen} />

      <section className="bg-[var(--brand-strong)] text-white">
        <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">2026/27 season</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.045em] sm:text-5xl">Fixtures</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-blue-100">
            Gameweek 1 fixtures will become visible when the Premier League season begins.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
        {!gameweek.fixturesVisible ? (
          <div className="rounded-[2rem] bg-[var(--brand)] p-7 text-white shadow-xl sm:p-10">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Countdown to Gameweek 1</p>
            <h2 className="mt-3 text-3xl font-black">Friday 21 August 2026</h2>
            <p className="mt-3 text-sm leading-6 text-blue-100">
              FPL deadline: 5:30 PM in Sierra Leone. The opening fixture begins later that evening.
            </p>
            <div className="mt-7">
              <GameweekCountdown deadlineTime={gameweek.deadlineTime} />
            </div>
          </div>
        ) : gameweek.fixtures.length > 0 ? (
          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">{gameweek.name}</p>
                <h2 className="mt-2 text-3xl font-black text-[var(--brand-strong)]">Opening fixtures</h2>
              </div>
              <p className="text-sm text-[var(--muted)]">Times shown in Sierra Leone time.</p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {gameweek.fixtures.map((fixture) => (
                <article key={fixture.id} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                    {formatFixtureDate(fixture.kickoffTime)}
                  </p>
                  <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                    <p className="text-right text-base font-black text-[var(--brand-strong)]">{fixture.homeTeam}</p>
                    <div className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-sm font-black text-[var(--brand)]">
                      {fixture.started || fixture.finished
                        ? `${fixture.homeScore ?? 0} – ${fixture.awayScore ?? 0}`
                        : "vs"}
                    </div>
                    <p className="text-left text-base font-black text-[var(--brand-strong)]">{fixture.awayTeam}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-7 text-sm leading-7 text-amber-900">
            Fixtures are due to be shown, but the official FPL service is temporarily unavailable. Please check again shortly.
          </div>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}
