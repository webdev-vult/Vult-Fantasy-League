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
    title: "Information collected",
    body: "The platform may collect your name, date of birth, phone number, WhatsApp number, email address, city, country, Vult customer reference, FPL Entry ID, fantasy team name, consent choices, registration status, scores, winner records, support messages and prize-payment information.",
  },
  {
    title: "Why the information is used",
    body: "Information is used to register and verify participants, prevent duplicate or ineligible entries, operate leaderboards, review winners, process prizes, handle disputes, communicate competition updates, maintain audit records and protect the integrity of the competition.",
  },
  {
    title: "Who can access it",
    body: "Access is limited by staff role. Competition, compliance, finance, support, content and audit personnel receive only the access needed for their responsibilities. Public pages only display information approved for publication.",
  },
  {
    title: "Winner publicity",
    body: "Consent to winner publicity is optional. If you provide it and win, Vult may publish your name, fantasy team name, score, prize and approved winner photograph. Withholding optional publicity consent does not cancel the mandatory processing needed to administer your registration.",
  },
  {
    title: "Retention and security",
    body: "Competition records are retained for the period required to administer the season, resolve disputes, maintain historical winner records and meet audit, finance or legal obligations. The platform uses role-based access, Row Level Security, audit logs and controlled administrative workflows.",
  },
  {
    title: "Your choices",
    body: "You may ask Vult to correct inaccurate registration information, explain how your information is used, or review an optional publicity consent. Some competition and transaction records may need to remain preserved for integrity, audit or legal purposes.",
  },
];

export default async function PrivacyPage() {
  const competition = await getPublicCompetition();

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen} />
      <section className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--brand)]">Privacy notice · Version 1.0</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.05em] text-[var(--brand-strong)] sm:text-6xl">
          How the Vult Fantasy Platform uses participant information.
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--muted)]">
          This notice applies to competition registrations, verification, scoring, winner review, prize processing and participant support carried out through the platform.
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
