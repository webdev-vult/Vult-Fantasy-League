import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";

export const metadata: Metadata = {
  title: "Registration received",
  robots: { index: false, follow: false },
};

export default async function RegistrationSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const { reference } = await searchParams;

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader />
      <section className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-5 py-16 sm:px-8">
        <div className="w-full rounded-[2rem] border border-[var(--border)] bg-white p-8 text-center shadow-xl shadow-blue-950/10 sm:p-12">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl font-black text-emerald-700">✓</span>
          <p className="mt-7 text-xs font-black uppercase tracking-[0.2em] text-[var(--brand)]">Registration received</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">Your entry is pending verification.</h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[var(--muted)]">
            Vult will check your FPL Entry ID, Vult account, duplicate-entry status and competition eligibility before approving your registration.
          </p>

          <div className="mx-auto mt-8 max-w-md rounded-2xl bg-[var(--surface-soft)] p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--muted)]">Registration reference</p>
            <p className="mt-2 break-all text-2xl font-black tracking-[0.04em] text-[var(--brand)]">{reference || "Unavailable"}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Keep this reference for support and future status checks.</p>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/" className="rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">Return home</Link>
            <Link href="/rules" className="rounded-xl border border-[var(--border)] px-5 py-3 text-sm font-black text-[var(--brand)]">Review rules</Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
