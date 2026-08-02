import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  addDisputeEvidenceAction,
  addDisputeMessageAction,
  assignDisputeAction,
  closeDisputeAction,
  resolveDisputeAction,
  updateDisputeWorkflowAction,
} from "../actions";

type Params = Promise<{ disputeId: string }>;
type SearchParams = Promise<{ success?: string; error?: string }>;
type Dispute = {
  id: string;
  case_reference: string;
  competition_season_id: string;
  registration_id: string;
  participant_id: string;
  category: string;
  subject: string;
  description: string;
  related_reference: string | null;
  related_round_id: string | null;
  related_monthly_period_id: string | null;
  related_winner_candidate_id: string | null;
  related_payment_id: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  escalated_to: string | null;
  submitted_channel: string;
  contact_email: string | null;
  contact_phone: string | null;
  decision: string | null;
  resolution_summary: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
  due_at: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};
type AdminActor = { id: string; full_name: string; role: string };
type Message = { id: string; author_type: string; author_admin_id: string | null; channel: string; visibility: string; message: string; created_at: string };
type Evidence = { id: string; submitted_by_type: string; submitted_by_admin: string | null; visibility: string; evidence_type: string; storage_path: string | null; external_url: string | null; file_name: string | null; mime_type: string | null; size_bytes: number | null; notes: string | null; created_at: string };
type History = { id: number; from_status: string | null; to_status: string; action: string; actor_type: string; actor_admin_id: string | null; notes: string | null; created_at: string };
type Notification = { id: string; channel: string; recipient: string; subject: string | null; status: string; scheduled_at: string; sent_at: string | null; provider_message_id: string | null; failure_reason: string | null };

const inputClass = "mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm";
const finalStatuses = ["resolved", "rejected", "closed"];
const caseRoles = ["super_admin", "support_officer", "competition_manager", "compliance_officer", "finance_officer"];
const triageRoles = ["super_admin", "support_officer"];

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

function safeUrl(value: string | null) {
  return value && /^https?:\/\//i.test(value) ? value : null;
}

