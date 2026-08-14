import { createAdminSupabaseClient } from "@/lib/supabase/server";

export type PublicLeaderboardPreview = {
  title: string;
  isProvisional: boolean;
  publishedAt: string;
  rows: Array<{
    id: number;
    rank: number;
    displayName: string;
    teamName: string | null;
    points: number;
    movement: number;
  }>;
};

export async function getPublicLeaderboardPreview(
  competitionSeasonId: string | null,
): Promise<PublicLeaderboardPreview | null> {
  if (!competitionSeasonId) return null;

  try {
    const db = createAdminSupabaseClient();
    const { data: publication, error: publicationError } = await db
      .from("leaderboard_publications")
      .select("id, title, is_provisional, published_at")
      .eq("competition_season_id", competitionSeasonId)
      .eq("scope", "overall")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (publicationError || !publication) return null;

    const { data: rows, error: rowsError } = await db
      .from("public_leaderboard_rows")
      .select("id, rank, display_name, team_name, points, movement")
      .eq("publication_id", publication.id)
      .order("rank", { ascending: true })
      .limit(5);

    if (rowsError) return null;

    return {
      title: publication.title,
      isProvisional: publication.is_provisional,
      publishedAt: publication.published_at,
      rows: (rows ?? []).map((row) => ({
        id: row.id,
        rank: row.rank,
        displayName: row.display_name,
        teamName: row.team_name,
        points: row.points,
        movement: row.movement,
      })),
    };
  } catch (error) {
    console.error("Unable to load the public leaderboard preview", error);
    return null;
  }
}
