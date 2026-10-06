-- Approved, eligible, FPL-verified registrations participate at every KYC level.
-- KYC is deferred until prize compliance/confirmation, not candidate selection.
-- Keep historic publications, winner decisions and recorded KYC evidence intact.

do $scoreboard_participation$
declare
  v_signature text;
  v_definition text;
  v_anchor text := 'and reg.eligibility_status = ''eligible''';
  v_old_kyc text := E'\n      and exists (\n        select 1\n        from public.registration_verifications leaderboard_verification\n        where leaderboard_verification.registration_id = reg.id\n          and leaderboard_verification.vult_status = ''verified''\n          and coalesce(leaderboard_verification.vult_kyc_level, 0) >= 1\n      )';
  v_fpl text := E'\n      and exists (\n        select 1\n        from public.registration_verifications leaderboard_verification\n        join public.fantasy_entries leaderboard_entry\n          on leaderboard_entry.registration_id = leaderboard_verification.registration_id\n        where leaderboard_verification.registration_id = reg.id\n          and leaderboard_verification.fpl_status = ''verified''\n          and leaderboard_entry.verified_at is not null\n      )';
  v_count integer;
begin
  foreach v_signature in array array[
    'private.recalculate_scoreboards(uuid)',
    'public.publish_leaderboard(uuid,text,uuid,uuid,text,text,uuid)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    -- Support both environments that applied the KYC leaderboard migration and
    -- environments that deployed the UI without applying that migration.
    v_definition := replace(v_definition, v_old_kyc, '');
    if position('vult_kyc_level' in v_definition) > 0 then
      raise exception 'Unexpected KYC filter in %; refusing a partial change', v_signature;
    end if;
    if position('leaderboard_verification.fpl_status' in v_definition) = 0 then
      v_count := (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor);
      if (v_signature like 'private.%' and v_count <> 7)
        or (v_signature like 'public.%' and v_count <> 3) then
        raise exception 'Unexpected eligibility clauses in %: %', v_signature, v_count;
      end if;
      v_definition := replace(v_definition, v_anchor, v_anchor || v_fpl);
      execute v_definition;
    end if;
  end loop;
end
$scoreboard_participation$;

comment on function private.recalculate_scoreboards(uuid) is
  'Calculates standings for approved, eligible, FPL-verified participants at all KYC levels. KYC is required only before prize confirmation.';
comment on function public.publish_leaderboard(uuid,text,uuid,uuid,text,text,uuid) is
  'Publishes consent-based snapshots of approved, eligible, FPL-verified participants without a KYC participation gate.';

-- Vult account/KYC state must not block the audited registration approval.
-- FPL, duplicate-risk, admin-role and status-transition protections remain.
do $approval_participation$
declare
  v_definition text := pg_get_functiondef('public.transition_registration_status(uuid,text,text)'::regprocedure);
  v_start integer;
  v_end integer;
begin
  v_start := position('    if v_requires_vult and v_verification.vult_status' in v_definition);
  v_end := position('    if v_verification.duplicate_risk' in v_definition);
  if v_start = 0 or v_end <= v_start then
    raise exception 'Registration approval boundaries changed; refusing a partial change';
  end if;
  v_definition := substring(v_definition from 1 for v_start - 1)
    || substring(v_definition from v_end);
  v_definition := replace(v_definition,
    'if v_verification.fpl_status <> ''verified'' then',
    'if v_verification.fpl_status is distinct from ''verified'' then');
  execute v_definition;
end
$approval_participation$;

-- KYC 0 remains in the ranked candidate pool as review_required, rather than
-- being skipped in favour of a lower-scoring manager with completed KYC.
do $candidate_kyc_review$
declare
  v_definition text := pg_get_functiondef('private.evaluate_winner_eligibility(uuid,uuid,uuid,text,uuid,boolean)'::regprocedure);
  v_start integer;
  v_end integer;
  v_kyc text := $kyc$
  v_pass := coalesce(
    v_verification.vult_status = 'verified'
    and coalesce(v_verification.vult_kyc_level, 0) >= greatest(coalesce(v_rules.minimum_vult_kyc_level, 1), 1)
    and nullif(btrim(coalesce(v_participant.phone, '')), '') is not null
    and nullif(btrim(coalesce(v_verification.vult_verified_reference, '')), '') is not null
    and private.normalize_phone(v_verification.vult_verified_reference) = private.normalize_phone(v_participant.phone),
    false
  );
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'vult_kyc_level',
    'status', case when v_pass then 'pass' else 'review' end,
    'is_required', true,
    'summary', case when v_pass then 'The winner has completed the required Vult KYC level.'
      else 'Selected managers remain eligible to compete at every KYC level. Complete and verify the required Vult KYC level before compliance approval, winner confirmation and payment.' end,
    'details', jsonb_build_object(
      'verification_status', coalesce(v_verification.vult_status, 'missing'),
      'recorded_kyc_level', coalesce(v_verification.vult_kyc_level, 0),
      'required_kyc_level', greatest(coalesce(v_rules.minimum_vult_kyc_level, 1), 1),
      'verification_basis', 'manual_vult_system_kyc_check',
      'required_before', 'prize_confirmation'
    )
  ));
  v_review_required := v_review_required or not v_pass;

