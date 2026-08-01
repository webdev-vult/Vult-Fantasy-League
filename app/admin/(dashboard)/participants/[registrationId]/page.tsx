import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  addRegistrationNoteAction,
  refreshDuplicateRiskAction,
  transitionRegistrationStatusAction,
  updateFplVerificationAction,
  updateParticipantProfileAction,
  updateVultVerificationAction,
} from "../actions";

type PageParams = Promise<{ registrationId: string }>;
type SearchParams = Promise<{ success?: string; error?: string }>;

type RegistrationDetail = {
  id: string;
  public_reference: string;
  status: string;
  eligibility_status: string;
  registered_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  rules_version: number;
  registration_channel: string;
  metadata: unknown;
  participant: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string;
    whatsapp_phone: string | null;
    date_of_birth: string | null;
    country: string;
    city: string | null;
    vult_customer_ref: string | null;
    status: string;
    created_at: string;
  } | null;
  fantasy_entry: {
    id: string;
    provider: string;
    provider_entry_id: string;
    manager_name: string | null;
    team_name: string | null;
    verified_at: string | null;
    last_synced_at: string | null;
  } | null;
  verification: {
    id: string;
    fpl_status: string;
    fpl_verified_entry_id: string | null;
    fpl_manager_name: string | null;
    fpl_team_name: string | null;
    fpl_notes: string | null;
    fpl_checked_at: string | null;
    fpl_checked_by: string | null;
    vult_status: string;
    vult_verified_reference: string | null;
    vult_notes: string | null;
    vult_checked_at: string | null;
    vult_checked_by: string | null;
    duplicate_risk: string;
    duplicate_risk_reasons: unknown;
    duplicate_checked_at: string | null;
    duplicate_checked_by: string | null;
  } | null;
  competition_season: {
    id: string;
    name: string;
    status: string;
  } | null;
};

type Consent = {
  id: string;
  consent_type: string;
  document_version: string;
  accepted: boolean;
  accepted_at: string;
};

type Note = {
  id: string;
  note_type: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  author: { full_name: string; role: string } | null;
};

type History = {
  id: string;
  from_status: string | null;
  to_status: string;
  from_eligibility_status: string | null;
  to_eligibility_status: string;
  reason: string | null;
  created_at: string;
  changed_by_profile: { full_name: string; role: string } | null;
};

const verificationStatuses = ["pending", "verified", "failed", "review_required", "not_required"];
const registrationStatuses = ["pending", "approved", "rejected", "suspended", "disqualified"];

