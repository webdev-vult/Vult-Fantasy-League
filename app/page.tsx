const platformModules = [
  {
    title: "Multi-season competitions",
    description:
      "Create new EPL seasons without rebuilding the platform or deleting historical records.",
  },
  {
    title: "Verified participants",
    description:
      "Manage seasonal registrations, FPL entry IDs, Vult verification and eligibility status.",
  },
  {
    title: "Automated leaderboards",
    description:
      "Support weekly, monthly and overall rankings from mock, CSV or approved data providers.",
  },
  {
    title: "Controlled prize workflow",
    description:
      "Move winners through competition, compliance and finance approval before publication.",
  },
];

const buildStages = [
  "Platform foundation",
  "Competition and season setup",
  "Participant registration",
  "Leaderboards and score imports",
  "Winner and payment workflows",
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand)] text-sm font-black tracking-[0.14em] text-white shadow-lg shadow-blue-950/20">
            V
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--brand)]">Vult Fantasy</p>
            <p className="text-xs text-[var(--muted)]">Competition Platform</p>
          </div>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-white/80 px-4 py-2 text-xs font-semibold text-[var(--brand)] shadow-sm backdrop-blur">
          Foundation build
        </span>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-12 px-6 pb-20 pt-12 lg:grid-cols-[1.15fr_0.85fr] lg:px-10 lg:pb-28 lg:pt-20">
        <div className="flex flex-col justify-center">
          <span className="mb-6 w-fit rounded-full bg-[var(--surface-soft)] px-4 py-2 text-sm font-bold text-[var(--brand)]">
            Built for every season, not only 2026/27
          </span>
          <h1 className="max-w-4xl text-5xl font-black leading-[1.02] tracking-[-0.055em] text-[var(--brand-strong)] sm:text-6xl lg:text-7xl">
            One platform for Vult fantasy competitions, winners and prizes.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            The system will manage multiple competitions and seasons, participant verification,
            score imports, leaderboards, winner approvals, prize payments and historical records.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <span className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-950/20">
              Vercel ready
            </span>
            <span className="rounded-xl border border-[var(--border)] bg-white px-5 py-3 text-sm font-bold text-[var(--brand)]">
              Supabase ready
            </span>
            <span className="rounded-xl border border-[var(--border)] bg-white px-5 py-3 text-sm font-bold text-[var(--brand)]">
              Multi-season architecture
            </span>
          </div>
        </div>

        <aside className="rounded-[2rem] border border-white/70 bg-[var(--brand-strong)] p-6 text-white shadow-2xl shadow-blue-950/25 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-200">First competition</p>
              <h2 className="mt-1 text-2xl font-black">Vult EPL Fantasy League</h2>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-blue-100">
              2026/27
            </span>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3">
            {[
              ["38", "Gameweeks"],
              ["3", "Prize periods"],
              ["7", "Admin roles"],
              ["1", "Permanent platform"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-3xl font-black text-[var(--accent)]">{value}</p>
                <p className="mt-1 text-xs font-semibold text-blue-100">{label}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">
              Current implementation path
            </p>
            <ol className="mt-5 space-y-4">
              {buildStages.map((stage, index) => (
                <li key={stage} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black text-[var(--accent)]">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-blue-50">{stage}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </section>

      <section className="border-y border-[var(--border)] bg-white/70 py-20 backdrop-blur">
        <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-[var(--brand)]">
              Platform foundation
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] text-[var(--brand-strong)] sm:text-4xl">
              Designed around the complete competition lifecycle.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {platformModules.map((module) => (
              <article
                key={module.title}
                className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm transition-transform duration-200 hover:-translate-y-1"
              >
                <div className="mb-5 h-2 w-12 rounded-full bg-[var(--accent)]" />
                <h3 className="text-lg font-black text-[var(--brand-strong)]">{module.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{module.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 py-10 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <p>Vult Fantasy Platform</p>
        <p>Next.js · Supabase · Vercel</p>
      </footer>
    </main>
  );
}