function statusClass(status: string) {
  if (["resolved", "closed", "sent"].includes(status)) return "border-green-200 bg-green-50 text-green-800";
  if (["rejected", "failed", "urgent"].includes(status)) return "border-red-200 bg-red-50 text-red-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default async function DisputeDetailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const admin = await requireAdmin();
  const { disputeId } = await params;
  const query = await searchParams;
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;

  const { data: disputeRow, error: disputeError } = await db.from("disputes").select("*").eq("id", disputeId).maybeSingle();
  if (disputeError || !disputeRow) notFound();
  const dispute = disputeRow as Dispute;

  const [participantResult, registrationResult, seasonResult, messagesResult, evidenceResult, historyResult, notificationsResult, adminsResult] = await Promise.all([
    db.from("participants").select("id, full_name, email, phone, whatsapp_phone, date_of_birth, country, city, vult_customer_ref, status").eq("id", dispute.participant_id).maybeSingle(),
    db.from("registrations").select("id, public_reference, status, eligibility_status, registered_at, approved_at, registration_channel").eq("id", dispute.registration_id).maybeSingle(),
    db.from("competition_seasons").select("id, name, status").eq("id", dispute.competition_season_id).maybeSingle(),
    db.from("dispute_messages").select("id, author_type, author_admin_id, channel, visibility, message, created_at").eq("dispute_id", dispute.id).order("created_at"),
    db.from("dispute_evidence").select("id, submitted_by_type, submitted_by_admin, visibility, evidence_type, storage_path, external_url, file_name, mime_type, size_bytes, notes, created_at").eq("dispute_id", dispute.id).order("created_at", { ascending: false }),
    db.from("dispute_status_history").select("id, from_status, to_status, action, actor_type, actor_admin_id, notes, created_at").eq("dispute_id", dispute.id).order("created_at", { ascending: false }),
    db.from("notification_outbox").select("id, channel, recipient, subject, status, scheduled_at, sent_at, provider_message_id, failure_reason").eq("dispute_id", dispute.id).order("created_at", { ascending: false }),
    db.from("admin_profiles").select("id, full_name, role").eq("is_active", true).order("full_name"),
  ]);

  const participant = participantResult.data as Record<string, any> | null;
  const registration = registrationResult.data as Record<string, any> | null;
  const season = seasonResult.data as Record<string, any> | null;
  const messages = (messagesResult.data ?? []) as Message[];
  const evidence = (evidenceResult.data ?? []) as Evidence[];
  const history = (historyResult.data ?? []) as History[];
  const notifications = (notificationsResult.data ?? []) as Notification[];
  const admins = (adminsResult.data ?? []) as AdminActor[];
  const actorMap = new Map(admins.map((item) => [item.id, item]));

  const canTriage = triageRoles.includes(admin.role);
  const canWork = caseRoles.includes(admin.role);
  const canDecide =
    admin.role === "super_admin" ||
    (["registration", "eligibility"].includes(dispute.category) && admin.role === "compliance_officer") ||
    (["score", "winner"].includes(dispute.category) && admin.role === "competition_manager") ||
    (dispute.category === "payment" && admin.role === "finance_officer") ||
    (dispute.category === "other" && admin.role === "support_officer");
  const canClose = canTriage && ["resolved", "rejected"].includes(dispute.status);
  const isFinal = finalStatuses.includes(dispute.status);
  const overdue = dispute.due_at && new Date(dispute.due_at).getTime() < Date.now() && !isFinal;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href={`/admin/disputes?season=${dispute.competition_season_id}`} className="text-sm font-black text-[var(--brand)] hover:underline">← Dispute queue</Link>
          <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">Case review</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">{dispute.case_reference}</h1>
          <p className="mt-3 max-w-3xl text-[var(--muted)]">{dispute.subject}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-4 py-2 text-xs font-black capitalize ${statusClass(dispute.status)}`}>{label(dispute.status)}</span>
          <span className={`rounded-full border px-4 py-2 text-xs font-black capitalize ${statusClass(dispute.priority)}`}>{label(dispute.priority)} priority</span>
          {overdue ? <span className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-800">Response overdue</span> : null}
        </div>
      </div>

      {query.success ? <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">{query.success}</div> : null}
      {query.error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">{query.error}</div> : null}

      <section className="grid gap-6 lg:grid-cols-3">
        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Participant</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div><dt className="text-[var(--muted)]">Name</dt><dd className="font-bold">{participant?.full_name ?? "Unknown"}</dd></div>
            <div><dt className="text-[var(--muted)]">Email</dt><dd className="font-bold break-all">{participant?.email ?? "Not recorded"}</dd></div>
            <div><dt className="text-[var(--muted)]">Phone</dt><dd className="font-bold">{participant?.phone ?? "Not recorded"}</dd></div>
            <div><dt className="text-[var(--muted)]">WhatsApp</dt><dd className="font-bold">{participant?.whatsapp_phone ?? "Not recorded"}</dd></div>
            <div><dt className="text-[var(--muted)]">Vult reference</dt><dd className="font-bold">{participant?.vult_customer_ref ?? "Not recorded"}</dd></div>
            <div><dt className="text-[var(--muted)]">Participant status</dt><dd className="font-bold capitalize">{label(participant?.status ?? "unknown")}</dd></div>
          </dl>
          <Link href={`/admin/participants/${dispute.registration_id}`} className="mt-5 inline-flex rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-black text-[var(--brand)]">Open registration</Link>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Registration and season</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div><dt className="text-[var(--muted)]">Registration reference</dt><dd className="font-bold">{registration?.public_reference ?? "Unknown"}</dd></div>
            <div><dt className="text-[var(--muted)]">Registration status</dt><dd className="font-bold capitalize">{label(registration?.status ?? "unknown")}</dd></div>
            <div><dt className="text-[var(--muted)]">Eligibility</dt><dd className="font-bold capitalize">{label(registration?.eligibility_status ?? "unknown")}</dd></div>
            <div><dt className="text-[var(--muted)]">Competition season</dt><dd className="font-bold">{season?.name ?? "Unknown"}</dd></div>
            <div><dt className="text-[var(--muted)]">Submitted</dt><dd className="font-bold">{formatDate(dispute.created_at)}</dd></div>
            <div><dt className="text-[var(--muted)]">Due</dt><dd className={overdue ? "font-black text-red-700" : "font-bold"}>{formatDate(dispute.due_at)}</dd></div>
          </dl>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Case context</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div><dt className="text-[var(--muted)]">Category</dt><dd className="font-bold capitalize">{label(dispute.category)}</dd></div>
            <div><dt className="text-[var(--muted)]">Related reference</dt><dd className="font-bold">{dispute.related_reference ?? "Not supplied"}</dd></div>
            <div><dt className="text-[var(--muted)]">Submitted channel</dt><dd className="font-bold capitalize">{label(dispute.submitted_channel)}</dd></div>
            <div><dt className="text-[var(--muted)]">Assigned to</dt><dd className="font-bold">{dispute.assigned_to ? actorMap.get(dispute.assigned_to)?.full_name ?? "Unknown admin" : "Unassigned"}</dd></div>
            <div><dt className="text-[var(--muted)]">Escalated to</dt><dd className="font-bold">{dispute.escalated_to ? actorMap.get(dispute.escalated_to)?.full_name ?? "Unknown admin" : "Not escalated"}</dd></div>
            <div><dt className="text-[var(--muted)]">Last activity</dt><dd className="font-bold">{formatDate(dispute.last_activity_at)}</dd></div>
          </dl>
        </article>
      </section>

      <article className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Original submission</p>
        <p className="mt-4 whitespace-pre-wrap leading-8 text-[var(--brand-strong)]">{dispute.description}</p>
        {dispute.resolution_summary ? <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-900"><p className="text-xs font-black uppercase tracking-[0.14em]">Decision: {label(dispute.decision ?? "recorded")}</p><p className="mt-3 leading-7">{dispute.resolution_summary}</p></div> : null}
      </article>

      {!isFinal ? (
        <section className="grid gap-6 xl:grid-cols-2">
          {canTriage ? (
            <form action={assignDisputeAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-[var(--brand-strong)]">Assignment and priority</h2>
              <input type="hidden" name="dispute_id" value={dispute.id} />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold">Assignee<select name="assigned_to" className={inputClass} defaultValue={dispute.assigned_to ?? admin.id}>{admins.map((item) => <option key={item.id} value={item.id}>{item.full_name} — {label(item.role)}</option>)}</select></label>
                <label className="text-sm font-bold">Priority<select name="priority" className={inputClass} defaultValue={dispute.priority}>{["low", "normal", "high", "urgent"].map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
              </div>
              <label className="mt-4 block text-sm font-bold">Assignment notes<textarea name="notes" className={inputClass} rows={3} minLength={8} required /></label>
              <button className="mt-4 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white">Assign case</button>
            </form>
          ) : null}

          {canWork ? (
            <form action={updateDisputeWorkflowAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-[var(--brand-strong)]">Workflow status</h2>
              <input type="hidden" name="dispute_id" value={dispute.id} />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold">Next status<select name="status" className={inputClass} defaultValue="under_review"><option value="assigned">Assigned</option><option value="under_review">Under review</option><option value="awaiting_participant">Awaiting participant</option><option value="escalated">Escalated</option></select></label>
                <label className="text-sm font-bold">Escalation recipient<select name="escalated_to" className={inputClass} defaultValue={dispute.escalated_to ?? ""}><option value="">Not required</option>{admins.map((item) => <option key={item.id} value={item.id}>{item.full_name} — {label(item.role)}</option>)}</select></label>
              </div>
              <label className="mt-4 block text-sm font-bold">Workflow notes<textarea name="notes" className={inputClass} rows={3} minLength={8} required /></label>
              <button className="mt-4 rounded-xl border border-[var(--brand)] px-4 py-3 text-sm font-black text-[var(--brand)]">Update workflow</button>
            </form>
          ) : null}

          {canWork ? (
            <form action={addDisputeMessageAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-[var(--brand-strong)]">Add case message</h2>
              <input type="hidden" name="dispute_id" value={dispute.id} />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold">Visibility<select name="visibility" className={inputClass} defaultValue="participant"><option value="participant">Participant visible</option><option value="internal">Internal only</option></select></label>
                <label className="text-sm font-bold">Channel<select name="channel" className={inputClass} defaultValue="in_app"><option value="in_app">In platform</option><option value="email">Email record</option><option value="whatsapp">WhatsApp record</option><option value="phone">Phone record</option><option value="internal">Internal note</option></select></label>
              </div>
              <label className="mt-4 block text-sm font-bold">Message<textarea name="message" className={inputClass} rows={5} minLength={2} required /></label>
              <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold"><label className="flex items-center gap-2"><input type="checkbox" name="notify_email" /> Queue email copy</label><label className="flex items-center gap-2"><input type="checkbox" name="notify_whatsapp" /> Queue WhatsApp copy</label></div>
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Email and WhatsApp copies enter the manual delivery queue. They are not marked sent automatically.</p>
              <button className="mt-4 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-black text-white">Record message</button>
            </form>
          ) : null}

          {canWork ? (
            <form action={addDisputeEvidenceAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-[var(--brand-strong)]">Add evidence reference</h2>
              <input type="hidden" name="dispute_id" value={dispute.id} />
              <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Visibility<select name="visibility" className={inputClass}><option value="internal">Internal only</option><option value="participant">Participant visible</option></select></label><label className="text-sm font-bold">Evidence type<select name="evidence_type" className={inputClass}><option value="supporting_document">Supporting document</option><option value="screenshot">Screenshot</option><option value="statement">Statement</option><option value="payment_receipt">Payment receipt</option><option value="score_evidence">Score evidence</option><option value="other">Other</option></select></label></div>
              <label className="mt-4 block text-sm font-bold">Storage path<input name="storage_path" className={inputClass} placeholder="Optional internal storage reference" /></label>
              <label className="mt-4 block text-sm font-bold">External URL<input name="external_url" type="url" className={inputClass} placeholder="https://..." /></label>
              <div className="mt-4 grid gap-4 sm:grid-cols-3"><label className="text-sm font-bold">File name<input name="file_name" className={inputClass} /></label><label className="text-sm font-bold">MIME type<input name="mime_type" className={inputClass} /></label><label className="text-sm font-bold">Size bytes<input name="size_bytes" type="number" min="0" className={inputClass} /></label></div>
              <label className="mt-4 block text-sm font-bold">Notes<textarea name="notes" className={inputClass} rows={3} /></label>
              <button className="mt-4 rounded-xl border border-[var(--brand)] px-4 py-3 text-sm font-black text-[var(--brand)]">Record evidence</button>
            </form>
          ) : null}

          {canDecide ? (
            <form action={resolveDisputeAction} className="rounded-3xl border border-green-200 bg-green-50 p-6 shadow-sm xl:col-span-2">
              <h2 className="text-lg font-black text-green-900">Final case decision</h2>
              <p className="mt-2 text-sm leading-6 text-green-800">Your role is authorised to decide {label(dispute.category)} cases. The decision and participant-visible resolution become immutable history.</p>
              <input type="hidden" name="dispute_id" value={dispute.id} />
              <div className="mt-5 grid gap-4 md:grid-cols-[0.35fr_0.65fr]"><label className="text-sm font-bold text-green-900">Decision<select name="decision" className={inputClass}><option value="upheld">Upheld</option><option value="partially_upheld">Partially upheld</option><option value="rejected">Rejected</option><option value="no_action">No action</option><option value="withdrawn">Withdrawn</option></select></label><label className="text-sm font-bold text-green-900">Resolution summary<textarea name="resolution_summary" className={inputClass} rows={5} minLength={20} required /></label></div>
              <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold text-green-900"><label className="flex items-center gap-2"><input type="checkbox" name="notify_email" /> Queue email decision</label><label className="flex items-center gap-2"><input type="checkbox" name="notify_whatsapp" /> Queue WhatsApp decision</label></div>
              <button className="mt-5 rounded-xl bg-green-700 px-5 py-3 text-sm font-black text-white">Record final decision</button>
            </form>
          ) : null}
        </section>
      ) : null}

      {canClose ? (
        <form action={closeDisputeAction} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-black text-[var(--brand-strong)]">Close decided case</h2>
          <input type="hidden" name="dispute_id" value={dispute.id} />
          <label className="mt-4 block text-sm font-bold">Closure notes<textarea name="notes" className={inputClass} rows={3} minLength={8} required /></label>
          <button className="mt-4 rounded-xl bg-[var(--brand-strong)] px-4 py-3 text-sm font-black text-white">Close case</button>
        </form>
      ) : null}

      <section className="grid gap-7 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-black text-[var(--brand-strong)]">Communication history</h2>
          <div className="mt-6 space-y-4">
            {messages.length ? messages.map((item) => {
              const actor = item.author_admin_id ? actorMap.get(item.author_admin_id) : null;
              return <div key={item.id} className={`rounded-2xl p-5 ${item.visibility === "internal" ? "border border-amber-200 bg-amber-50" : item.author_type === "participant" ? "bg-[var(--surface-soft)]" : "border border-blue-100 bg-blue-50"}`}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">{item.author_type === "participant" ? "Participant" : actor?.full_name ?? "System"}</span><span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black capitalize text-[var(--muted)]">{label(item.channel)}</span>{item.visibility === "internal" ? <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">Internal</span> : null}</div><p className="text-xs text-[var(--muted)]">{formatDate(item.created_at)}</p></div><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--brand-strong)]">{item.message}</p></div>;
            }) : <p className="text-sm text-[var(--muted)]">No messages recorded.</p>}
          </div>
        </article>

        <div className="space-y-7">
          <article className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-[var(--brand-strong)]">Evidence</h2>
            <div className="mt-5 space-y-3">{evidence.length ? evidence.map((item) => { const url = safeUrl(item.external_url); const actor = item.submitted_by_admin ? actorMap.get(item.submitted_by_admin) : null; return <div key={item.id} className="rounded-2xl bg-[var(--surface-soft)] p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-black capitalize text-[var(--brand-strong)]">{label(item.evidence_type)}</p><span className="text-xs font-black capitalize text-[var(--muted)]">{label(item.visibility)}</span></div><p className="mt-1 text-xs text-[var(--muted)]">{item.submitted_by_type === "admin" ? actor?.full_name ?? "Admin" : label(item.submitted_by_type)} · {formatDate(item.created_at)}</p>{item.notes ? <p className="mt-2 leading-6 text-[var(--muted)]">{item.notes}</p> : null}{url ? <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex font-black text-[var(--brand)] hover:underline">Open evidence</a> : item.storage_path ? <p className="mt-3 break-all font-mono text-xs text-[var(--brand)]">{item.storage_path}</p> : null}</div>; }) : <p className="text-sm text-[var(--muted)]">No evidence recorded.</p>}</div>
          </article>

          <article className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-black text-[var(--brand-strong)]">Notification queue</h2><Link href="/admin/communications?tab=outbox" className="text-xs font-black text-[var(--brand)]">Open queue</Link></div>
            <div className="mt-5 space-y-3">{notifications.length ? notifications.map((item) => <div key={item.id} className="rounded-2xl bg-[var(--surface-soft)] p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="font-black capitalize text-[var(--brand-strong)]">{label(item.channel)}</p><span className={`rounded-full border px-2 py-1 text-[10px] font-black capitalize ${statusClass(item.status)}`}>{label(item.status)}</span></div><p className="mt-2 break-all text-xs text-[var(--muted)]">{item.recipient}</p><p className="mt-2 text-xs text-[var(--muted)]">{formatDate(item.sent_at ?? item.scheduled_at)}</p>{item.failure_reason ? <p className="mt-2 text-xs font-bold text-red-700">{item.failure_reason}</p> : null}</div>) : <p className="text-sm text-[var(--muted)]">No notification records.</p>}</div>
          </article>
        </div>
      </section>

      <article className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-2xl font-black text-[var(--brand-strong)]">Status history</h2>
        <div className="mt-6 space-y-3">{history.map((item) => { const actor = item.actor_admin_id ? actorMap.get(item.actor_admin_id) : null; return <div key={item.id} className="grid gap-3 rounded-2xl bg-[var(--surface-soft)] p-4 sm:grid-cols-[0.9fr_1.4fr_0.7fr]"><div><p className="font-black capitalize text-[var(--brand-strong)]">{item.from_status ? `${label(item.from_status)} → ` : ""}{label(item.to_status)}</p><p className="mt-1 text-xs capitalize text-[var(--muted)]">{label(item.action)}</p></div><p className="text-sm leading-6 text-[var(--muted)]">{item.notes ?? "No notes recorded."}</p><div className="text-sm sm:text-right"><p className="font-bold">{actor?.full_name ?? label(item.actor_type)}</p><p className="mt-1 text-xs text-[var(--muted)]">{formatDate(item.created_at)}</p></div></div>; })}</div>
      </article>
    </div>
  );
}
