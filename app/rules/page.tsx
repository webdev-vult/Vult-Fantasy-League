import type { Metadata } from "next";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import {
  getPublicCompetition,
  getPublishedRules,
} from "@/lib/public/competition";

export const metadata: Metadata = {
  title: "Competition rules",
  description: "Published rules for the Vult EPL Fantasy League.",
};

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export default async function RulesPage() {
  const competition = await getPublicCompetition();
  const rules = await getPublishedRules(competition.id, competition.rulesVersion);
  const tieBreakers = stringList(rules?.tie_breakers);
  const disqualifications = stringList(rules?.disqualification_rules);

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen && Boolean(rules)} />
      <section className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--brand)]">Competition rules</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.05em] text-[var(--brand-strong)] sm:text-6xl">
          Clear rules before registration opens.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--muted)]">
          Only a published and versioned rule set is binding. Draft rules remain private to administrators and cannot be accepted by participants.
        </p>

        {!rules ? (
          <div className="mt-10 rounded-[2rem] border border-amber-200 bg-amber-50 p-7 text-amber-900">
            <h2 className="text-xl font-black">The official rule version has not been published.</h2>
            <p className="mt-3 text-sm leading-7">
              Registration remains disabled until Vult approves and publishes the competition rules. This protects participants from accepting incomplete or changing terms.
            </p>
          </div>
        ) : (
          <div className="mt-10 space-y-6">
            <section className="rounded-[2rem] border border-[var(--border)] bg-white p-7 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Published rule set</p>
                  <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">{rules.title}</h2>
                </div>
                <span className="rounded-full bg-[var(--surface-soft)] px-4 py-2 text-xs font-black text-[var(--brand)]">Version {rules.version}</span>
              </div>
            </section>

            <div className="grid gap-5 md:grid-cols-2">
              {[
                ["Minimum age", `${rules.minimum_age} years`],
                ["Eligible countries", rules.eligible_country_codes.join(", ")],
                ["Vult account", rules.requires_vult_account ? "Required" : "Not required"],
                ["Entries per participant", rules.one_entry_per_participant ? "One entry" : "Multiple entries allowed"],
                ["Employee eligibility", rules.employees_eligible ? "Eligible" : "Not eligible"],
                ["Transfer deductions", rules.include_transfer_deductions ? "Included" : "Excluded"],
                ["Repeat weekly winners", rules.repeat_weekly_winners_allowed ? "Allowed" : "Not allowed"],
                ["Dispute window", `${rules.dispute_window_hours} hours`],
              ].map(([label, value]) => (
                <article key={label} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
                  <p className="mt-3 text-lg font-black text-[var(--brand-strong)]">{value}</p>
                </article>
              ))}
            </div>

            <section className="rounded-[2rem] border border-[var(--border)] bg-white p-7 shadow-sm">
              <h2 className="text-2xl font-black text-[var(--brand-strong)]">Weekly chip policy</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                {rules.weekly_chip_policy === "exclude_score_affecting_chips"
                  ? "Managers using a score-affecting chip may be excluded from that Gameweek’s weekly prize, while their official score can still count toward monthly and overall standings."
                  : "All official chip use is allowed for weekly prize consideration."}
              </p>
            </section>

            <section className="rounded-[2rem] border border-[var(--border)] bg-white p-7 shadow-sm">
              <h2 className="text-2xl font-black text-[var(--brand-strong)]">Tie-break sequence</h2>
              {tieBreakers.length ? (
                <ol className="mt-5 space-y-3">
                  {tieBreakers.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-3 text-sm leading-7 text-[var(--muted)]">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-soft)] text-xs font-black text-[var(--brand)]">{index + 1}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">No tie-break sequence has been published.</p>
              )}
            </section>

            <section className="rounded-[2rem] border border-[var(--border)] bg-white p-7 shadow-sm">
              <h2 className="text-2xl font-black text-[var(--brand-strong)]">Disqualification conditions</h2>
              {disqualifications.length ? (
                <ul className="mt-5 space-y-3">
                  {disqualifications.map((item, index) => (
                    <li key={`${item}-${index}`} className="flex gap-3 text-sm leading-7 text-[var(--muted)]">
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">No additional disqualification conditions have been published.</p>
              )}
            </section>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
