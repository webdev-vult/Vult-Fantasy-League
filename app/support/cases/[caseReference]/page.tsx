import Link from "next/link";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { getPublicCompetition } from "@/lib/public/competition";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { replyToDisputeAction } from "../../actions";

type Params = Promise<{ caseReference: string }>;
type SearchParams = Promise<{ access?: string; created?: string; success?: string; error?: string }>;
type CaseMessage = { id: string; author_type: string; channel: string; message: string; created_at: string };
type CaseEvidence = { id: string; evidence_type: string; external_url: string | null; file_name: string | null; notes: string | null; created_at: string };
type CaseData = {
  case_reference: string;
  category: string;
  subject: string;
  status: string;
  priority: string;
  decision: string | null;
  resolution_summary: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  messages: CaseMessage[];
  evidence: CaseEvidence[];
};

function label(value: string) {
  return value.replaceAll("_", " ");
}

function formatDate(value: string) {
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
  if (["resolved", "closed"].includes(status)) return "border-green-200 bg-green-50 text-green-800";
  if (["rejected"].includes(status)) return "border-red-200 bg-red-50 text-red-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default async function PublicCasePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const competition = await getPublicCompetition();
  const { caseReference } = await params;
  const query = await searchParams;
  const access = query.access ?? "";
  let caseData: CaseData | null = null;
  let accessError = "";

  if (access) {
    const db = createAdminSupabaseClient() as any;
    const { data, error } = await db.rpc("get_public_dispute_case", {
      p_case_reference: caseReference,
      p_access_token: access,
    });
    if (error) accessError = error.message;
    else caseData = data as CaseData;
  }

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen} />
      <section className="bg-[var(--brand-strong)] text-white">
        <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 lg:px-10">
          <Link href="/support" className="text-sm font-black text-blue-200 hover:text-white">← Support centre</Link>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-blue-200">Participant case</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">{caseReference.toUpperCase()}</h1>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
        {!access || accessError || !caseData ? (
          <div className="mx-auto max-w-2xl rounded-[2rem] border border-[var(--border)] bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-black text-[var(--brand-strong)]">Case access required</h2>
            <p className="mt-4 leading-7 text-[var(--muted)]">
              {accessError || "This page requires a valid 30-minute access link."}
            </p>
            <Link href="/support" className="mt-6 inline-flex rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">
              Renew case access
            </Link>
          </div>
        ) : (
          <div className="space-y-7">
            {query.created ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">
                Your case was submitted successfully. Save the reference {caseData.case_reference}.
              </div>
            ) : null}
            {query.success ? <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">{query.success}</div> : null}
            {query.error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">{query.error}</div> : null}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["Status", label(caseData.status)],
                ["Category", label(caseData.category)],
                ["Priority", label(caseData.priority)],
                ["Last activity", formatDate(caseData.last_activity_at)],
              ].map(([title, value]) => (
                <article key={title} className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">{title}</p>
                  <p className="mt-3 text-lg font-black capitalize text-[var(--brand-strong)]">{value}</p>
                </article>
              ))}
            </section>

            <section className="grid gap-7 xl:grid-cols-[1.15fr_0.85fr]">
              <article className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand)]">Case details</p>
                    <h2 className="mt-3 text-2xl font-black text-[var(--brand-strong)]">{caseData.subject}</h2>
                  </div>
                  <span className={`w-fit rounded-full border px-3 py-2 text-xs font-black capitalize ${statusClass(caseData.status)}`}>
                    {label(caseData.status)}
                  </span>
                </div>
                <p className="mt-5 text-sm text-[var(--muted)]">Opened {formatDate(caseData.created_at)}</p>
                {caseData.resolution_summary ? (
                  <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-900">
                    <p className="text-xs font-black uppercase tracking-[0.14em]">Decision: {label(caseData.decision ?? "recorded")}</p>
                    <p className="mt-3 leading-7">{caseData.resolution_summary}</p>
                  </div>
                ) : null}

                <div className="mt-8 space-y-4">
                  <h3 className="text-lg font-black text-[var(--brand-strong)]">Communication history</h3>
                  {caseData.messages.length ? caseData.messages.map((message) => (
                    <div key={message.id} className={`rounded-2xl p-5 ${message.author_type === "participant" ? "bg-[var(--surface-soft)]" : "border border-blue-100 bg-blue-50"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--brand)]">
                          {message.author_type === "participant" ? "You" : message.author_type === "admin" ? "Vult Fantasy team" : "System"}
                        </p>
                        <p className="text-xs text-[var(--muted)]">{formatDate(message.created_at)}</p>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--brand-strong)]">{message.message}</p>
                    </div>
                  )) : <p className="text-sm text-[var(--muted)]">No participant-visible messages yet.</p>}
                </div>
              </article>

              <div className="space-y-7">
                <article className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-black text-[var(--brand-strong)]">Evidence references</h2>
                  <div className="mt-5 space-y-3">
                    {caseData.evidence.length ? caseData.evidence.map((item) => {
                      const url = safeUrl(item.external_url);
                      return (
                        <div key={item.id} className="rounded-2xl bg-[var(--surface-soft)] p-4 text-sm">
                          <p className="font-black capitalize text-[var(--brand-strong)]">{label(item.evidence_type)}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">{formatDate(item.created_at)}</p>
                          {item.notes ? <p className="mt-2 leading-6 text-[var(--muted)]">{item.notes}</p> : null}
                          {url ? <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex font-black text-[var(--brand)] hover:underline">Open evidence</a> : null}
                        </div>
                      );
                    }) : <p className="text-sm text-[var(--muted)]">No evidence references are visible.</p>}
                  </div>
                </article>

                {!['resolved', 'rejected', 'closed'].includes(caseData.status) ? (
                  <form action={replyToDisputeAction} className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm">
                    <h2 className="text-lg font-black text-[var(--brand-strong)]">Add a reply</h2>
                    <input type="hidden" name="case_reference" value={caseData.case_reference} />
                    <input type="hidden" name="access_token" value={access} />
                    <label className="mt-5 block text-sm font-bold text-[var(--brand-strong)]">
                      Message
                      <textarea name="message" rows={5} minLength={2} className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm" required />
                    </label>
                    <label className="mt-4 block text-sm font-bold text-[var(--brand-strong)]">
                      Additional evidence URL
                      <input name="evidence_url" type="url" className="mt-2 w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm" placeholder="https://..." />
                    </label>
                    <button className="mt-5 rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">Send reply</button>
                  </form>
                ) : (
                  <article className="rounded-[2rem] bg-[var(--brand)] p-6 text-white">
                    <h2 className="text-lg font-black">This case is closed to new replies.</h2>
                    <p className="mt-3 text-sm leading-7 text-blue-100">A new case may be submitted from the support centre when a separate issue needs review.</p>
                  </article>
                )}
              </div>
            </section>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
