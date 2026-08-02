create index if not exists leaderboard_publications_round_scope_idx
  on public.leaderboard_publications(competition_season_id, round_id, status, published_at desc)
  where scope = 'round';

create index if not exists leaderboard_publications_monthly_scope_idx
  on public.leaderboard_publications(competition_season_id, monthly_period_id, status, published_at desc)
  where scope = 'monthly';

create index if not exists leaderboard_publications_overall_scope_idx
  on public.leaderboard_publications(competition_season_id, status, published_at desc)
  where scope = 'overall';
