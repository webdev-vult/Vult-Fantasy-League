import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Registration received",
  robots: { index: false, follow: false },
};

export default async function RegistrationSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    reference?: string;
    verification?: string;
    eligible_from_round?: string;
  }>;
}) {
  const { reference } = await searchParams;
  // The generated database types are updated after the accompanying migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminSupabaseClient() as any;
  const { data: registration } = reference
    ? await db
        .from("registrations")
        .select("eligible_from_round, metadata, competition_season:competition_seasons!registrations_competition_season_id_fkey(settings)")
        .eq("public_reference", reference)
        .maybeSingle()
    : { data: null };
  const metadata = registration?.metadata && typeof registration.metadata === "object" && !Array.isArray(registration.metadata)
    ? registration.metadata as Record<string, unknown>
    : {};
  const season = Array.isArray(registration?.competition_season)
    ? registration.competition_season[0]
    : registration?.competition_season;
  const settings = season?.settings && typeof season.settings === "object" && !Array.isArray(season.settings)
    ? season.settings as Record<string, unknown>
    : {};
  const leagueCode = registration ? String(settings.fpl_league_code ?? "").trim() : "";
  const eligibleFromRound = registration?.eligible_from_round
    ? String(registration.eligible_from_round)
    : null;
  const awaitingFpl = metadata.fpl_resolution_state === "awaiting_fpl_sync";
  const leagueJoinUrl = leagueCode
    ? `https://fantasy.premierleague.com/leagues/auto-join/${encodeURIComponent(leagueCode)}`
    : null;

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader />
      <section className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center px-5 py-16 sm:px-8">
        <div className="w-full rounded-[2rem] border border-[var(--border)] bg-white p-8 text-center shadow-xl shadow-blue-950/10 sm:p-12">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl font-black text-emerald-700">✓</span>
          <p className="mt-7 text-xs font-black uppercase tracking-[0.2em] text-[var(--brand)]">Registration received</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            {!registration
              ? "Registration reference not found."
              : awaitingFpl
                ? "Your registration is safely recorded."
                : "Your entry is pending approval."}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[var(--muted)]">
            {!registration
              ? "Return to the registration page and complete the form to receive the private Vult FPL league link."
              : awaitingFpl
              ? `FPL has not published your league entry yet. Vult will keep checking automatically. You will not be included in completed Gameweeks, and your prize eligibility begins from Gameweek ${eligibleFromRound ?? "the next open Gameweek"}.`
              : "Your FPL entry was found in the official league. Vult will complete its duplicate-entry review before approving the registration."}
          </p>

          {leagueJoinUrl ? (
            <div className="mx-auto mt-7 max-w-xl rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-5">
              <p className="text-sm font-black text-[var(--brand-strong)]">Join the official Vult FPL league</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                This private link is shown only after your Vult registration has been saved. Join the league now, then Vult will verify your entry automatically.
              </p>
              <a
                href={leagueJoinUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white"
              >
                Join Vult FPL league
              </a>
            </div>
          ) : null}

          <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-left">
            <p className="text-sm font-black text-[var(--brand)]">Check your email</p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              A confirmation email is being sent to the address you provided. It includes the private league link, your first eligible Gameweek and your registration reference. Check your inbox and spam folder.
            </p>
          </div>

          <div className="mx-auto mt-8 max-w-md rounded-2xl bg-[var(--surface-soft)] p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--muted)]">Registration reference</p>
            <p className="mt-2 break-all text-2xl font-black tracking-[0.04em] text-[var(--brand)]">{registration ? reference : "Unavailable"}</p>
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
