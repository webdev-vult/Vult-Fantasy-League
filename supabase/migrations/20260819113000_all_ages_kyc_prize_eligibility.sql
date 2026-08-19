-- Participation has no age restriction and does not require a Vult account.
-- Vult KYC Level 1 is checked only when selecting weekly, monthly or overall
-- prize winners. A failed or missing KYC check never changes leaderboard rank.

alter table public.competition_rules
  add column if not exists minimum_vult_kyc_level smallint not null default 1
    check (minimum_vult_kyc_level between 0 and 3);

alter table public.registration_verifications
  add column if not exists vult_kyc_level smallint not null default 0
    check (vult_kyc_level between 0 and 3);

alter table public.competition_rules
  alter column minimum_age set default 0,
  alter column requires_vult_account set default false;

comment on column public.competition_rules.minimum_age is
  'Legacy compatibility field. Vult Fantasy participation has no minimum age and active rules keep this at zero.';
comment on column public.competition_rules.minimum_vult_kyc_level is
  'Minimum Vult KYC level required only for weekly, monthly and overall prize eligibility.';
comment on column public.registration_verifications.vult_kyc_level is
  'KYC level manually confirmed by authorised staff in the Vult system; zero means Level 1 is not confirmed.';

-- Draft rules cannot reintroduce an age or Vult-account entry gate.
update public.competition_rules
set minimum_age = 0,
    minimum_vult_kyc_level = greatest(minimum_vult_kyc_level, 1),
    requires_vult_account = false
where status = 'draft';

-- Published rules remain versioned. The active rule is superseded and a new
-- rule version records the no-age-limit and prize-KYC policy.
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
    competition_season_id, version + 1, title, 'published', 0,
    1, eligible_country_codes, false,
    one_entry_per_participant, employees_eligible, weekly_chip_policy,
    include_transfer_deductions, repeat_weekly_winners_allowed,
    dispute_window_hours, tie_breakers, disqualification_rules,
    concat_ws(E'\n', nullif(notes, ''),
      'Eligibility update: there is no age limit and no Vult account is required to play. Vult KYC Level 1 or higher is required only to receive weekly, monthly or overall prizes.'),
    now(), now(), created_by
  from superseded
  returning competition_season_id, version
)
update public.competition_seasons cs
set rules_version = inserted.version
from inserted
where cs.id = inserted.competition_season_id;

-- Keep the existing public RPC signature stable for deployed clients, but
-- remove the age declaration guard and age metadata from new registrations.
do $patch_registration$
declare
  v_oid oid;
  v_definition text;
  v_guard_start integer;
  v_guard_end integer;
  v_old_metadata text := $old$
      'minimum_age', v_rule.minimum_age,
      'age_eligibility_confirmed', coalesce(p_age_confirmed, false),
$old$;
  v_new_metadata text := $new$
      'prize_kyc_check_stage', 'winner_review',
