create index if not exists score_corrections_round_id_idx
  on public.score_corrections(round_id);

create index if not exists score_promotion_runs_round_id_idx
  on public.score_promotion_runs(round_id);

drop policy if exists leaderboard_publications_admin_read
  on public.leaderboard_publications;
drop policy if exists leaderboard_publications_public_read
  on public.leaderboard_publications;

create policy leaderboard_publications_anon_read
on public.leaderboard_publications for select
to anon
using (status = 'published');

create policy leaderboard_publications_authenticated_read
on public.leaderboard_publications for select
to authenticated
using (status = 'published' or private.is_active_admin());

drop policy if exists public_leaderboard_rows_admin_read
  on public.public_leaderboard_rows;
drop policy if exists public_leaderboard_rows_public_read
  on public.public_leaderboard_rows;

create policy public_leaderboard_rows_anon_read
on public.public_leaderboard_rows for select
to anon
using (
  exists (
    select 1
    from public.leaderboard_publications lp
    where lp.id = publication_id
      and lp.status = 'published'
  )
);

create policy public_leaderboard_rows_authenticated_read
on public.public_leaderboard_rows for select
to authenticated
using (
  private.is_active_admin()
  or exists (
    select 1
    from public.leaderboard_publications lp
    where lp.id = publication_id
      and lp.status = 'published'
  )
);
