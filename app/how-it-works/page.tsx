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
      "Set up a team on the official Fantasy Premier League platform and keep the numeric Entry ID from your team URL.",
  },
  {
    title: "Join the Vult competition",
    description:
      "Use the official Vult mini-league details published for the season and make sure your team remains in the league.",
  },
  {
    title: "Submit one seasonal registration",
    description:
      "Provide your personal details, Vult reference and FPL Entry ID during the published registration window.",
  },
  {
    title: "Complete verification",
    description:
      "Vult checks duplicate entries, FPL information, Vult eligibility and compliance with the published rules.",
  },
  {
    title: "Compete across the season",
    description:
      "Approved participants can appear in weekly, monthly and overall rankings once score integration is active.",
  },
  {
    title: "Winner review and payment",
    description:
      "Provisional winners pass competition and compliance review before prize payment and public announcement.",
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
            The Vult Fantasy Platform keeps registration, scoring, eligibility, winner approval and prize records in one controlled process.
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
            <p className="text-sm font-bold text-blue-200">Ready when registration opens?</p>
            <h2 className="mt-2 text-2xl font-black">Prepare your FPL Entry ID and Vult account reference.</h2>
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