$new$;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'submit_public_registration'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'public.submit_public_registration was not found';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_guard_start := position('  if v_rule.minimum_age > 0 and not coalesce(p_age_confirmed, false) then' in v_definition);
  v_guard_end := position('  if char_length(btrim(coalesce(p_full_name, ''''))) < 3' in v_definition);

  if v_guard_start = 0 or v_guard_end <= v_guard_start then
    raise exception 'The registration age guard changed; the no-age patch was not applied';
  end if;
  if position(v_old_metadata in v_definition) = 0 then
    raise exception 'The registration age metadata changed; the no-age patch was not applied';
  end if;

  v_definition := substring(v_definition from 1 for v_guard_start - 1)
    || substring(v_definition from v_guard_end);
  v_definition := replace(v_definition, v_old_metadata, v_new_metadata);
  execute v_definition;
end
$patch_registration$;

comment on function public.submit_public_registration(
  text, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, boolean, text
) is 'Public registration RPC. Participation has no age gate; the legacy age-confirmed argument is retained only for client compatibility.';

-- Replace the winner check in-place so existing audited winner-generation and
-- replacement workflows remain intact. The new required check uses the phone
-- submitted at registration, the manually confirmed Vult account and its KYC
-- level. The entire historical age check is removed.
do $patch_winner$
declare
  v_oid oid;
  v_definition text;
  v_vult_start integer;
  v_age_start integer;
  v_country_check_start integer;
  v_age_assignment_start integer;
  v_country_assignment_start integer;
  v_new_kyc_block text := $kyc$  v_pass := v_rules.minimum_vult_kyc_level <= 0
    or (
      v_verification.vult_status = 'verified'
      and coalesce(v_verification.vult_kyc_level, 0) >= v_rules.minimum_vult_kyc_level
      and nullif(btrim(coalesce(v_participant.phone, '')), '') is not null
      and nullif(btrim(coalesce(v_verification.vult_verified_reference, '')), '') is not null
      and private.normalize_phone(v_verification.vult_verified_reference) = private.normalize_phone(v_participant.phone)
    );
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code', 'vult_kyc_level',
    'status', case
      when v_rules.minimum_vult_kyc_level <= 0 then 'not_applicable'
      when v_pass then 'pass'
      else 'fail'
    end,
    'is_required', v_rules.minimum_vult_kyc_level > 0,
    'summary', case
      when v_rules.minimum_vult_kyc_level <= 0 then 'No Vult KYC level is required for this prize.'
      when v_pass then 'The winner has completed the required Vult KYC level.'
      else 'The manager may keep playing and remain ranked, but is not eligible for this prize because Vult KYC Level 1 has not been confirmed.'
    end,
    'details', jsonb_build_object(
      'verification_status', coalesce(v_verification.vult_status, 'missing'),
      'recorded_kyc_level', coalesce(v_verification.vult_kyc_level, 0),
      'required_kyc_level', v_rules.minimum_vult_kyc_level,
      'verification_basis', 'manual_vult_system_kyc_check'
    )
  ));
  v_required_failure := v_required_failure or not v_pass;$kyc$;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'evaluate_winner_eligibility'
  limit 1;

  if v_oid is null then
    raise exception 'private.evaluate_winner_eligibility was not found';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_vult_start := position('  v_pass := not v_rules.requires_vult_account' in v_definition);
  v_age_start := position('  if v_rules.minimum_age <= 0 then' in v_definition);

  if v_vult_start = 0 or v_age_start <= v_vult_start then
    raise exception 'The winner Vult/age checks changed; the KYC patch was not applied';
  end if;

  v_definition := substring(v_definition from 1 for v_vult_start - 1)
    || v_new_kyc_block || E'\n\n'
    || substring(v_definition from v_age_start);

  v_age_start := position('  if v_rules.minimum_age <= 0 then' in v_definition);
  v_country_check_start := position('  v_pass := v_country_code = any(v_rules.eligible_country_codes);' in v_definition);
  if v_age_start = 0 or v_country_check_start <= v_age_start then
    raise exception 'The winner age-check boundary changed; the no-age patch was not applied';
  end if;
  v_definition := substring(v_definition from 1 for v_age_start - 1)
    || substring(v_definition from v_country_check_start);

  v_definition := replace(v_definition, E'  v_age integer;\n', '');
  v_age_assignment_start := position('  v_age := case' in v_definition);
  v_country_assignment_start := position('  v_country_code := private.winner_country_code' in v_definition);
  if v_age_assignment_start = 0 or v_country_assignment_start <= v_age_assignment_start then
    raise exception 'The winner age-calculation boundary changed; the no-age patch was not applied';
  end if;
  v_definition := substring(v_definition from 1 for v_age_assignment_start - 1)
    || substring(v_definition from v_country_assignment_start);

  execute v_definition;
end
$patch_winner$;

revoke all on function private.evaluate_winner_eligibility(uuid, uuid, uuid, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function private.evaluate_winner_eligibility(uuid, uuid, uuid, text, uuid, boolean)
  to service_role;

comment on function private.evaluate_winner_eligibility(uuid, uuid, uuid, text, uuid, boolean) is
  'Evaluates prize eligibility without an age check. Vult KYC Level 1 or higher is required only for weekly, monthly and overall prize selection and never changes leaderboard ranking.';
