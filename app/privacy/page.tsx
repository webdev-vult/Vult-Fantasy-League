import type { Metadata } from "next";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { getPublicCompetition } from "@/lib/public/competition";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "How participant information is used by the Vult Fantasy Platform.",
};

const sections = [
  {
    title: "Information provided during registration",
    body: "Registration may collect your legal name, phone number, WhatsApp number, email address, country, exact FPL Team name, exact FPL Manager name, age-eligibility declaration and consent choices. The fields shown on the current registration form determine what you are asked to provide.",
  },
  {
    title: "Information resolved or created by the platform",
    body: "The platform may resolve and store your numeric FPL Entry ID from the configured official Vult FPL mini-league. It also creates registration references, verification results, duplicate-risk indicators, score records, leaderboard records, winner-review records, support or dispute records and audit history as the competition is administered.",
  },
  {
    title: "Later verification and prize information",
    body: "Additional information may be recorded later when it is required for eligibility, compliance, winner review or prize settlement. This can include age-verification evidence, a verified Vult account reference, payment transaction references, payment evidence and administrative review notes. These items are not necessarily collected from every participant at initial registration.",
  },
  {
    title: "Why the information is used",
    body: "Information is used to register and verify participants, prevent duplicate or ineligible entries, operate leaderboards, review winners, record prizes, handle disputes, communicate competition updates, maintain audit records and protect the integrity of the competition.",
  },
  {
    title: "Who can access it",
    body: "Access is limited by staff role. Competition, compliance, finance, support, content and audit personnel receive access according to their responsibilities. Public pages should only display information approved for publication under the applicable competition and privacy rules.",
  },
  {
    title: "Winner publicity",
    body: "Winner-publicity consent is optional. Where you provide it and win, Vult may use approved winner information such as your name, fantasy team name, score, prize and winner photograph in winner announcements. Withholding optional publicity consent does not cancel the processing required to administer your registration and competition participation.",
  },
  {
    title: "Retention and security",
    body: "Competition records are retained for the period required to administer the season, resolve disputes, maintain historical competition records and meet audit, finance or legal obligations. The platform uses role-based access, Row Level Security, controlled administrative workflows and audit history to reduce unauthorized access or changes.",
  },
  {
    title: "Your choices",
    body: "You may ask Vult to correct inaccurate registration information, explain how your information is used, or review an optional publicity consent. Some competition, decision, payment and audit records may need to remain preserved for competition integrity or legal, finance and audit obligations.",
  },
];

export default async function PrivacyPage() {
  const competition = await getPublicCompetition();

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen} />
      <section className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--brand)]">Privacy notice · Version 1.1</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.05em] text-[var(--brand-strong)] sm:text-6xl">
          How the Vult Fantasy Platform uses participant information.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--muted)]">
          This notice applies to competition registration, verification, scoring, winner review, prize recording and participant support carried out through the platform.
        </p>

        <div className="mt-12 space-y-5">
          {sections.map((section) => (
            <section key={section.title} className="rounded-3xl border border-[var(--border)] bg-white p-7 shadow-sm">
              <h2 className="text-xl font-black text-[var(--brand-strong)]">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-8 rounded-3xl bg-[var(--brand-strong)] p-7 text-white">
          <h2 className="text-xl font-black">Privacy questions or corrections</h2>
          <p className="mt-3 text-sm leading-7 text-blue-100">
            Contact Vult through its official support channels and provide your registration reference where available. Do not share your password or authentication code with support staff.
          </p>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
