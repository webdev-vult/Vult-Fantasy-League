import type { Metadata } from "next";
import { RegistrationForm } from "@/components/public/registration-form";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import {
  formatPublicDate,
  getPublicCompetition,
  getPublishedRules,
} from "@/lib/public/competition";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Register",
  description: "Register for the current Vult EPL Fantasy League season.",
};

export default async function RegisterPage() {
  const competition = await getPublicCompetition();
  const rules = await getPublishedRules(competition.id, competition.rulesVersion);
  const registrationOpen =
    competition.registrationOpen &&
    Boolean(rules) &&
    Boolean(competition.externalLeagueId);
  const leagueName = competition.fplLeagueName ?? "Official Vult FPL mini-league";

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={registrationOpen} />

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:px-10 lg:py-16">
        <aside className="h-fit rounded-[2rem] bg-[var(--brand-strong)] p-7 text-white shadow-2xl shadow-blue-950/20 lg:sticky lg:top-8">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">Season registration</p>
          <h1 className="mt-4 text-3xl font-black tracking-[-0.04em]">{competition.name}</h1>
          <p className="mt-4 text-sm leading-7 text-blue-100">
            Enter your contact information and the exact Team and Manager names shown in the official Vult FPL mini-league.
          </p>

          <dl className="mt-8 space-y-5 border-t border-white/10 pt-6 text-sm">
            <div>
              <dt className="text-blue-200">Season</dt>
              <dd className="mt-1 font-black">{competition.seasonName ?? competition.seasonCode ?? "To be announced"}</dd>
            </div>
            <div>
              <dt className="text-blue-200">Registration opens</dt>
              <dd className="mt-1 font-black">{formatPublicDate(competition.registrationOpensAt)}</dd>
            </div>
            <div>
              <dt className="text-blue-200">Registration closes</dt>
              <dd className="mt-1 font-black">{formatPublicDate(competition.registrationClosesAt)}</dd>
            </div>
            <div>
              <dt className="text-blue-200">Minimum age</dt>
              <dd className="mt-1 font-black">{rules?.minimum_age ?? 18} years</dd>
            </div>
            <div>
              <dt className="text-blue-200">Official league</dt>
              <dd className="mt-1 font-black">{leagueName}</dd>
            </div>
            {competition.fplLeagueCode ? (
              <div>
                <dt className="text-blue-200">League code</dt>
                <dd className="mt-1 font-black text-[var(--accent)]">{competition.fplLeagueCode}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-blue-200">Submission status</dt>
              <dd className="mt-1 font-black text-[var(--accent)]">Pending verification after submission</dd>
            </div>
          </dl>

          <div className="mt-8 rounded-2xl bg-white/10 p-4 text-xs leading-6 text-blue-100">
            Registration does not guarantee eligibility. Vult will resolve and store your numeric FPL Entry ID from the configured official league, check duplicates and review rule compliance before approval.
          </div>
        </aside>

        <div className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8 lg:p-10">
          <RegistrationForm
            competitionSlug={competition.slug}
            registrationOpen={registrationOpen}
            minimumAge={rules?.minimum_age ?? 18}
            requiresVultAccount={rules?.requires_vult_account ?? false}
            leagueCode={competition.fplLeagueCode}
          />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
