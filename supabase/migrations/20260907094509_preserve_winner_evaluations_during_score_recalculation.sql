-- Winner evaluations retain a complete immutable copy of the score, rank,
-- eligibility checks and tie-break evidence. Score aggregates are mutable and
-- may be removed when a participant no longer belongs in a recalculated table,
-- so their optional source pointers must not block that cleanup.

alter table public.winner_generation_evaluations
  drop constraint if exists winner_generation_evaluations_source_round_score_id_fkey,
  add constraint winner_generation_evaluations_source_round_score_id_fkey
    foreign key (source_round_score_id)
    references public.round_scores(id)
    on delete set null;

alter table public.winner_generation_evaluations
  drop constraint if exists winner_generation_evaluations_source_monthly_score_id_fkey,
  add constraint winner_generation_evaluations_source_monthly_score_id_fkey
    foreign key (source_monthly_score_id)
    references public.monthly_scores(id)
    on delete set null;

alter table public.winner_generation_evaluations
  drop constraint if exists winner_generation_evaluations_source_season_score_id_fkey,
  add constraint winner_generation_evaluations_source_season_score_id_fkey
    foreign key (source_season_score_id)
    references public.season_scores(id)
    on delete set null;

comment on column public.winner_generation_evaluations.source_round_score_id is
  'Optional pointer to the mutable round score used for generation. The evaluation row retains the immutable evidence snapshot if the score is later removed.';

comment on column public.winner_generation_evaluations.source_monthly_score_id is
  'Optional pointer to the mutable monthly score used for generation. The evaluation row retains the immutable evidence snapshot if the score is later removed.';

comment on column public.winner_generation_evaluations.source_season_score_id is
  'Optional pointer to the mutable season score used for generation. The evaluation row retains the immutable evidence snapshot if the score is later removed.';