$kyc$;
begin
  v_start := position('  v_pass := v_rules.minimum_vult_kyc_level <= 0' in v_definition);
  v_end := position('  v_pass := v_country_code = any(v_rules.eligible_country_codes);' in v_definition);
  if v_start = 0 or v_end <= v_start then
    raise exception 'Winner KYC check boundaries changed; refusing a partial change';
  end if;
  v_definition := substring(v_definition from 1 for v_start - 1)
    || v_kyc || substring(v_definition from v_end);
  execute v_definition;
end
$candidate_kyc_review$;

comment on function private.evaluate_winner_eligibility(uuid,uuid,uuid,text,uuid,boolean) is
  'Missing KYC requires prize review but does not exclude a candidate from score-based selection. Other competition eligibility checks remain enforced.';

-- Current evidence, not an old candidate snapshot, gates the award. This helper
-- is private, service-role-only and invoker-rights; existing audited RPCs retain
-- their admin-role checks and existing security mode.
create or replace function private.assert_winner_kyc_verified(p_candidate_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_required_level integer;
  v_verified boolean;
begin
  select greatest(coalesce(cr.minimum_vult_kyc_level, 1), 1),
    coalesce(
      rv.vult_status = 'verified'
      and coalesce(rv.vult_kyc_level, 0) >= greatest(coalesce(cr.minimum_vult_kyc_level, 1), 1)
      and nullif(btrim(coalesce(par.phone, '')), '') is not null
      and nullif(btrim(coalesce(rv.vult_verified_reference, '')), '') is not null
      and private.normalize_phone(rv.vult_verified_reference) = private.normalize_phone(par.phone),
      false
    )
  into v_required_level, v_verified
  from public.winner_candidates wc
  join public.registrations reg on reg.id = wc.registration_id
  join public.participants par on par.id = reg.participant_id
  left join public.registration_verifications rv on rv.registration_id = reg.id
  left join public.competition_rules cr
    on cr.competition_season_id = wc.competition_season_id and cr.version = wc.rules_version
  where wc.id = p_candidate_id;
  if not found then
    raise exception 'Winner candidate not found for KYC review.';
  end if;
  if not v_verified then
    raise exception 'Verify the winner''s active Vult account at KYC Level % or higher before compliance approval, winner confirmation or payment. Their leaderboard position is unchanged.', v_required_level;
  end if;
end;
$$;
revoke all on function private.assert_winner_kyc_verified(uuid) from public, anon, authenticated;
grant execute on function private.assert_winner_kyc_verified(uuid) to service_role;

do $award_kyc_gates$
declare
  v_definition text;
  v_anchor text;
begin
  v_definition := pg_get_functiondef('public.compliance_review_winner_candidate(uuid,text,text,uuid)'::regprocedure);
  v_anchor := E'  if p_decision = ''approve'' then\n    v_new_status := ''compliance_approved'';';
  if position(v_anchor in v_definition) = 0 then raise exception 'Compliance approval boundary changed'; end if;
  v_definition := replace(v_definition, v_anchor,
    E'  if p_decision = ''approve'' then\n    perform private.assert_winner_kyc_verified(p_candidate_id);\n    v_new_status := ''compliance_approved'';');
  execute v_definition;

  v_definition := pg_get_functiondef('public.confirm_winner_candidate(uuid,text,uuid)'::regprocedure);
  v_anchor := E'  update public.winner_candidates\n  set status = ''confirmed'',';
  if position(v_anchor in v_definition) = 0 then raise exception 'Winner confirmation boundary changed'; end if;
  v_definition := replace(v_definition, v_anchor,
    E'  perform private.assert_winner_kyc_verified(p_candidate_id);\n\n' || v_anchor);
  execute v_definition;

  v_definition := pg_get_functiondef('public.prepare_prize_payment(uuid,uuid)'::regprocedure);
  v_anchor := '  select * into v_registration';
  if position(v_anchor in v_definition) = 0 then raise exception 'Prize preparation boundary changed'; end if;
  v_definition := replace(v_definition, v_anchor,
    E'  perform private.assert_winner_kyc_verified(p_candidate_id);\n\n' || v_anchor);
  execute v_definition;
end
$award_kyc_gates$;

-- Correct only the old KYC paragraphs in editable templates; preserve custom
-- wording, links and all previously queued/sent message snapshots.
update public.notification_templates
set body_template = replace(replace(body_template,
    'After FPL approval, an active Vult account with verified KYC Level 1 or higher is required before you appear on Gameweek, monthly or overall leaderboards and before you can receive a prize.',
    'Once approved and FPL-verified, you qualify for the Gameweek, monthly and overall standings at every KYC level, including Level 0. If selected for a prize, complete Vult KYC Level 1 or higher before winner confirmation and payment.'),
    'To appear on the Gameweek, monthly and overall leaderboards, your active Vult account must have verified KYC Level 1 or higher. If your KYC is still pending, your registration remains safely saved and you will be included after verification and the next rankings refresh.',
    'Once approved and FPL-verified, you qualify for the Gameweek, monthly and overall standings at every KYC level, including Level 0. If selected for a prize, complete Vult KYC Level 1 or higher before winner confirmation and payment.'),
    updated_at = now()
where event_key in ('registration_awaiting_fpl_sync', 'registration_approved');

update public.notification_templates
set body_template = body_template || E'\n\nParticipation: approved, FPL-verified participants qualify at every KYC level, including Level 0. KYC never reduces your ranking or prevents candidate selection. If selected for a prize, complete Vult KYC Level 1 or higher before winner confirmation and payment.',
    updated_at = now()
where event_key in ('registration_received', 'registration_awaiting_fpl_sync', 'registration_approved')
  and position('every KYC level, including Level 0' in body_template) = 0;

-- Publish a new policy version; do not rewrite rules accepted by participants
-- or decisions made under earlier versions. Avoid draft-version collisions.
with current_rules as (
  select distinct on (cr.competition_season_id) cr.*
  from public.competition_rules cr
  join public.competition_seasons cs on cs.id = cr.competition_season_id
  where cr.status = 'published' and cs.status <> 'archived'
  order by cr.competition_season_id, cr.version desc
), superseded as (
  update public.competition_rules cr set status = 'superseded'
  from current_rules src where cr.id = src.id returning src.*
), inserted as (
  insert into public.competition_rules (
    competition_season_id, version, title, status, minimum_age,
    minimum_vult_kyc_level, eligible_country_codes, requires_vult_account,
    one_entry_per_participant, employees_eligible, weekly_chip_policy,
    include_transfer_deductions, repeat_weekly_winners_allowed,
    dispute_window_hours, tie_breakers, disqualification_rules, notes,
    effective_at, published_at, created_by
  )
  select src.competition_season_id,
    (select max(all_rules.version) + 1 from public.competition_rules all_rules where all_rules.competition_season_id = src.competition_season_id),
    src.title, 'published', src.minimum_age,
    greatest(src.minimum_vult_kyc_level, 1), src.eligible_country_codes, false,
    src.one_entry_per_participant, src.employees_eligible, src.weekly_chip_policy,
    src.include_transfer_deductions, src.repeat_weekly_winners_allowed,
    src.dispute_window_hours, src.tie_breakers, src.disqualification_rules,
    concat_ws(E'\n', nullif(replace(coalesce(src.notes, ''),
      'KYC eligibility: an active Vult account with verified KYC Level 1 or higher is required to appear on Gameweek, monthly and overall leaderboards and to receive a prize. Pending registrations remain saved but unranked.', ''), ''),
      'Participation and candidate selection: approved, eligible, FPL-verified participants qualify at every KYC level, including Level 0. Pending KYC does not change leaderboard rank. Selected candidates must complete and verify Vult KYC Level 1 or the higher published prize minimum before compliance approval, winner confirmation and payment.'),
    now(), now(), src.created_by
  from superseded src
  returning competition_season_id, version
)
update public.competition_seasons cs set rules_version = inserted.version
from inserted where cs.id = inserted.competition_season_id;

do $refresh_participation_rankings$
declare v_season record;
begin
  for v_season in select id from public.competition_seasons where status <> 'archived' loop
    perform private.recalculate_scoreboards(v_season.id);
  end loop;
end
$refresh_participation_rankings$;
