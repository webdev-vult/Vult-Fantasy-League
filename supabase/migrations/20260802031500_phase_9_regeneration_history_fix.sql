alter function public.generate_winner_candidate(uuid, uuid, text, uuid, uuid, uuid)
  rename to generate_winner_candidate_internal;

revoke all on function public.generate_winner_candidate_internal(uuid, uuid, text, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.generate_winner_candidate_internal(uuid, uuid, text, uuid, uuid, uuid)
  to service_role;

create or replace function public.generate_winner_candidate(
  p_competition_season_id uuid,
  p_prize_id uuid,
  p_scope text,
  p_round_id uuid,
  p_monthly_period_id uuid,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_statuses jsonb := '{}'::jsonb;
  v_started_at timestamptz := clock_timestamp();
  v_run_id uuid;
begin
  select coalesce(jsonb_object_agg(wc.id::text, wc.status), '{}'::jsonb)
  into v_previous_statuses
  from public.winner_candidates wc
  where wc.prize_id = p_prize_id
    and wc.is_current = true
    and wc.scope = p_scope
    and wc.round_id is not distinct from p_round_id
    and wc.monthly_period_id is not distinct from p_monthly_period_id
    and wc.status not in ('confirmed', 'payment_pending', 'paid', 'published');

  v_run_id := public.generate_winner_candidate_internal(
    p_competition_season_id,
    p_prize_id,
    p_scope,
    p_round_id,
    p_monthly_period_id,
    p_requested_by
  );

  update public.winner_candidate_status_history h
  set from_status = v_previous_statuses ->> h.candidate_id::text
  where h.action = 'regenerated'
    and h.created_at >= v_started_at
    and v_previous_statuses ? h.candidate_id::text;

  return v_run_id;
end;
$$;

revoke all on function public.generate_winner_candidate(uuid, uuid, text, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.generate_winner_candidate(uuid, uuid, text, uuid, uuid, uuid)
  to service_role;

comment on function public.generate_winner_candidate(uuid, uuid, text, uuid, uuid, uuid) is
  'Service-role winner generation wrapper that preserves the true previous status when candidates are superseded by regeneration.';
