import Link from "next/link";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { getPublicCompetition } from "@/lib/public/competition";
import { getPublicAnnouncements } from "@/lib/public/announcements";

function formatDate(value: string | null) {
  if (!value) return "Publication date not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function AnnouncementsPage() {
  const [competition, announcements] = await Promise.all([
    getPublicCompetition(),
    getPublicAnnouncements(),
  ]);

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen} />
      <section className="bg-[var(--brand-strong)] text-white">
        <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 lg:px-10 lg:py-18">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-200">Official updates</p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.045em] sm:text-5xl">Announcements</h1>
          <p className="mt-5 max-w-3xl leading-8 text-blue-100">
            Registration notices, Gameweek updates, rules changes, winner announcements, payment notices and maintenance information published by the Vult Fantasy team.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
        {announcements.length ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {announcements.map((announcement) => (
              <article key={announcement.id} className="rounded-[2rem] border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--surface-soft)] px-3 py-2 text-xs font-black capitalize text-[var(--brand)]">
                    {label(announcement.category)}
                  </span>
                  {announcement.is_pinned ? (
                    <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-black text-amber-800">Pinned</span>
                  ) : null}
                </div>
                <h2 className="mt-5 text-2xl font-black tracking-[-0.03em] text-[var(--brand-strong)]">
                  {announcement.title}
                </h2>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  {formatDate(announcement.publish_at ?? announcement.published_at ?? announcement.created_at)}
                </p>
                <p className="mt-5 line-clamp-4 leading-7 text-[var(--muted)]">
                  {announcement.summary ?? announcement.body}
                </p>
                <Link href={`/announcements/${announcement.slug}`} className="mt-6 inline-flex rounded-xl border border-[var(--brand)] px-4 py-2.5 text-sm font-black text-[var(--brand)]">
                  Read announcement
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-[var(--border)] bg-white p-10 text-center">
            <h2 className="text-2xl font-black text-[var(--brand-strong)]">No announcements have been published.</h2>
            <p className="mt-3 text-[var(--muted)]">Official updates will appear here after publication.</p>
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
