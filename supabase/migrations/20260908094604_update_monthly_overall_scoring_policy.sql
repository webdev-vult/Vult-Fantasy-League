-- Weekly prizes remain protected by the registration Gameweek cutoff.
-- Monthly standings include the complete official FPL calendar month, while
-- overall standings use the latest official cumulative FPL total.

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
        min(r.external_round_id) filter (
          where r.status in ('scheduled', 'live')
        ),
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

-- Repair the former max-round-plus-one fallback. These registrations were
-- incorrectly assigned GW39 when all configured deadlines had passed.
update public.registrations reg
set eligible_from_round = coalesce(
      (
        select min(r.external_round_id)
        from public.rounds r
        where r.competition_season_id = reg.competition_season_id
          and r.status <> 'cancelled'
          and r.deadline_at > reg.registered_at
      ),
      (
        select min(r.external_round_id)
        from public.rounds r
        where r.competition_season_id = reg.competition_season_id
          and r.status in ('scheduled', 'live')
      ),
      1
    ),
    updated_at = now()
where reg.eligible_from_round > (
  select coalesce(max(r.external_round_id), 38)
  from public.rounds r
  where r.competition_season_id = reg.competition_season_id
);

-- Preserve the audited implementation while changing eligibility by scope.
-- Remove the previously injected cutoff from all aggregates, then add it back
-- only to the weekly ranking clause. Finally override season aggregates with
-- each manager's most recent official cumulative total.
do $patch_scoreboard_policy$
declare
  v_oid oid;
  v_definition text;
  v_cutoff text := E'\n      and r.external_round_id >= coalesce(reg.eligible_from_round, 1)';
  v_eligibility text := E'and reg.eligibility_status = ''eligible''';
  v_overall_sql text := $overall$

  with latest_official as (
    select distinct on (rs.registration_id)
      rs.registration_id,
      rs.total_points,
      rs.overall_rank,
      rs.provider_tie_rank,
      rs.points_reached_at,
      rs.is_provisional,
      r.external_round_id
    from public.round_scores rs
    join public.rounds r on r.id = rs.round_id
    join public.registrations reg on reg.id = rs.registration_id
    where r.competition_season_id = p_competition_season_id
      and r.status <> 'cancelled'
      and reg.status = 'approved'
      and reg.eligibility_status = 'eligible'
    order by rs.registration_id, r.external_round_id desc, rs.updated_at desc
  )
  update public.season_scores ss
  set reported_points = latest.total_points,
      effective_points = latest.total_points,
      provider_total_points = latest.total_points,
      gameweeks_counted = latest.external_round_id,
      is_provisional = latest.is_provisional,
      points_reached_at = latest.points_reached_at,
      provider_tie_rank = coalesce(latest.overall_rank, latest.provider_tie_rank),
      calculated_at = now()
  from latest_official latest
  where ss.competition_season_id = p_competition_season_id
    and ss.registration_id = latest.registration_id;

  with ranked as (
    select ss.id,
      row_number() over (
        partition by ss.competition_season_id
        order by ss.reported_points desc,
          ss.points_reached_at asc nulls last,
          ss.provider_tie_rank asc nulls last,
          ss.id asc
      )::integer as new_rank
    from public.season_scores ss
    where ss.competition_season_id = p_competition_season_id
  )
  update public.season_scores ss
  set rank = ranked.new_rank,
      movement = case
        when ss.previous_rank is null then 0
        else ss.previous_rank - ranked.new_rank
      end
  from ranked
  where ss.id = ranked.id;
$overall$;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'recalculate_scoreboards'
    and pg_get_function_identity_arguments(p.oid) = 'p_competition_season_id uuid';

  if v_oid is null then
    raise exception 'private.recalculate_scoreboards(uuid) was not found';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_definition := replace(v_definition, v_cutoff, '');
  v_definition := regexp_replace(
    v_definition,
    v_eligibility,
    v_eligibility || v_cutoff
  );

  if position(v_cutoff in v_definition) = 0 then
    raise exception 'Weekly eligibility cutoff could not be restored';
  end if;

  v_definition := regexp_replace(
    v_definition,
    E'\nend;\n\\$function\\$[[:space:]]*$',
    v_overall_sql || E'\nend;\n$function$\n'
  );

  if position('with latest_official as' in v_definition) = 0 then
    raise exception 'Official cumulative overall calculation was not installed';
  end if;

  execute v_definition;
