import { createAdminSupabaseClient } from "@/lib/supabase/server";

export type PublicAnnouncement = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  category: string;
  is_pinned: boolean;
  publish_at: string | null;
  published_at: string | null;
  created_at: string;
};

function isPubliclyVisible(row: any, now: number) {
  if (!["public", "all"].includes(row.audience)) return false;
  if (!["published", "scheduled"].includes(row.status)) return false;
  const publishTime = row.publish_at ? new Date(row.publish_at).getTime() : row.published_at ? new Date(row.published_at).getTime() : 0;
  if (row.status === "scheduled" && (!publishTime || publishTime > now)) return false;
  if (publishTime && publishTime > now) return false;
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return false;
  return true;
}

export async function getPublicAnnouncements(): Promise<PublicAnnouncement[]> {
  const db = createAdminSupabaseClient() as any;
  const { data } = await db
    .from("announcements")
    .select("id, slug, title, summary, body, category, audience, status, is_pinned, publish_at, published_at, expires_at, created_at")
    .in("status", ["published", "scheduled"])
    .in("audience", ["public", "all"])
    .order("is_pinned", { ascending: false })
    .order("publish_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const now = Date.now();
  return ((data ?? []) as any[]).filter((row) => isPubliclyVisible(row, now));
}

export async function getPublicAnnouncement(slug: string): Promise<PublicAnnouncement | null> {
  const db = createAdminSupabaseClient() as any;
  const { data } = await db
    .from("announcements")
    .select("id, slug, title, summary, body, category, audience, status, is_pinned, publish_at, published_at, expires_at, created_at")
    .eq("slug", slug)
    .maybeSingle();

  return data && isPubliclyVisible(data, Date.now()) ? (data as PublicAnnouncement) : null;
}
