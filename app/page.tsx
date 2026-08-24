import Link from "next/link";
import { HeroImage } from "@/components/public/hero-image";
import { GameweekCountdown } from "@/components/public/gameweek-countdown";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { getPublicAnnouncements } from "@/lib/public/announcements";
import {
  formatPublicDate,
  getActivePrizes,
  getPublicCompetition,
  humanizeStatus,
  type PublicPrize,
} from "@/lib/public/competition";
import { getPublicGameweek } from "@/lib/public/fpl-fixtures";
import { getPublicLeaderboardPreview } from "@/lib/public/leaderboard-preview";

export const dynamic = "force-dynamic";

const playSteps = [
  {
    number: "01",
    title: "Create your team",
    description: "Build your official Fantasy Premier League squad and choose your captain.",
  },
  {
    number: "02",
    title: "Join the Vult league",
    description: "Use the published Vult mini-league link before completing your registration.",
  },
  {
    number: "03",
    title: "Register your entry",
    description: "Submit the Team and Manager names displayed in the official league. We will safely match minor formatting differences.",
  },
  {
    number: "04",
    title: "Earn points",
    description: "Make your transfers, follow every Gameweek and watch your score grow.",
  },
  {
    number: "05",
    title: "Climb and win",
    description: "Compete across weekly, monthly and overall published standings.",
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

function formatPrizeValue(prize: PublicPrize) {
  if (prize.prize_type === "non_cash") {
    return prize.non_cash_description || "Non-cash reward";
  }

  const amount = Number(prize.amount).toLocaleString("en-GB", {
    maximumFractionDigits: 2,
  });
  return `${prize.currency} ${amount}`;
}

function movementLabel(value: number) {
  if (value > 0) return `▲ ${value}`;
  if (value < 0) return `▼ ${Math.abs(value)}`;
  return "—";
}

export default async function Home() {
  const competitionPromise = getPublicCompetition();
  const gameweekPromise = getPublicGameweek();
  const competition = await competitionPromise;
  const [gameweek, prizes, announcements, leaderboard] = await Promise.all([
    gameweekPromise,
    getActivePrizes(competition.id),
    getPublicAnnouncements(),
    getPublicLeaderboardPreview(competition.id),
  ]);

  const seasonLabel = competition.seasonName ?? competition.seasonCode ?? "Current season";
  const featuredFixtures = gameweek.fixtures.slice(0, 4);
  const featuredPrizes = prizes.slice(0, 3);
  const featuredAnnouncements = announcements.slice(0, 3);

  return (
    <main className="min-h-screen bg-[#f7f8fd]">
      <SiteHeader registrationOpen={competition.registrationOpen} />

      <section className="relative isolate min-h-[720px] overflow-hidden bg-[var(--brand-strong)] text-white">
        <HeroImage />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,10,32,0.86)_0%,rgba(8,10,32,0.78)_48%,rgba(8,10,32,0.32)_100%)] sm:bg-[linear-gradient(90deg,#080a20_0%,rgba(8,10,32,0.98)_28%,rgba(8,10,32,0.72)_54%,rgba(8,10,32,0.1)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(117,201,227,0.2),transparent_30%)]" />

        <div className="relative mx-auto flex min-h-[720px] w-full max-w-7xl flex-col justify-between px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-blue-100 backdrop-blur">
                Vult EPL Fantasy League
              </span>
              <span className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--brand-strong)]">
                {seasonLabel}
              </span>
            </div>

            <h1 className="mt-5 max-w-3xl text-5xl font-black leading-[0.96] tracking-[-0.06em] sm:text-7xl xl:text-[5.1rem]">
              Build your team. Make your moves. <span className="text-[var(--accent)]">Win the season.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-blue-100 sm:text-lg">
              Create your official FPL team, join the Vult mini-league, register your entry and compete across weekly, monthly and overall rankings.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/register" className="rounded-full bg-[var(--accent)] px-7 py-4 text-sm font-black text-[var(--brand-strong)] shadow-2xl shadow-cyan-950/30 transition hover:-translate-y-0.5 hover:bg-[var(--accent-strong)]">
                {competition.registrationOpen ? "Register your team" : "View registration"}
              </Link>
              <Link href="/leaderboards" className="rounded-full border border-white/30 bg-white/10 px-7 py-4 text-sm font-black text-white backdrop-blur transition hover:bg-white/20">
                View leaderboard
              </Link>
            </div>
          </div>

          <dl className="mt-14 grid max-w-4xl gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-[#0d1030]/75 p-4 backdrop-blur">
              <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">Competition</dt>
              <dd className="mt-2 text-lg font-black">{humanizeStatus(competition.status)}</dd>
            </div>
            <div className="rounded-2xl border border-white/15 bg-[#0d1030]/75 p-4 backdrop-blur">
              <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">Current round</dt>
              <dd className="mt-2 text-lg font-black">{gameweek.name}</dd>
            </div>
            <div className="rounded-2xl border border-white/15 bg-[#0d1030]/75 p-4 backdrop-blur">
              <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">Registration closes</dt>
              <dd className="mt-2 text-lg font-black">{formatPublicDate(competition.registrationClosesAt)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="border-b border-[var(--border)] bg-white py-16 lg:py-20">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent-dark)]">Play. Compete. Win.</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] text-[var(--brand-strong)] sm:text-5xl">Your route from team selection to the top of the table.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {playSteps.map((step) => (
              <article key={step.number} className="group rounded-3xl border border-[var(--border)] bg-[#fafbff] p-6 transition hover:-translate-y-1 hover:border-[var(--accent)] hover:shadow-xl hover:shadow-blue-950/5">
                <span className="text-sm font-black text-[var(--accent-dark)]">{step.number}</span>
                <div className="mt-5 h-1.5 w-10 rounded-full bg-[var(--accent)] transition-all group-hover:w-16" />
                <h3 className="mt-5 text-xl font-black text-[var(--brand-strong)]">{step.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="fixtures" className="scroll-mt-24 bg-[var(--brand-strong)] py-16 text-white lg:py-20">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent)]">Live Gameweek</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] sm:text-5xl">Every deadline. Every fixture. Every decision.</h2>
            <p className="mt-5 max-w-xl leading-8 text-blue-100">Plan your transfers before the deadline and follow the current official fixture schedule in Sierra Leone time.</p>
            <div className="mt-8">
              <GameweekCountdown target={gameweek.deadlineTime} gameweekName={gameweek.name} />
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">Official fixtures</p>
                <h3 className="mt-2 text-2xl font-black">{gameweek.name}</h3>
              </div>
              <Link href="/fixtures" className="shrink-0 text-sm font-black text-[var(--accent)] transition hover:text-white">
                View all →
              </Link>
            </div>
            {featuredFixtures.length ? (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {featuredFixtures.map((fixture) => (
                  <article key={fixture.id} className="rounded-2xl bg-white p-5 text-[var(--brand-strong)]">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">{formatKickoff(fixture.kickoffTime)}</p>
                    <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <p className="font-black">{fixture.homeTeam}</p>
                      <span className="rounded-lg bg-[var(--surface-soft)] px-2.5 py-2 text-xs font-black text-[var(--brand)]">
                        {fixture.started || fixture.finished ? `${fixture.homeScore ?? 0}–${fixture.awayScore ?? 0}` : "VS"}
                      </span>
                      <p className="text-right font-black">{fixture.awayTeam}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-white/20 p-8 text-center text-blue-100">
                Fixtures will appear automatically when the official FPL provider publishes them.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="mx-auto grid w-full max-w-7xl gap-7 px-5 sm:px-8 lg:grid-cols-2 lg:px-10">
          <article className="overflow-hidden rounded-[2rem] border border-[var(--border)] bg-white shadow-sm">
            <div className="flex items-end justify-between gap-4 border-b border-[var(--border)] p-6 sm:p-8">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--accent-dark)]">Follow the race</p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">Leaderboard leaders</h2>
              </div>
              <Link href="/leaderboards" className="shrink-0 text-sm font-black text-[var(--brand)]">View all →</Link>
            </div>

            {leaderboard?.rows.length ? (
              <div className="divide-y divide-[var(--border)]">
                {leaderboard.rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-6 py-4 sm:px-8">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-black ${row.rank <= 3 ? "bg-[var(--accent)] text-[var(--brand-strong)]" : "bg-[var(--surface-soft)] text-[var(--brand)]"}`}>{row.rank}</span>
                    <div className="min-w-0">
                      <p className="truncate font-black text-[var(--brand-strong)]">{row.displayName}</p>
                      <p className="mt-1 truncate text-xs text-[var(--muted)]">{row.teamName ?? "Fantasy team"}</p>
                    </div>
                    <span className="text-xs font-black text-[var(--muted)]">{movementLabel(row.movement)}</span>
                    <span className="text-xl font-black text-[var(--brand-strong)]">{row.points}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 sm:p-10">
                <div className="rounded-3xl bg-[var(--surface-soft)] p-7">
                  <p className="text-sm font-black text-[var(--brand)]">Standings coming soon</p>
                  <p className="mt-3 leading-7 text-[var(--muted)]">The top five will appear here automatically after Vult publishes the first verified overall leaderboard.</p>
                </div>
              </div>
            )}
          </article>

          <article className="rounded-[2rem] bg-[var(--accent)] p-6 text-[var(--brand-strong)] shadow-xl shadow-cyan-950/10 sm:p-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Published rewards</p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">Play for the top spot.</h2>
              </div>
              <Link href="/prizes" className="shrink-0 text-sm font-black">All prizes →</Link>
            </div>

            {featuredPrizes.length ? (
              <div className="mt-7 space-y-3">
                {featuredPrizes.map((prize) => (
                  <div key={prize.id} className="rounded-2xl bg-white/75 p-5 backdrop-blur">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">{prize.frequency.replaceAll("_", " ")} · Position {prize.position}</p>
                        <h3 className="mt-2 text-lg font-black">{prize.name}</h3>
                      </div>
                      <p className="text-right text-xl font-black">{formatPrizeValue(prize)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-7 rounded-3xl bg-white/75 p-7">
                <p className="text-xl font-black">Prize details will be published here.</p>
                <p className="mt-3 text-sm leading-7 text-[var(--brand)]">Only confirmed prize categories and values configured by Vult will appear on the public website.</p>
              </div>
            )}
          </article>
        </div>
      </section>

      {featuredAnnouncements.length ? (
        <section className="border-y border-[var(--border)] bg-white py-16 lg:py-20">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--accent-dark)]">Latest updates</p>
                <h2 className="mt-3 text-4xl font-black tracking-[-0.05em] text-[var(--brand-strong)]">From the Vult Fantasy team.</h2>
              </div>
              <Link href="/announcements" className="text-sm font-black text-[var(--brand)]">View all announcements →</Link>
            </div>
            <div className="mt-9 grid gap-5 lg:grid-cols-3">
              {featuredAnnouncements.map((announcement) => (
                <article key={announcement.id} className="rounded-3xl border border-[var(--border)] bg-[#fafbff] p-6">
                  <span className="rounded-full bg-[var(--surface-soft)] px-3 py-2 text-xs font-black capitalize text-[var(--brand)]">{announcement.category.replaceAll("_", " ")}</span>
                  <h3 className="mt-5 text-xl font-black text-[var(--brand-strong)]">{announcement.title}</h3>
                  <p className="mt-3 line-clamp-3 text-sm leading-7 text-[var(--muted)]">{announcement.summary ?? announcement.body}</p>
                  <Link href={`/announcements/${announcement.slug}`} className="mt-5 inline-flex text-sm font-black text-[var(--brand)]">Read update →</Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] bg-[var(--brand)] px-7 py-12 text-white sm:px-10 lg:flex lg:items-center lg:justify-between lg:px-14">
          <div className="absolute -right-16 -top-28 h-72 w-72 rounded-full bg-[var(--accent)]/20 blur-3xl" />
          <div className="relative max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--accent)]">Ready to play?</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.05em] sm:text-5xl">Your squad is waiting. Your rivals are ready.</h2>
            <p className="mt-4 leading-7 text-blue-100">Join the official Vult mini-league, register your team details and chase the top spot all season.</p>
          </div>
          <div className="relative mt-8 flex flex-wrap gap-3 lg:mt-0 lg:justify-end">
            <Link href="/register" className="rounded-full bg-[var(--accent)] px-7 py-4 text-sm font-black text-[var(--brand-strong)]">Join Vult EPL Fantasy</Link>
            <Link href="/rules" className="rounded-full border border-white/25 px-7 py-4 text-sm font-black text-white">Read the rules</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