function label(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function badgeClasses(value: string) {
  if (["approved", "eligible", "verified", "none", "not_required", "active"].includes(value)) {
    return "border-green-200 bg-green-50 text-green-800";
  }
  if (["rejected", "disqualified", "failed", "high", "blocked"].includes(value)) {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (["suspended", "review_required", "medium"].includes(value)) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--brand-strong)]";
const labelClass = "text-xs font-black uppercase tracking-[0.13em] text-[var(--brand)]";

export default async function ParticipantDetailPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const admin = await requireAdmin();
  const { registrationId } = await params;
  const messages = await searchParams;
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;

  const { data, error } = await db
    .from("registrations")
    .select(
      `
        id,
        public_reference,
        status,
        eligibility_status,
        registered_at,
        approved_at,
        approved_by,
        rejection_reason,
        rules_version,
        registration_channel,
        metadata,
        participant:participants!registrations_participant_id_fkey(
          id, full_name, email, phone, whatsapp_phone, date_of_birth, country, city,
          vult_customer_ref, status, created_at
        ),
        fantasy_entry:fantasy_entries(
          id, provider, provider_entry_id, manager_name, team_name, verified_at, last_synced_at
        ),
        verification:registration_verifications(
          id, fpl_status, fpl_verified_entry_id, fpl_manager_name, fpl_team_name,
          fpl_notes, fpl_checked_at, fpl_checked_by,
          vult_status, vult_verified_reference, vult_notes, vult_checked_at, vult_checked_by,
          duplicate_risk, duplicate_risk_reasons, duplicate_checked_at, duplicate_checked_by
        ),
        competition_season:competition_seasons!registrations_competition_season_id_fkey(
          id, name, status
        )
      `,
    )
    .eq("id", registrationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const registration = data as RegistrationDetail;
  const [consentsResult, notesResult, historyResult, adminProfilesResult] = await Promise.all([
    db
      .from("participant_consents")
      .select("id, consent_type, document_version, accepted, accepted_at")
      .eq("registration_id", registrationId)
      .order("accepted_at"),
    db
      .from("registration_notes")
      .select("id, note_type, body, is_pinned, created_at, author:admin_profiles!registration_notes_author_user_id_fkey(full_name, role)")
      .eq("registration_id", registrationId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    db
      .from("registration_status_history")
      .select("id, from_status, to_status, from_eligibility_status, to_eligibility_status, reason, created_at, changed_by_profile:admin_profiles!registration_status_history_changed_by_fkey(full_name, role)")
      .eq("registration_id", registrationId)
      .order("created_at", { ascending: false }),
    db.from("admin_profiles").select("id, full_name, role").eq("is_active", true),
  ]);

  const consents = (consentsResult.data ?? []) as Consent[];
  const notes = (notesResult.data ?? []) as Note[];
  const history = (historyResult.data ?? []) as History[];
  const adminProfiles = (adminProfilesResult.data ?? []) as Array<{ id: string; full_name: string; role: string }>;
  const adminNames = new Map(adminProfiles.map((profile) => [profile.id, profile.full_name]));
  const participant = registration.participant;
  const entry = registration.fantasy_entry;
  const verification = registration.verification;
  const duplicateReasons = stringArray(verification?.duplicate_risk_reasons);
  const canVerify = ["super_admin", "competition_manager", "compliance_officer"].includes(admin.role);
  const canAddNotes = [...["super_admin", "competition_manager", "compliance_officer"], "support_officer"].includes(admin.role);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/admin/participants" className="text-sm font-black text-[var(--brand)]">
            ← Back to participants
          </Link>
          <p className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">
            Registration review
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">
            {participant?.full_name ?? "Participant"}
          </h1>
          <p className="mt-2 font-mono text-sm text-[var(--muted)]">{registration.public_reference}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase ${badgeClasses(registration.status)}`}>
            {label(registration.status)}
          </span>
          <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase ${badgeClasses(registration.eligibility_status)}`}>
            {label(registration.eligibility_status)}
          </span>
          <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase ${badgeClasses(participant?.status ?? "active")}`}>
            Participant {label(participant?.status ?? "active")}
          </span>
        </div>
      </div>

      {messages.success ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">
          {messages.success}
        </div>
      ) : null}
      {messages.error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">
          {messages.error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [verification?.fpl_status ?? "pending", "FPL verification", verification?.fpl_checked_at],
          [verification?.vult_status ?? "pending", "Vult verification", verification?.vult_checked_at],
          [verification?.duplicate_risk ?? "none", "Duplicate risk", verification?.duplicate_checked_at],
          [registration.status, "Registration status", registration.approved_at],
        ].map(([value, title, date]) => (
          <article key={String(title)} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${badgeClasses(String(value))}`}>
              {label(String(value))}
            </span>
            <h2 className="mt-4 text-base font-black text-[var(--brand-strong)]">{title}</h2>
            <p className="mt-2 text-xs text-[var(--muted)]">{formatDate(date ? String(date) : null)}</p>
          </article>
        ))}
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-8">
          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Participant profile</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Submitted personal details</h2>
              </div>
              <span className="rounded-full bg-[#f4f6fb] px-3 py-1 text-xs font-bold text-[var(--muted)]">
                Created {formatDate(participant?.created_at ?? null)}
              </span>
            </div>

            {participant ? (
              <form action={updateParticipantProfileAction} className="mt-6 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="registration_id" value={registration.id} />
                <input type="hidden" name="participant_id" value={participant.id} />
                <label className="sm:col-span-2">
                  <span className={labelClass}>Full legal name</span>
                  <input name="full_name" required defaultValue={participant.full_name} disabled={!canVerify} className={inputClass} />
                </label>
                <label>
                  <span className={labelClass}>Phone</span>
                  <input name="phone" required defaultValue={participant.phone} disabled={!canVerify} className={inputClass} />
                </label>
                <label>
                  <span className={labelClass}>WhatsApp</span>
                  <input name="whatsapp_phone" defaultValue={participant.whatsapp_phone ?? ""} disabled={!canVerify} className={inputClass} />
                </label>
                <label>
                  <span className={labelClass}>Email</span>
                  <input type="email" name="email" defaultValue={participant.email ?? ""} disabled={!canVerify} className={inputClass} />
                </label>
                <label>
                  <span className={labelClass}>Date of birth</span>
                  <input type="date" name="date_of_birth" required defaultValue={participant.date_of_birth ?? ""} disabled={!canVerify} className={inputClass} />
                </label>
                <label>
                  <span className={labelClass}>City or district</span>
                  <input name="city" defaultValue={participant.city ?? ""} disabled={!canVerify} className={inputClass} />
                </label>
                <label>
                  <span className={labelClass}>Country code</span>
                  <input name="country" required defaultValue={participant.country} disabled={!canVerify} className={inputClass} />
                </label>
                <label className="sm:col-span-2">
                  <span className={labelClass}>Vult customer reference</span>
                  <input name="vult_customer_ref" defaultValue={participant.vult_customer_ref ?? ""} disabled={!canVerify} className={inputClass} />
                </label>
                {canVerify ? (
                  <div className="sm:col-span-2">
                    <button className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-black text-white">Save profile corrections</button>
                  </div>
                ) : null}
              </form>
            ) : (
              <p className="mt-6 text-sm text-red-700">The participant profile could not be loaded.</p>
            )}
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">FPL verification</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Fantasy entry evidence</h2>
            <div className="mt-5 rounded-2xl bg-[#f7f8fc] p-4 text-sm">
              <p><span className="font-black">Submitted entry ID:</span> {entry?.provider_entry_id ?? "Not available"}</p>
              <p className="mt-2"><span className="font-black">Submitted team:</span> {entry?.team_name ?? "Not provided"}</p>
              <p className="mt-2"><span className="font-black">Provider:</span> {label(entry?.provider ?? "unknown")}</p>
            </div>
            <form action={updateFplVerificationAction} className="mt-6 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="registration_id" value={registration.id} />
              <label>
                <span className={labelClass}>FPL status</span>
                <select name="fpl_status" defaultValue={verification?.fpl_status ?? "pending"} disabled={!canVerify} className={inputClass}>
                  {verificationStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                </select>
              </label>
              <label>
                <span className={labelClass}>Verified entry ID</span>
                <input name="fpl_verified_entry_id" inputMode="numeric" defaultValue={verification?.fpl_verified_entry_id ?? entry?.provider_entry_id ?? ""} disabled={!canVerify} className={inputClass} />
              </label>
              <label>
                <span className={labelClass}>Manager name</span>
                <input name="fpl_manager_name" defaultValue={verification?.fpl_manager_name ?? entry?.manager_name ?? ""} disabled={!canVerify} className={inputClass} />
              </label>
              <label>
                <span className={labelClass}>Team name</span>
                <input name="fpl_team_name" defaultValue={verification?.fpl_team_name ?? entry?.team_name ?? ""} disabled={!canVerify} className={inputClass} />
              </label>
              <label className="sm:col-span-2">
                <span className={labelClass}>Verification notes</span>
                <textarea name="fpl_notes" rows={4} defaultValue={verification?.fpl_notes ?? ""} disabled={!canVerify} className={inputClass} />
              </label>
              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--muted)]">
                  Checked by {verification?.fpl_checked_by ? adminNames.get(verification.fpl_checked_by) ?? "an administrator" : "nobody yet"} · {formatDate(verification?.fpl_checked_at ?? null)}
                </p>
                {canVerify ? <button className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-black text-white">Save FPL verification</button> : null}
              </div>
            </form>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Vult verification</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Customer-account eligibility</h2>
            <form action={updateVultVerificationAction} className="mt-6 grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="registration_id" value={registration.id} />
              <label>
                <span className={labelClass}>Vult status</span>
                <select name="vult_status" defaultValue={verification?.vult_status ?? "pending"} disabled={!canVerify} className={inputClass}>
                  {verificationStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                </select>
              </label>
              <label>
                <span className={labelClass}>Verified Vult reference</span>
                <input name="vult_verified_reference" defaultValue={verification?.vult_verified_reference ?? participant?.vult_customer_ref ?? ""} disabled={!canVerify} className={inputClass} />
              </label>
              <label className="sm:col-span-2">
                <span className={labelClass}>Verification notes</span>
                <textarea name="vult_notes" rows={4} defaultValue={verification?.vult_notes ?? ""} disabled={!canVerify} className={inputClass} />
              </label>
              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--muted)]">
                  Checked by {verification?.vult_checked_by ? adminNames.get(verification.vult_checked_by) ?? "an administrator" : "nobody yet"} · {formatDate(verification?.vult_checked_at ?? null)}
                </p>
                {canVerify ? <button className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-black text-white">Save Vult verification</button> : null}
              </div>
            </form>
          </section>
        </div>

        <div className="space-y-8">
          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Duplicate screening</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Risk indicators</h2>
              </div>
              <span className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase ${badgeClasses(verification?.duplicate_risk ?? "none")}`}>
                {label(verification?.duplicate_risk ?? "none")}
              </span>
            </div>
            {duplicateReasons.length ? (
              <ul className="mt-5 space-y-3">
                {duplicateReasons.map((reason) => (
                  <li key={reason} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{reason}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 rounded-xl bg-green-50 px-4 py-3 text-sm font-bold text-green-800">No duplicate indicators are currently recorded.</p>
            )}
            <p className="mt-4 text-xs text-[var(--muted)]">
              Last checked by {verification?.duplicate_checked_by ? adminNames.get(verification.duplicate_checked_by) ?? "an administrator" : "nobody yet"} · {formatDate(verification?.duplicate_checked_at ?? null)}
            </p>
            {canVerify ? (
              <form action={refreshDuplicateRiskAction} className="mt-5">
                <input type="hidden" name="registration_id" value={registration.id} />
                <button className="rounded-xl border border-[var(--brand)] px-4 py-2.5 text-sm font-black text-[var(--brand)]">Refresh duplicate-risk check</button>
              </form>
            ) : null}
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Eligibility decision</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Registration workflow</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Approval is blocked until FPL and required Vult verification are complete. High duplicate risk requires a Super Admin override.
            </p>
            <form action={transitionRegistrationStatusAction} className="mt-6 space-y-4">
              <input type="hidden" name="registration_id" value={registration.id} />
              <label className="block">
                <span className={labelClass}>New status</span>
                <select name="new_status" defaultValue={registration.status} disabled={!canVerify} className={inputClass}>
                  {registrationStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Decision reason</span>
                <textarea name="reason" rows={4} placeholder="Required for rejection, suspension and disqualification" disabled={!canVerify} className={inputClass} />
              </label>
              {registration.rejection_reason ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <span className="font-black">Current decision reason:</span> {registration.rejection_reason}
                </div>
              ) : null}
              {canVerify ? <button className="w-full rounded-xl bg-[var(--brand-strong)] px-5 py-3 text-sm font-black text-white">Apply status change</button> : null}
            </form>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Consent evidence</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Participant agreements</h2>
            <div className="mt-5 space-y-3">
              {consents.length ? consents.map((consent) => (
                <div key={consent.id} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] px-4 py-3">
                  <div>
                    <p className="text-sm font-black text-[var(--brand-strong)]">{label(consent.consent_type)}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">Version {consent.document_version} · {formatDate(consent.accepted_at)}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${consent.accepted ? badgeClasses("verified") : badgeClasses("failed")}`}>
                    {consent.accepted ? "Accepted" : "Declined"}
                  </span>
                </div>
              )) : <p className="text-sm text-[var(--muted)]">No consent records were found.</p>}
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Internal collaboration</p>
            <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Notes</h2>
            {canAddNotes ? (
              <form action={addRegistrationNoteAction} className="mt-5 space-y-4">
                <input type="hidden" name="registration_id" value={registration.id} />
                <label className="block">
                  <span className={labelClass}>Note type</span>
                  <select name="note_type" defaultValue="internal" className={inputClass}>
                    {['internal', 'verification', 'compliance', 'support'].map((type) => <option key={type} value={type}>{label(type)}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className={labelClass}>Note</span>
                  <textarea name="body" required minLength={2} maxLength={2000} rows={4} className={inputClass} />
                </label>
                <label className="flex items-center gap-3 text-sm font-bold text-[var(--brand-strong)]">
                  <input type="checkbox" name="is_pinned" className="h-4 w-4" /> Pin this note
                </label>
                <button className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-black text-white">Add note</button>
              </form>
            ) : null}
            <div className="mt-6 space-y-3">
              {notes.length ? notes.map((note) => (
                <article key={note.id} className={`rounded-2xl border p-4 ${note.is_pinned ? "border-amber-200 bg-amber-50" : "border-[var(--border)] bg-[#fafbfe]"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase text-[var(--brand)]">{label(note.note_type)}</span>
                    {note.is_pinned ? <span className="text-xs font-black text-amber-800">Pinned</span> : null}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--brand-strong)]">{note.body}</p>
                  <p className="mt-3 text-xs text-[var(--muted)]">{note.author?.full_name ?? "Former administrator"} · {formatDate(note.created_at)}</p>
                </article>
              )) : <p className="text-sm text-[var(--muted)]">No internal notes have been added.</p>}
            </div>
          </section>
        </div>
      </div>

      <section className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Audit trail</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--brand-strong)]">Status history</h2>
        <div className="mt-6 space-y-4">
          {history.length ? history.map((event) => (
            <article key={event.id} className="grid gap-3 rounded-2xl border border-[var(--border)] p-4 md:grid-cols-[180px_1fr]">
              <div>
                <p className="text-xs font-black text-[var(--brand)]">{formatDate(event.created_at)}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{event.changed_by_profile?.full_name ?? "System"}</p>
              </div>
              <div>
                <p className="text-sm font-black text-[var(--brand-strong)]">
                  {event.from_status ? `${label(event.from_status)} → ` : ""}{label(event.to_status)}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Eligibility: {event.from_eligibility_status ? `${label(event.from_eligibility_status)} → ` : ""}{label(event.to_eligibility_status)}
                </p>
                {event.reason ? <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{event.reason}</p> : null}
              </div>
            </article>
          )) : <p className="text-sm text-[var(--muted)]">No workflow events have been recorded.</p>}
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-[var(--brand-strong)] p-6 text-white shadow-sm sm:p-7">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.13em] text-blue-200">Competition season</p>
            <p className="mt-2 font-black">{registration.competition_season?.name ?? "Unknown season"}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.13em] text-blue-200">Registered</p>
            <p className="mt-2 font-black">{formatDate(registration.registered_at)}</p>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.13em] text-blue-200">Channel and rules</p>
            <p className="mt-2 font-black">{label(registration.registration_channel)} · Rules v{registration.rules_version}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
