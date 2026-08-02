import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  changeAnnouncementStatusAction,
  queueNotificationAction,
  recordNotificationDeliveryAction,
  saveAnnouncementAction,
  saveNotificationTemplateAction,
} from "./actions";

type SearchParams = Promise<{ tab?: string; edit?: string; success?: string; error?: string }>;
type Announcement = {
  id: string;
  competition_season_id: string | null;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  category: string;
  audience: string;
  status: string;
  is_pinned: boolean;
  publish_at: string | null;
  expires_at: string | null;
  published_at: string | null;
  created_at: string;
};
type Template = {
  id: string;
  event_key: string;
  name: string;
  description: string | null;
  subject_template: string | null;
  body_template: string;
  default_channels: string[];
  status: string;
};
type Notification = {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  provider_message_id: string | null;
  failure_reason: string | null;
  dispute_id: string | null;
  registration_id: string | null;
  created_at: string;
};
type Season = { id: string; name: string; status: string };

const inputClass = "mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm";
const contentRoles = ["super_admin", "content_manager"];
const deliveryRoles = ["super_admin", "content_manager", "support_officer"];

function label(value: string) {
  return value.replaceAll("_", " ");
}

function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (["published", "sent", "active"].includes(status)) return "border-green-200 bg-green-50 text-green-800";
  if (["failed", "archived", "inactive", "cancelled"].includes(status)) return "border-red-200 bg-red-50 text-red-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default async function CommunicationsPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const tab = ["announcements", "templates", "outbox"].includes(query.tab ?? "") ? query.tab! : "announcements";
  const supabase = await createServerSupabaseClient();
  const db = supabase as any;

  const [seasonsResult, announcementsResult, templatesResult, notificationsResult] = await Promise.all([
    db.from("competition_seasons").select("id, name, status").order("created_at", { ascending: false }),
    db.from("announcements").select("id, competition_season_id, slug, title, summary, body, category, audience, status, is_pinned, publish_at, expires_at, published_at, created_at").order("created_at", { ascending: false }),
    db.from("notification_templates").select("id, event_key, name, description, subject_template, body_template, default_channels, status").order("event_key"),
    db.from("notification_outbox").select("id, channel, recipient, subject, body, status, scheduled_at, sent_at, provider_message_id, failure_reason, dispute_id, registration_id, created_at").order("created_at", { ascending: false }).limit(60),
  ]);

  const seasons = (seasonsResult.data ?? []) as Season[];
  const announcements = (announcementsResult.data ?? []) as Announcement[];
  const templates = (templatesResult.data ?? []) as Template[];
  const notifications = (notificationsResult.data ?? []) as Notification[];
  const editingAnnouncement = announcements.find((item) => item.id === query.edit) ?? null;
  const editingTemplate = templates.find((item) => item.id === query.edit) ?? null;
  const canContent = contentRoles.includes(admin.role);
  const canDelivery = deliveryRoles.includes(admin.role);

  const metrics = [
    ["Published", announcements.filter((item) => item.status === "published").length],
    ["Draft or scheduled", announcements.filter((item) => ["draft", "scheduled"].includes(item.status)).length],
    ["Pending delivery", notifications.filter((item) => ["queued", "manual_pending"].includes(item.status)).length],
    ["Failed delivery", notifications.filter((item) => item.status === "failed").length],
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--brand)]">Phase 11</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-[var(--brand-strong)]">Communications</h1>
          <p className="mt-3 max-w-3xl leading-7 text-[var(--muted)]">
            Publish official announcements, maintain message templates, queue participant communications and record actual email or WhatsApp delivery.
          </p>
        </div>
        <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-800">
          Email and WhatsApp are manual until a provider is approved
        </span>
      </div>

      {query.success ? <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-bold text-green-800">{query.success}</div> : null}
      {query.error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-800">{query.error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([name, value]) => (
          <article key={String(name)} className="rounded-3xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">{name}</p>
            <p className="mt-3 text-3xl font-black text-[var(--brand-strong)]">{value}</p>
          </article>
        ))}
      </section>

      <nav className="flex flex-wrap gap-2 rounded-2xl border border-[var(--border)] bg-white p-2 shadow-sm">
        {[
          ["announcements", "Announcements"],
          ["templates", "Templates"],
          ["outbox", "Delivery queue"],
        ].map(([value, title]) => (
          <Link key={value} href={`/admin/communications?tab=${value}`} className={`rounded-xl px-4 py-3 text-sm font-black ${tab === value ? "bg-[var(--brand)] text-white" : "text-[var(--muted)] hover:bg-[var(--surface-soft)]"}`}>
            {title}
          </Link>
        ))}
      </nav>

      {tab === "announcements" ? (
        <section className="grid gap-7 xl:grid-cols-[0.9fr_1.1fr]">
          <form action={saveAnnouncementAction} className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">{editingAnnouncement ? "Edit announcement" : "New announcement"}</p>
            <h2 className="mt-3 text-2xl font-black text-[var(--brand-strong)]">Official publication</h2>
            {!canContent ? <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-800">Your role has read-only access.</p> : null}
            <input type="hidden" name="announcement_id" value={editingAnnouncement?.id ?? ""} />
            <label className="mt-6 block text-sm font-bold">Competition season
              <select name="competition_season_id" className={inputClass} defaultValue={editingAnnouncement?.competition_season_id ?? ""} disabled={!canContent}>
                <option value="">All seasons / platform-wide</option>
                {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
              </select>
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">Slug
                <input name="slug" className={inputClass} defaultValue={editingAnnouncement?.slug ?? ""} placeholder="registration-opens" required disabled={!canContent} />
              </label>
              <label className="text-sm font-bold">Category
                <select name="category" className={inputClass} defaultValue={editingAnnouncement?.category ?? "general"} disabled={!canContent}>
                  {['general','registration','gameweek','leaderboard','winner','payment','rules','maintenance'].map((item) => <option key={item} value={item}>{label(item)}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-4 block text-sm font-bold">Title
              <input name="title" className={inputClass} defaultValue={editingAnnouncement?.title ?? ""} minLength={5} maxLength={180} required disabled={!canContent} />
            </label>
            <label className="mt-4 block text-sm font-bold">Summary
              <textarea name="summary" className={inputClass} rows={3} defaultValue={editingAnnouncement?.summary ?? ""} disabled={!canContent} />
            </label>
            <label className="mt-4 block text-sm font-bold">Body
              <textarea name="body" className={inputClass} rows={8} defaultValue={editingAnnouncement?.body ?? ""} minLength={20} required disabled={!canContent} />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">Audience
                <select name="audience" className={inputClass} defaultValue={editingAnnouncement?.audience ?? "public"} disabled={!canContent}>
                  <option value="public">Public</option><option value="participants">Participants</option><option value="admins">Admins</option><option value="all">All</option>
                </select>
              </label>
              <label className="text-sm font-bold">Publish time
                <input type="datetime-local" name="publish_at" className={inputClass} defaultValue={localDateTime(editingAnnouncement?.publish_at ?? null)} disabled={!canContent} />
              </label>
              <label className="text-sm font-bold">Expiry time
                <input type="datetime-local" name="expires_at" className={inputClass} defaultValue={localDateTime(editingAnnouncement?.expires_at ?? null)} disabled={!canContent} />
              </label>
              <label className="mt-7 flex items-center gap-3 text-sm font-bold">
                <input type="checkbox" name="is_pinned" defaultChecked={editingAnnouncement?.is_pinned ?? false} disabled={!canContent} /> Pin announcement
              </label>
            </div>
            {canContent ? <button className="mt-6 rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">Save announcement</button> : null}
          </form>

          <div className="space-y-4">
            {announcements.length ? announcements.map((item) => (
              <article key={item.id} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-3 py-1.5 text-xs font-black capitalize ${statusClass(item.status)}`}>{label(item.status)}</span>
                      <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-black capitalize text-[var(--brand)]">{label(item.category)}</span>
                      {item.is_pinned ? <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800">Pinned</span> : null}
                    </div>
                    <h3 className="mt-4 text-xl font-black text-[var(--brand-strong)]">{item.title}</h3>
                    <p className="mt-2 text-sm text-[var(--muted)]">/{item.slug} · {label(item.audience)} · {formatDate(item.publish_at ?? item.published_at ?? item.created_at)}</p>
                  </div>
                  <Link href={`/admin/communications?tab=announcements&edit=${item.id}`} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-black text-[var(--brand)]">Edit</Link>
                </div>
                {canContent && item.status !== "archived" ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {item.status !== "published" ? <form action={changeAnnouncementStatusAction}><input type="hidden" name="announcement_id" value={item.id} /><button name="action" value="publish" className="rounded-xl bg-green-700 px-4 py-2 text-xs font-black text-white">Publish now</button></form> : null}
                    {item.status === "published" ? <form action={changeAnnouncementStatusAction}><input type="hidden" name="announcement_id" value={item.id} /><button name="action" value="unpublish" className="rounded-xl border border-amber-300 px-4 py-2 text-xs font-black text-amber-800">Return to draft</button></form> : null}
                    <form action={changeAnnouncementStatusAction} className="flex gap-2"><input type="hidden" name="announcement_id" value={item.id} /><input type="datetime-local" name="publish_at" className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs" /><button name="action" value="schedule" className="rounded-xl border border-[var(--brand)] px-4 py-2 text-xs font-black text-[var(--brand)]">Schedule</button></form>
                    <form action={changeAnnouncementStatusAction}><input type="hidden" name="announcement_id" value={item.id} /><button name="action" value="archive" className="rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-700">Archive</button></form>
                  </div>
                ) : null}
              </article>
            )) : <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-[var(--muted)]">No announcements yet.</div>}
          </div>
        </section>
      ) : null}

      {tab === "templates" ? (
        <section className="grid gap-7 xl:grid-cols-[0.9fr_1.1fr]">
          <form action={saveNotificationTemplateAction} className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">{editingTemplate ? "Edit template" : "New template"}</p>
            <h2 className="mt-3 text-2xl font-black text-[var(--brand-strong)]">Notification template</h2>
            {!canContent ? <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-800">Your role has read-only access.</p> : null}
            <input type="hidden" name="template_id" value={editingTemplate?.id ?? ""} />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">Event key<input name="event_key" className={inputClass} defaultValue={editingTemplate?.event_key ?? ""} placeholder="event_name" required disabled={!canContent} /></label>
              <label className="text-sm font-bold">Status<select name="status" className={inputClass} defaultValue={editingTemplate?.status ?? "active"} disabled={!canContent}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            </div>
            <label className="mt-4 block text-sm font-bold">Name<input name="name" className={inputClass} defaultValue={editingTemplate?.name ?? ""} required disabled={!canContent} /></label>
            <label className="mt-4 block text-sm font-bold">Description<textarea name="description" className={inputClass} rows={2} defaultValue={editingTemplate?.description ?? ""} disabled={!canContent} /></label>
            <label className="mt-4 block text-sm font-bold">Subject template<input name="subject_template" className={inputClass} defaultValue={editingTemplate?.subject_template ?? ""} disabled={!canContent} /></label>
            <label className="mt-4 block text-sm font-bold">Body template<textarea name="body_template" className={inputClass} rows={6} defaultValue={editingTemplate?.body_template ?? ""} required disabled={!canContent} /></label>
            <fieldset className="mt-5"><legend className="text-sm font-bold">Default channels</legend><div className="mt-3 flex flex-wrap gap-4">{['email','whatsapp','in_app','manual'].map((channel) => <label key={channel} className="flex items-center gap-2 text-sm font-bold capitalize"><input type="checkbox" name="channels" value={channel} defaultChecked={editingTemplate?.default_channels.includes(channel) ?? channel === 'in_app'} disabled={!canContent} />{label(channel)}</label>)}</div></fieldset>
            {canContent ? <button className="mt-6 rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">Save template</button> : null}
          </form>
          <div className="space-y-4">{templates.map((item) => <article key={item.id} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><span className={`rounded-full border px-3 py-1.5 text-xs font-black capitalize ${statusClass(item.status)}`}>{item.status}</span><h3 className="mt-4 text-xl font-black text-[var(--brand-strong)]">{item.name}</h3><p className="mt-1 font-mono text-xs text-[var(--muted)]">{item.event_key}</p><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{item.description ?? "No description"}</p><p className="mt-3 text-xs font-bold text-[var(--brand)]">{item.default_channels.map(label).join(", ")}</p></div><Link href={`/admin/communications?tab=templates&edit=${item.id}`} className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-black text-[var(--brand)]">Edit</Link></div></article>)}</div>
        </section>
      ) : null}

      {tab === "outbox" ? (
        <section className="grid gap-7 xl:grid-cols-[0.8fr_1.2fr]">
          <form action={queueNotificationAction} className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--brand)]">Manual composition</p>
            <h2 className="mt-3 text-2xl font-black text-[var(--brand-strong)]">Queue notification</h2>
            {!canDelivery ? <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-800">Your role has read-only access.</p> : null}
            <label className="mt-6 block text-sm font-bold">Season<select name="competition_season_id" className={inputClass} disabled={!canDelivery}><option value="">Not linked to a season</option>{seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Channel<select name="channel" className={inputClass} defaultValue="email" disabled={!canDelivery}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="in_app">In platform</option><option value="manual">Manual</option></select></label><label className="text-sm font-bold">Recipient<input name="recipient" className={inputClass} required disabled={!canDelivery} /></label></div>
            <label className="mt-4 block text-sm font-bold">Registration UUID<input name="registration_id" className={inputClass} placeholder="Optional internal registration ID" disabled={!canDelivery} /></label>
            <label className="mt-4 block text-sm font-bold">Dispute UUID<input name="dispute_id" className={inputClass} placeholder="Optional internal case ID" disabled={!canDelivery} /></label>
            <label className="mt-4 block text-sm font-bold">Subject<input name="subject" className={inputClass} disabled={!canDelivery} /></label>
            <label className="mt-4 block text-sm font-bold">Message<textarea name="body" className={inputClass} rows={6} minLength={2} required disabled={!canDelivery} /></label>
            <label className="mt-4 block text-sm font-bold">Schedule time<input type="datetime-local" name="scheduled_at" className={inputClass} disabled={!canDelivery} /></label>
            {canDelivery ? <button className="mt-6 rounded-xl bg-[var(--brand)] px-5 py-3 text-sm font-black text-white">Add to queue</button> : null}
          </form>

          <div className="space-y-4">
            {notifications.length ? notifications.map((item) => (
              <article key={item.id} className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1.5 text-xs font-black capitalize ${statusClass(item.status)}`}>{label(item.status)}</span><span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-black capitalize text-[var(--brand)]">{label(item.channel)}</span></div><h3 className="mt-4 font-black text-[var(--brand-strong)]">{item.subject ?? "No subject"}</h3><p className="mt-1 break-all text-xs text-[var(--muted)]">{item.recipient}</p></div><p className="text-xs text-[var(--muted)]">{formatDate(item.scheduled_at)}</p>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{item.body}</p>
                {item.failure_reason ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{item.failure_reason}</p> : null}
                {canDelivery && !['sent','cancelled','skipped'].includes(item.status) ? (
                  <form action={recordNotificationDeliveryAction} className="mt-5 grid gap-3 rounded-2xl bg-[var(--surface-soft)] p-4 sm:grid-cols-2">
                    <input type="hidden" name="notification_id" value={item.id} />
                    <label className="text-xs font-bold">Delivery method<select name="delivery_method" className={inputClass} defaultValue="manual"><option value="manual">Manual</option><option value="provider">Provider</option><option value="in_app">In platform</option></select></label>
                    <label className="text-xs font-bold">Provider or delivery reference<input name="provider_message_id" className={inputClass} /></label>
                    <label className="text-xs font-bold sm:col-span-2">Failure reason<input name="failure_reason" className={inputClass} /></label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2"><button name="outcome" value="sent" className="rounded-xl bg-green-700 px-4 py-2 text-xs font-black text-white">Record sent</button><button name="outcome" value="failed" className="rounded-xl bg-red-700 px-4 py-2 text-xs font-black text-white">Record failed</button><button name="outcome" value="cancelled" className="rounded-xl border border-red-200 px-4 py-2 text-xs font-black text-red-700">Cancel</button><button name="outcome" value="skipped" className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-black text-[var(--muted)]">Skip</button></div>
                  </form>
                ) : null}
              </article>
            )) : <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-[var(--muted)]">No notification records yet.</div>}
          </div>
        </section>
      ) : null}
    </div>
  );
}
