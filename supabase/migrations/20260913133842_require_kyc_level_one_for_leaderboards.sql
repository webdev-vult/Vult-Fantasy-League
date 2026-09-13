-- An active Vult account with KYC Level 1 or higher is required for every
-- leaderboard scope. Registrations remain preserved while KYC is pending.

do $patch_scoreboard_kyc$
declare
  v_oid oid;
  v_definition text;
  v_eligibility text := E'and reg.eligibility_status = ''eligible''';
  v_kyc text := E'\n      and exists (\n        select 1\n        from public.registration_verifications leaderboard_verification\n        where leaderboard_verification.registration_id = reg.id\n          and leaderboard_verification.vult_status = ''verified''\n          and coalesce(leaderboard_verification.vult_kyc_level, 0) >= 1\n      )';
  v_before integer;
  v_after integer;
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
  if position('leaderboard_verification.vult_kyc_level' in v_definition) = 0 then
    v_before := (length(v_definition) - length(replace(v_definition, v_eligibility, ''))) / length(v_eligibility);
    v_definition := replace(v_definition, v_eligibility, v_eligibility || v_kyc);
    v_after := (length(v_definition) - length(replace(v_definition, 'leaderboard_verification.vult_kyc_level', ''))) /
      length('leaderboard_verification.vult_kyc_level');

    if v_before < 4 or v_after <> v_before then
      raise exception 'Unable to protect every scoreboard eligibility clause (% found, % patched)', v_before, v_after;
    end if;

    execute v_definition;
  end if;
end
$patch_scoreboard_kyc$;

do $patch_publication_kyc$
declare
  v_oid oid;
  v_definition text;
  v_eligibility text := E'and reg.eligibility_status = ''eligible''';
  v_kyc text := E'\n      and exists (\n        select 1\n        from public.registration_verifications leaderboard_verification\n        where leaderboard_verification.registration_id = reg.id\n          and leaderboard_verification.vult_status = ''verified''\n          and coalesce(leaderboard_verification.vult_kyc_level, 0) >= 1\n      )';
  v_before integer;
  v_after integer;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'publish_leaderboard'
    and pg_get_function_identity_arguments(p.oid) =
      'p_competition_season_id uuid, p_scope text, p_round_id uuid, p_monthly_period_id uuid, p_title text, p_notes text, p_requested_by uuid';

  if v_oid is null then
    raise exception 'public.publish_leaderboard(uuid,text,uuid,uuid,text,text,uuid) was not found';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  if position('leaderboard_verification.vult_kyc_level' in v_definition) = 0 then
    v_before := (length(v_definition) - length(replace(v_definition, v_eligibility, ''))) / length(v_eligibility);
    v_definition := replace(v_definition, v_eligibility, v_eligibility || v_kyc);
    v_after := (length(v_definition) - length(replace(v_definition, 'leaderboard_verification.vult_kyc_level', ''))) /
      length('leaderboard_verification.vult_kyc_level');

    if v_before <> 3 or v_after <> 3 then
      raise exception 'Unable to protect every leaderboard publication clause (% found, % patched)', v_before, v_after;
    end if;

    execute v_definition;
  end if;
end
$patch_publication_kyc$;

comment on function private.recalculate_scoreboards(uuid) is
  'Calculates weekly, monthly and overall standings only for approved registrations with an active verified Vult account at KYC Level 1 or higher.';

comment on function public.publish_leaderboard(uuid, text, uuid, uuid, text, text, uuid) is
  'Publishes privacy-safe leaderboard snapshots containing only approved registrations with verified Vult KYC Level 1 or higher.';

update public.notification_templates
set body_template = case event_key
      when 'registration_awaiting_fpl_sync' then
        'Hello {{participant_name}},\n\nYour registration for {{season_name}} has been safely received.\n\nTeam: {{fpl_team_name}}\nManager: {{fpl_manager_name}}\nReference: {{registration_reference}}\nWeekly eligibility starts: Gameweek {{eligible_from_gameweek}}\n\nFPL has not published your league entry yet. Vult will keep checking automatically. Completed earlier Gameweeks remain excluded from weekly prizes. After FPL approval, an active Vult account with verified KYC Level 1 or higher is required before you appear on Gameweek, monthly or overall leaderboards and before you can receive a prize.\n\nJoin League: {{league_join_url}}\nWhatsApp Community: {{whatsapp_community_url}}\nRules: {{rules_url}}\n\nVult EPL Fantasy'
      when 'registration_approved' then
        'Hello {{participant_name}},\n\nYour FPL entry into {{season_name}} has been approved.\n\nTeam: {{fpl_team_name}}\nManager: {{fpl_manager_name}}\nReference: {{registration_reference}}\n\nTo appear on the Gameweek, monthly and overall leaderboards, your active Vult account must have verified KYC Level 1 or higher. If your KYC is still pending, your registration remains safely saved and you will be included after verification and the next rankings refresh.\n\nLeaderboard: {{leaderboard_url}}\nFixtures: {{fixtures_url}}\nWhatsApp Community: {{whatsapp_community_url}}\n\nVult EPL Fantasy'
      else body_template
    end,
    updated_at = now()
where event_key in ('registration_awaiting_fpl_sync', 'registration_approved');

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
    greatest(minimum_vult_kyc_level, 1), eligible_country_codes, requires_vult_account,
    one_entry_per_participant, employees_eligible, weekly_chip_policy,
    include_transfer_deductions, repeat_weekly_winners_allowed,
    dispute_window_hours, tie_breakers, disqualification_rules,
    concat_ws(E'\n', nullif(notes, ''),
      'KYC eligibility: an active Vult account with verified KYC Level 1 or higher is required to appear on Gameweek, monthly and overall leaderboards and to receive a prize. Pending registrations remain saved but unranked.'),
    now(), now(), created_by
  from superseded
  returning competition_season_id, version
)
update public.competition_seasons cs
set rules_version = inserted.version
from inserted
where cs.id = inserted.competition_season_id;

do $refresh_kyc_rankings$
declare
  v_season record;
begin
  for v_season in
    select id from public.competition_seasons where status <> 'archived'
  loop
    perform private.recalculate_scoreboards(v_season.id);
  end loop;
end
$refresh_kyc_rankings$;
