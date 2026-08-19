import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { getPublicCompetition } from "@/lib/public/competition";

export const metadata: Metadata = {
  title: "How it works",
  description: "How to join and compete in the Vult EPL Fantasy League.",
};

const steps = [
  {
    title: "Create your official FPL team",
    description:
      "Set up your team on the official Fantasy Premier League platform. You do not need to copy your numeric Entry ID for Vult registration.",
  },
  {
    title: "Join the Vult competition",
    description:
      "Join the official Vult FPL mini-league for the current season before submitting your Vult registration.",
  },
  {
    title: "Submit one seasonal registration",
    description:
      "Provide your contact details and enter the exact Team name and Manager name shown in the official Vult FPL mini-league during the published registration window. There is no age limit to play.",
  },
  {
    title: "Vult resolves your FPL Entry ID",
    description:
      "The platform matches your Team and Manager names against the configured Vult league and stores the numeric FPL Entry ID automatically as the permanent fantasy-team identifier.",
  },
  {
    title: "Complete entry review",
    description:
      "Vult checks FPL membership, duplicate risk and the published competition requirements. You can play and appear in the standings without completing Vult KYC.",
  },
  {
    title: "Compete across the season",
    description:
      "Approved participants can appear in weekly, monthly and overall rankings after official score data is validated and published.",
  },
  {
    title: "Winner review and payment",
    description:
      "Provisional winners must have Vult KYC Level 1 or higher when Vult checks the account. A manager who has not completed Level 1 remains in the standings but is skipped for weekly, monthly and overall prizes.",
  },
];

export default async function HowItWorksPage() {
  const competition = await getPublicCompetition();

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen} />
      <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--brand)]">How it works</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.05em] text-[var(--brand-strong)] sm:text-6xl">
            From registration to verified winner.
          </h1>
          <p className="mt-6 text-lg leading-8 text-[var(--muted)]">
            The Vult Fantasy Platform keeps registration, score validation, eligibility, winner approval and prize records in one controlled process.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {steps.map((step, index) => (
            <article key={step.title} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--surface-soft)] text-sm font-black text-[var(--brand)]">
                {index + 1}
              </span>
              <h2 className="mt-5 text-xl font-black text-[var(--brand-strong)]">{step.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{step.description}</p>
            </article>
          ))}
        </div>

        <div className="mt-12 rounded-[2rem] bg-[var(--brand-strong)] p-7 text-white sm:flex sm:items-center sm:justify-between sm:p-9">
          <div>
            <p className="text-sm font-bold text-blue-200">Ready to register?</p>
            <h2 className="mt-2 text-2xl font-black">Join the Vult FPL mini-league and have your exact Team and Manager names ready.</h2>
          </div>
          <Link href="/register" className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-black text-[var(--brand)] sm:mt-0">
            View registration
          </Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
