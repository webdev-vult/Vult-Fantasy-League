revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create index if not exists audit_logs_actor_user_id_idx
  on public.audit_logs (actor_user_id);

create index if not exists competition_seasons_season_id_idx
  on public.competition_seasons (season_id);

create index if not exists prize_payments_approved_by_idx
  on public.prize_payments (approved_by);

create index if not exists prize_payments_paid_by_idx
  on public.prize_payments (paid_by);

create index if not exists prize_payments_participant_id_idx
  on public.prize_payments (participant_id);

create index if not exists prize_payments_prize_id_idx
  on public.prize_payments (prize_id);

create index if not exists registrations_approved_by_idx
  on public.registrations (approved_by);

create index if not exists registrations_competition_season_id_idx
  on public.registrations (competition_season_id);

create index if not exists round_scores_source_snapshot_id_idx
  on public.round_scores (source_snapshot_id);

create index if not exists winner_candidates_competition_season_id_idx
  on public.winner_candidates (competition_season_id);

create index if not exists winner_candidates_monthly_period_id_idx
  on public.winner_candidates (monthly_period_id);

create index if not exists winner_candidates_prize_id_idx
  on public.winner_candidates (prize_id);

create index if not exists winner_candidates_registration_id_idx
  on public.winner_candidates (registration_id);

create index if not exists winner_candidates_reviewed_by_idx
  on public.winner_candidates (reviewed_by);

create index if not exists winner_candidates_round_id_idx
  on public.winner_candidates (round_id);
