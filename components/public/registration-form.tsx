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
  minimumAge,
  requiresVultAccount,
}: {
  competitionSlug: string;
  registrationOpen: boolean;
  minimumAge: number;
  requiresVultAccount: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    submitRegistrationAction,
    initialState,
  );
  const disabled = !registrationOpen || pending;

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
          Registration has not opened yet. You can review the required information now, but the form will remain disabled until an approved rule version is published and the season is opened by Vult.
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
            Date of birth <span className="text-red-600">*</span>
            <input className={inputClass} type="date" name="date_of_birth" required disabled={disabled} autoComplete="bday" />
            <span className="mt-2 block text-xs font-normal text-[var(--muted)]">Minimum age: {minimumAge}</span>
          </label>
          <label className="text-sm font-bold text-[var(--brand-strong)]">
            City or district
            <input className={inputClass} name="city" maxLength={100} disabled={disabled} autoComplete="address-level2" placeholder="Freetown" />
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
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Contact and Vult</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">How Vult can reach and verify you</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-bold text-[var(--brand-strong)]">
            Phone number <span className="text-red-600">*</span>
            <input className={inputClass} type="tel" name="phone" required disabled={disabled} autoComplete="tel" placeholder="+232 76 000000" />
          </label>
          <label className="text-sm font-bold text-[var(--brand-strong)]">
            WhatsApp number
            <input className={inputClass} type="tel" name="whatsapp_phone" disabled={disabled} placeholder="+232 76 000000" />
          </label>
          <label className="text-sm font-bold text-[var(--brand-strong)]">
            Email address
            <input className={inputClass} type="email" name="email" disabled={disabled} autoComplete="email" placeholder="name@example.com" />
          </label>
          <label className="text-sm font-bold text-[var(--brand-strong)]">
            Vult account reference {requiresVultAccount ? <span className="text-red-600">*</span> : null}
            <input className={inputClass} name="vult_customer_ref" required={requiresVultAccount} disabled={disabled} maxLength={100} placeholder="Your Vult account or customer reference" />
          </label>
        </div>
      </section>

      <section className="border-t border-[var(--border)] pt-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Fantasy team</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Connect your official FPL entry</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-bold text-[var(--brand-strong)]">
            FPL Entry ID <span className="text-red-600">*</span>
            <input className={inputClass} name="fpl_entry_id" required inputMode="numeric" pattern="[0-9]{1,12}" disabled={disabled} placeholder="1234567" />
            <span className="mt-2 block text-xs font-normal text-[var(--muted)]">Use the numeric ID from your official FPL team URL.</span>
          </label>
          <label className="text-sm font-bold text-[var(--brand-strong)]">
            FPL team name
            <input className={inputClass} name="fpl_team_name" maxLength={120} disabled={disabled} placeholder="Your fantasy team name" />
          </label>
        </div>
      </section>

      <section className="border-t border-[var(--border)] pt-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--brand)]">Declarations</p>
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
        {pending ? "Submitting registration..." : registrationOpen ? "Submit registration" : "Registration not open"}
      </button>
    </form>
  );
}
