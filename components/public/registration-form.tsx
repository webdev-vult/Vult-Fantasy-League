"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  submitRegistrationAction,
  type RegistrationState,
} from "@/app/register/actions";

const initialState: RegistrationState = { error: null };

const inputClass =
  "mt-2 w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--brand-strong)] outline-none transition placeholder:text-slate-400 focus:border-[var(--brand)] focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100";

export function RegistrationForm({
  competitionSlug,
  registrationOpen,
  leagueCode,
  closedMessage,
}: {
  competitionSlug: string;
  registrationOpen: boolean;
  leagueCode: string | null;
  closedMessage?: string;
}) {
  const [state, formAction, pending] = useActionState(
    submitRegistrationAction,
    initialState,
  );
  const disabled = !registrationOpen || pending;
  const leagueJoinUrl = leagueCode
    ? `https://fantasy.premierleague.com/leagues/auto-join/${encodeURIComponent(leagueCode)}`
    : null;

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="competition_slug" value={competitionSlug} />
      <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state.error ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {state.error}
        </div>
      ) : null}

      {!registrationOpen ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
          {closedMessage ?? "Registration is not currently open. The form will be enabled when Vult opens the season."}
        </div>
      ) : null}

      <section>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Personal details</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Tell us who is entering</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-bold text-[var(--brand-strong)] md:col-span-2">
            Full legal name <span className="text-red-600">*</span>
            <input className={inputClass} name="full_name" required minLength={3} maxLength={120} disabled={disabled} autoComplete="name" placeholder="Jonathan Alie Bangura" />
          </label>
          <label className="text-sm font-bold text-[var(--brand-strong)]">
            Country <span className="text-red-600">*</span>
            <select className={inputClass} name="country" required disabled={disabled} defaultValue="SL">
              <option value="SL">Sierra Leone</option>
            </select>
          </label>
        </div>
      </section>

      <section className="border-t border-[var(--border)] pt-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Contact</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">How Vult can reach you</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-bold text-[var(--brand-strong)]">
            Phone number <span className="text-red-600">*</span>
            <input className={inputClass} type="tel" name="phone" required disabled={disabled} autoComplete="tel" placeholder="+232 76 000000" />
            <span className="mt-2 block text-xs font-normal text-[var(--muted)]">
              Use a reliable contact number. If you have Vult, use the number linked to your account so KYC can be checked if you win.
            </span>
          </label>
          <label className="text-sm font-bold text-[var(--brand-strong)]">
            WhatsApp number
            <input className={inputClass} type="tel" name="whatsapp_phone" disabled={disabled} placeholder="+232 76 000000" />
          </label>
          <label className="text-sm font-bold text-[var(--brand-strong)] md:col-span-2">
            Email address
            <input className={inputClass} type="email" name="email" disabled={disabled} autoComplete="email" placeholder="name@example.com" />
          </label>
        </div>
      </section>

      <section className="border-t border-[var(--border)] pt-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Fantasy team</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Match your official Vult league entry</h2>
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          Join the official Vult FPL league first, then enter your <strong>Team name</strong> and <strong>Manager name</strong> as shown under New entries or Standings.
          {leagueJoinUrl && leagueCode ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a
                href={leagueJoinUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-[var(--brand)] px-4 py-2 text-xs font-black text-white"
              >
                Join Vult FPL league
              </a>
              <span className="text-xs font-black">League code: {leagueCode}</span>
            </div>
          ) : (
            <p className="mt-3 text-xs font-bold">
              The league join code has not been published for this season yet.
            </p>
          )}
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-bold text-[var(--brand-strong)]">
            Team name <span className="text-red-600">*</span>
            <input className={inputClass} name="fpl_team_name" required minLength={2} maxLength={120} disabled={disabled} placeholder="Aluta - Continua FC" />
            <span className="mt-2 block text-xs font-normal text-[var(--muted)]">Capital letters, spaces, hyphens and underscores do not need to match exactly.</span>
          </label>
          <label className="text-sm font-bold text-[var(--brand-strong)]">
            Manager name <span className="text-red-600">*</span>
            <input className={inputClass} name="fpl_manager_name" required minLength={3} maxLength={120} disabled={disabled} placeholder="Mohamed Adams Sesay" />
            <span className="mt-2 block text-xs font-normal text-[var(--muted)]">Small typing mistakes are accepted when your team can still be identified safely.</span>
          </label>
        </div>
        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          The platform uses both names to locate your team, then saves the official FPL spelling and numeric Entry ID automatically.
        </div>
      </section>

      <section className="border-t border-[var(--border)] pt-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Declarations</p>
        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          Everyone may play regardless of age. To receive a weekly, monthly or overall prize, a selected winner must have completed Vult KYC Level 1 or higher when Vult performs the winner check.
        </div>
        <div className="mt-5 space-y-4">
          <label className="flex gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 text-sm leading-6 text-[var(--muted)]">
            <input type="checkbox" name="rules_consent" required disabled={disabled} className="mt-1 h-4 w-4" />
            <span>I have read and accept the <Link href="/rules" className="font-black text-[var(--brand)] underline">competition rules</Link>. <span className="text-red-600">*</span></span>
          </label>
          <label className="flex gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 text-sm leading-6 text-[var(--muted)]">
            <input type="checkbox" name="privacy_consent" required disabled={disabled} className="mt-1 h-4 w-4" />
            <span>I accept the <Link href="/privacy" className="font-black text-[var(--brand)] underline">privacy notice</Link> and consent to the processing of my registration information. <span className="text-red-600">*</span></span>
          </label>
          <label className="flex gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 text-sm leading-6 text-[var(--muted)]">
            <input type="checkbox" name="publicity_consent" disabled={disabled} className="mt-1 h-4 w-4" />
            <span>I agree that my name, fantasy team name and winner photograph may be used in Vult winner announcements if I win. This consent is optional.</span>
          </label>
        </div>
      </section>

      <button type="submit" disabled={disabled} className="w-full rounded-2xl bg-[var(--brand)] px-6 py-4 text-sm font-black text-white shadow-xl shadow-blue-950/20 transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-400">
        {pending ? "Checking the official FPL league and submitting..." : registrationOpen ? "Submit registration" : "Registration not open"}
      </button>
    </form>
  );
}
