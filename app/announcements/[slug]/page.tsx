import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import { getPublicAnnouncement } from "@/lib/public/announcements";
import { getPublicCompetition } from "@/lib/public/competition";

type Params = Promise<{ slug: string }>;

function formatDate(value: string | null) {
  if (!value) return "Publication date not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Freetown",
  }).format(new Date(value));
}

export default async function AnnouncementDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [competition, announcement] = await Promise.all([
    getPublicCompetition(),
    getPublicAnnouncement(slug),
  ]);

  if (!announcement) notFound();

  return (
    <main className="min-h-screen bg-[#f4f6fb]">
      <SiteHeader registrationOpen={competition.registrationOpen} />
      <section className="bg-[var(--brand-strong)] text-white">
        <div className="mx-auto w-full max-w-4xl px-5 py-14 sm:px-8 lg:px-10 lg:py-18">
          <Link href="/announcements" className="text-sm font-black text-blue-200 hover:text-white">← All announcements</Link>
          <div className="mt-7 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-3 py-2 text-xs font-black capitalize text-blue-100">
              {announcement.category.replaceAll("_", " ")}
            </span>
            {announcement.is_pinned ? <span className="rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-black text-[var(--brand-strong)]">Pinned</span> : null}
          </div>
          <h1 className="mt-5 text-4xl font-black tracking-[-0.045em] sm:text-5xl">{announcement.title}</h1>
          <p className="mt-5 text-sm font-bold text-blue-200">
            {formatDate(announcement.publish_at ?? announcement.published_at ?? announcement.created_at)}
          </p>
        </div>
      </section>

      <article className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
        {announcement.summary ? (
          <p className="rounded-3xl border border-blue-100 bg-blue-50 p-6 text-lg font-bold leading-8 text-[var(--brand-strong)]">
            {announcement.summary}
          </p>
        ) : null}
        <div className="mt-8 rounded-[2rem] border border-[var(--border)] bg-white p-7 shadow-sm sm:p-10">
          <div className="space-y-5 text-base leading-8 text-[var(--brand-strong)]">
            {announcement.body.split(/\n{2,}/).map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 24)}`} className="whitespace-pre-wrap">{paragraph}</p>
            ))}
          </div>
        </div>
      </article>
      <SiteFooter />
    </main>
  );
}
