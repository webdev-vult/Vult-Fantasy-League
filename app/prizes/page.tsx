import type { Metadata } from "next";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import {
  getActivePrizes,
  getPublicCompetition,
} from "@/lib/public/competition";

export const metadata: Metadata = {
  title: "Prizes",
  description: "Published prizes for the Vult EPL Fantasy League.",
};

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function PrizesPage() {
  const competition = await getPublicCompetition();
  const prizes = await getActivePrizes(competition.id);

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen} />
      <section className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--brand)]">Prize structure</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.05em] text-[var(--brand-strong)] sm:text-6xl">
            Weekly, monthly and season rewards.
          </h1>
          <p className="mt-6 text-lg leading-8 text-[var(--muted)]">
            Only active prize categories published by Vult appear here. Payment remains subject to winner verification and the approved competition rules.
          </p>
        </div>

        {prizes.length === 0 ? (
          <div className="mt-10 rounded-[2rem] border border-amber-200 bg-amber-50 p-7 text-amber-900">
            <h2 className="text-xl font-black">The prize structure has not been published.</h2>
            <p className="mt-3 text-sm leading-7">
              Vult will publish the confirmed prize categories, amounts, payment method and expected payment period before registration opens.
            </p>
          </div>
        ) : (
          <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {prizes.map((prize) => (
              <article key={prize.id} className="rounded-[2rem] border border-[var(--border)] bg-white p-7 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-black text-[var(--brand)]">
                    {humanize(prize.frequency)}
                  </span>
                  <span className="text-xs font-black text-[var(--muted)]">Position {prize.position}</span>
                </div>
                <h2 className="mt-5 text-2xl font-black text-[var(--brand-strong)]">{prize.name}</h2>
                {prize.description ? (
                  <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{prize.description}</p>
                ) : null}

                <div className="mt-6 rounded-2xl bg-[var(--brand-strong)] p-5 text-white">
                  {prize.prize_type === "non_cash" ? (
                    <p className="text-xl font-black">{prize.non_cash_description || "Non-cash prize"}</p>
                  ) : (
                    <p className="text-3xl font-black text-[var(--accent)]">
                      {prize.currency} {Number(prize.amount).toLocaleString("en-GB", { maximumFractionDigits: 2 })}
                    </p>
                  )}
                  {prize.prize_type === "mixed" && prize.non_cash_description ? (
                    <p className="mt-2 text-sm text-blue-100">Plus {prize.non_cash_description}</p>
                  ) : null}
                </div>

                <dl className="mt-6 space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--muted)]">Payment method</dt>
                    <dd className="text-right font-black text-[var(--brand-strong)]">{humanize(prize.payment_method)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--muted)]">Target payment period</dt>
                    <dd className="text-right font-black text-[var(--brand-strong)]">Within {prize.payment_deadline_days} days</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