end
$patch_scoreboard_policy$;

comment on function private.recalculate_scoreboards(uuid) is
  'Weekly rankings enforce the eligible Gameweek cutoff; monthly rankings cover the full official FPL calendar month; overall rankings use the latest official cumulative FPL total.';

update public.notification_templates
set subject_template = case event_key
      when 'registration_awaiting_fpl_sync' then
        'Registration saved — weekly eligibility starts in Gameweek {{eligible_from_gameweek}}'
      else subject_template
    end,
    body_template = case event_key
      when 'registration_awaiting_fpl_sync' then
        'Hello {{participant_name}},\n\nYour registration for {{season_name}} has been safely received.\n\nTeam: {{fpl_team_name}}\nManager: {{fpl_manager_name}}\nReference: {{registration_reference}}\nWeekly eligibility starts: Gameweek {{eligible_from_gameweek}}\n\nFPL has not published your league entry yet. Vult will keep checking automatically. Completed earlier Gameweeks remain excluded from weekly prizes. Once your entry is verified and approved, your monthly ranking will include every official FPL Gameweek in that calendar month, and your overall ranking will use your official cumulative FPL season total.\n\nJoin League: {{league_join_url}}\nWhatsApp Community: {{whatsapp_community_url}}\nRules: {{rules_url}}\n\nVult EPL Fantasy'
      when 'registration_approved' then
        'Hello {{participant_name}},\n\nYour entry into {{season_name}} has been approved.\n\nTeam: {{fpl_team_name}}\nManager: {{fpl_manager_name}}\nReference: {{registration_reference}}\n\nWeekly prizes apply from your recorded eligible Gameweek. Your monthly ranking includes every official FPL Gameweek in the calendar month in which you are approved, and your overall ranking uses your official cumulative FPL season total.\n\nLeaderboard: {{leaderboard_url}}\nFixtures: {{fixtures_url}}\nWhatsApp Community: {{whatsapp_community_url}}\n\nIf selected for a prize, Vult KYC Level 1 must be confirmed before it can be awarded.\n\nVult EPL Fantasy'
      else body_template
    end,
    updated_at = now()
where event_key in ('registration_awaiting_fpl_sync', 'registration_approved');

-- Publish the policy as a new immutable rules version.
with current_rules as (
  select distinct on (competition_season_id) *
  from public.competition_rules
  where status = 'published'
  order by competition_season_id, version desc
), superseded as (
  update public.competition_rules cr
  set status = 'superseded'
  from current_rules src
  where cr.id = src.id
  returning src.*
), inserted as (
  insert into public.competition_rules (
    competition_season_id, version, title, status, minimum_age,
    minimum_vult_kyc_level, eligible_country_codes, requires_vult_account,
    one_entry_per_participant, employees_eligible, weekly_chip_policy,
    include_transfer_deductions, repeat_weekly_winners_allowed,
    dispute_window_hours, tie_breakers, disqualification_rules, notes,
    effective_at, published_at, created_by
  )
  select
    competition_season_id, version + 1, title, 'published', minimum_age,
    minimum_vult_kyc_level, eligible_country_codes, requires_vult_account,
    one_entry_per_participant, employees_eligible, weekly_chip_policy,
    include_transfer_deductions, repeat_weekly_winners_allowed,
    dispute_window_hours, tie_breakers, disqualification_rules,
    concat_ws(E'\n', nullif(notes, ''),
      'Scoring eligibility: weekly prizes begin from the recorded eligible Gameweek; monthly standings include the complete official FPL calendar month once approved in that month; overall standings use the official cumulative FPL season total.'),
    now(), now(), created_by
  from superseded
  returning competition_season_id, version
)
update public.competition_seasons cs
set rules_version = inserted.version
from inserted
where cs.id = inserted.competition_season_id;

do $refresh$
declare
  v_season record;
begin
  for v_season in
    select id from public.competition_seasons where status <> 'archived'
  loop
    perform private.recalculate_scoreboards(v_season.id);
  end loop;
end
$refresh$;
