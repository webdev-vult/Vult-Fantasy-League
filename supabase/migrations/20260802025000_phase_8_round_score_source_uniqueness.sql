create unique index if not exists round_scores_source_provider_record_unique
  on public.round_scores(source_provider_record_id)
  where source_provider_record_id is not null;
