create index if not exists participant_consents_publicity_lookup_idx
  on public.participant_consents(registration_id, consent_type, accepted);

create index if not exists round_scores_round_registration_status_idx
  on public.round_scores(round_id, registration_id, score_status, is_provisional);
