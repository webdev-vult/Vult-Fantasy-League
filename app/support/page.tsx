import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { getPublicCompetition } from "@/lib/public/competition";
import { accessDisputeAction, submitDisputeAction } from "./actions";

type SearchParams = Promise<{ success?: string; error?: string }>;

const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--brand)]";

export default async function SupportPage({ searchParams }: { searchParams: SearchParams }) {
  const competition = await getPublicCompetition();
  const messages = await searchParams;

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen} />

      <section className="bg-[var(--brand-strong)] text-white">
        <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 lg:px-10 lg:py-18">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Participant support</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-[-0.045em] sm:text-5xl">
            Submit a dispute or follow an existing case.
          </h1>
          <p className="mt-5 max-w-3xl leading-8 text-blue-100">
            Use your Vult Fantasy registration reference and the email or phone number submitted during registration. Case access links expire after 30 minutes and can be renewed here.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
        {messages.success ? (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">
            {messages.success}
          </div>
        ) : null}
        {messages.error ? (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
            {messages.error}
          </div>
        ) : null}

        <div className="grid gap-7 xl:grid-cols-[1.25fr_0.75fr]">
          <form action={submitDisputeAction} className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">New case</p>
                <h2 className="mt-3 text-2xl font-black text-[var(--brand-strong)]">Submit a participant dispute</h2>
              </div>
              <span className="w-fit rounded-full bg-[var(--surface-soft)] px-3 py-2 text-xs font-black text-[var(--brand)]">
                Secure verification
              </span>
            </div>

            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <label className="text-sm font-bold text-[var(--brand-strong)]">
                Registration reference
                <input name="registration_reference" className={inputClass} placeholder="VFL-XXXXXXXXXXXX" required />
              </label>
              <label className="text-sm font-bold text-[var(--brand-strong)]">
                Registered email or phone
                <input name="contact" className={inputClass} placeholder="Email or phone used to register" required />
              </label>
              <label className="text-sm font-bold text-[var(--brand-strong)]">
                Category
                <select name="category" className={inputClass} defaultValue="registration" required>
                  <option value="registration">Registration</option>
                  <option value="score">Score</option>
                  <option value="eligibility">Eligibility</option>
                  <option value="winner">Winner decision</option>
                  <option value="payment">Prize payment</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="text-sm font-bold text-[var(--brand-strong)]">
                Related reference
                <input name="related_reference" className={inputClass} placeholder="Gameweek, award or payment reference" />
              </label>
            </div>

            <label className="mt-5 block text-sm font-bold text-[var(--brand-strong)]">
              Subject
              <input name="subject" className={inputClass} minLength={8} maxLength={180} required />
            </label>
            <label className="mt-5 block text-sm font-bold text-[var(--brand-strong)]">
              Explain the issue
              <textarea name="description" className={inputClass} rows={7} minLength={20} maxLength={5000} required />
            </label>
            <label className="mt-5 block text-sm font-bold text-[var(--brand-strong)]">
              Evidence URL
              <input name="evidence_url" type="url" className={inputClass} placeholder="https://..." />
              <span className="mt-2 block text-xs font-normal leading-5 text-[var(--muted)]">
                Add a secure link to a screenshot, statement or supporting document. Direct file upload will be introduced with the storage module.
              </span>
            </label>
            <label className="hidden" aria-hidden="true">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>

            <button className="mt-7 rounded-xl bg-[var(--brand)] px-6 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-950/15">
              Submit case
            </button>
          </form>

          <div className="space-y-7">
            <form action={accessDisputeAction} className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Existing case</p>
              <h2 className="mt-3 text-2xl font-black text-[var(--brand-strong)]">Open your case</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                Enter the case reference and the same email or phone linked to your registration.
              </p>
              <label className="mt-6 block text-sm font-bold text-[var(--brand-strong)]">
                Case reference
                <input name="case_reference" className={inputClass} placeholder="VFD-XXXXXXXXXXXX" required />
              </label>
              <label className="mt-5 block text-sm font-bold text-[var(--brand-strong)]">
                Registered email or phone
                <input name="contact" className={inputClass} required />
              </label>
              <button className="mt-6 w-full rounded-xl border border-[var(--brand)] px-5 py-3 text-sm font-black text-[var(--brand)]">
                Access case
              </button>
            </form>

            <article className="rounded-[2rem] bg-[var(--brand)] p-7 text-white shadow-xl shadow-blue-950/15">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-200">Communication policy</p>
              <h2 className="mt-3 text-2xl font-black">Messages remain visible in your case.</h2>
              <p className="mt-4 text-sm leading-7 text-blue-100">
                In-platform updates are stored immediately. Email and WhatsApp records enter a controlled delivery queue and are not marked as sent until an administrator confirms delivery.
              </p>
            </article>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
