-- A registration that resolves immediately against the configured FPL league
-- was already a league member and remains eligible from the first round.
-- Only the explicit awaiting-FPL-sync path receives the next-open-round cutoff.
create or replace function private.assign_registration_eligibility_round()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.eligible_from_round is null then
    if coalesce(new.metadata ->> 'fpl_resolution_state', '') = 'awaiting_fpl_sync' then
      select coalesce(
        min(r.external_round_id) filter (
          where r.deadline_at > coalesce(new.registered_at, now())
        ),
        max(r.external_round_id) + 1,
        1
      )
      into new.eligible_from_round
      from public.rounds r
      where r.competition_season_id = new.competition_season_id
        and r.status <> 'cancelled';
    else
      new.eligible_from_round := 1;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.assign_registration_eligibility_round() from public;

-- Repair registrations that were verified immediately but inherited the
-- deadline-based cutoff. Immutable audit history distinguishes them from
-- genuine delayed/new FPL entries.
update public.registrations reg
set eligible_from_round = 1,
    updated_at = now()
where reg.eligible_from_round > 1
  and not exists (
    select 1
    from public.audit_logs audit
    where audit.entity_type = 'registration'
      and audit.entity_id = reg.id::text
      and audit.action = 'public_registration_awaiting_fpl_sync'
  );

-- Harden publication so excluded rounds and unranked internal rows can never
-- leak into a public snapshot with the old 999999 fallback rank.
do $patch_publish_leaderboard$
declare
  v_oid oid;
  v_definition text;
  v_matches integer;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'publish_leaderboard'
    and pg_get_function_identity_arguments(p.oid) =
      'p_competition_season_id uuid, p_scope text, p_round_id uuid, p_monthly_period_id uuid, p_title text, p_notes text, p_requested_by uuid';

  if v_oid is null then
    raise exception 'public.publish_leaderboard was not found';
  end if;

  v_definition := pg_get_functiondef(v_oid);

  v_matches := (length(v_definition) - length(replace(
    v_definition,
    'coalesce(rs.round_rank, 999999)::integer',
    ''
  ))) / length('coalesce(rs.round_rank, 999999)::integer');
  if v_matches > 1 then
    raise exception 'Unexpected round-rank publication expression (% matches)', v_matches;
  end if;
  v_definition := replace(
    v_definition,
    'coalesce(rs.round_rank, 999999)::integer',
    'rs.round_rank::integer'
  );

  if position('join public.rounds leaderboard_round' in v_definition) = 0 then
    v_definition := regexp_replace(
      v_definition,
      'from public\.round_scores rs[[:space:]]+join public\.registrations reg on reg\.id = rs\.registration_id',
      E'from public.round_scores rs\n    join public.rounds leaderboard_round on leaderboard_round.id = rs.round_id\n    join public.registrations reg on reg.id = rs.registration_id'
    );
  end if;
  if position('leaderboard_round.external_round_id >= coalesce(reg.eligible_from_round, 1)' in v_definition) = 0 then
    v_definition := regexp_replace(
      v_definition,
      'where rs\.round_id = p_round_id[[:space:]]+and reg\.status = ''approved''[[:space:]]+and reg\.eligibility_status = ''eligible''',
      E'where rs.round_id = p_round_id\n      and reg.status = ''approved''\n      and reg.eligibility_status = ''eligible''\n      and leaderboard_round.external_round_id >= coalesce(reg.eligible_from_round, 1)\n      and rs.round_rank is not null'
    );
  end if;

  v_definition := replace(v_definition, 'coalesce(ms.rank, 999999)', 'ms.rank');
  v_definition := replace(v_definition, 'coalesce(ss.rank, 999999)', 'ss.rank');
  v_definition := replace(
    v_definition,
    'where ms.monthly_period_id = p_monthly_period_id\n      and reg.status = ''approved''\n      and reg.eligibility_status = ''eligible''',
    'where ms.monthly_period_id = p_monthly_period_id\n      and reg.status = ''approved''\n      and reg.eligibility_status = ''eligible''\n      and ms.rank is not null'
  );
  v_definition := replace(
    v_definition,
    'where ss.competition_season_id = p_competition_season_id\n      and reg.status = ''approved''\n      and reg.eligibility_status = ''eligible''',
    'where ss.competition_season_id = p_competition_season_id\n      and reg.status = ''approved''\n      and reg.eligibility_status = ''eligible''\n      and ss.rank is not null'
  );

  if position('join public.rounds leaderboard_round' in v_definition) = 0
    or position('leaderboard_round.external_round_id >= coalesce(reg.eligible_from_round, 1)' in v_definition) = 0
    or position('and rs.round_rank is not null' in v_definition) = 0
  then
    raise exception 'Round publication eligibility hardening was not applied';
  end if;

  execute v_definition;
end
$patch_publish_leaderboard$;

-- Recalculate every active season after the eligibility repair. Rankings use
-- points descending; point arrival is consulted only inside an equal score.
do $recalculate$
declare
  v_season record;
begin
  for v_season in
    select id from public.competition_seasons
    where status <> 'archived'
  loop
    perform private.recalculate_scoreboards(v_season.id);
  end loop;
end
$recalculate$;
