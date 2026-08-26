-- Preserve registrations when FPL has accepted a manager into the private
-- league but has not yet published that manager through its read-only API.

alter table public.registrations
  add column if not exists eligible_from_round integer
    check (eligible_from_round is null or eligible_from_round > 0);

create index if not exists registrations_eligible_from_round_idx
  on public.registrations (competition_season_id, eligible_from_round);

comment on column public.registrations.eligible_from_round is
  'First Gameweek whose deadline was still open when Vult registration was received. Earlier rounds never count for this registration.';

create or replace function private.assign_registration_eligibility_round()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.eligible_from_round is null then
    select coalesce(
      min(r.external_round_id) filter (where r.deadline_at > coalesce(new.registered_at, now())),
      max(r.external_round_id) + 1,
      1
    )
    into new.eligible_from_round
    from public.rounds r
    where r.competition_season_id = new.competition_season_id
      and r.status <> 'cancelled';
  end if;
  return new;
end;
$$;

revoke all on function private.assign_registration_eligibility_round() from public;

drop trigger if exists registrations_assign_eligibility_round on public.registrations;
create trigger registrations_assign_eligibility_round
before insert on public.registrations
for each row execute function private.assign_registration_eligibility_round();

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
    select max(r.external_round_id) + 1
    from public.rounds r
    where r.competition_season_id = reg.competition_season_id
      and r.status <> 'cancelled'
  ),
  1
)
where reg.eligible_from_round is null;

create or replace function public.submit_public_pending_fpl_registration(
  p_competition_season_slug text,
  p_full_name text,
  p_phone text,
  p_whatsapp_phone text,
  p_email text,
  p_country text,
  p_fpl_team_name text,
  p_fpl_manager_name text,
  p_rules_consent boolean,
  p_privacy_consent boolean,
  p_publicity_consent boolean,
  p_honeypot text default null
)
returns table(registration_reference text, registration_id uuid, eligible_from_round integer)
language plpgsql
security definer
set search_path = 'public', 'private', 'pg_temp'
as $$
declare
  v_season public.competition_seasons%rowtype;
  v_rule public.competition_rules%rowtype;
  v_participant_id uuid;
  v_registration_id uuid;
  v_reference text;
  v_eligible_from_round integer;
  v_phone text;
  v_email text;
  v_country text;
  v_existing_auth_user_id uuid;
  v_team_name text;
  v_manager_name text;
begin
  -- This function is called only by the server-side service-role action.
  perform private.require_service_context();

  if nullif(btrim(coalesce(p_honeypot, '')), '') is not null then
    raise exception using message = 'Unable to submit this registration.';
  end if;

  select * into v_season
  from public.competition_seasons
  where slug = btrim(p_competition_season_slug)
  limit 1;

  if not found
    or v_season.status <> 'registration_open'
    or (v_season.registration_opens_at is not null and now() < v_season.registration_opens_at)
    or (v_season.registration_closes_at is not null and now() > v_season.registration_closes_at)
  then
    raise exception using message = 'Registration is not currently open.';
  end if;

  select * into v_rule
  from public.competition_rules
  where competition_season_id = v_season.id
    and version = v_season.rules_version
    and status = 'published'
  limit 1;

  if not found then
    raise exception using message = 'Registration is not currently available.';
  end if;

  if not coalesce(p_rules_consent, false) or not coalesce(p_privacy_consent, false) then
    raise exception using message = 'You must accept the competition rules and privacy notice.';
  end if;

  if char_length(btrim(coalesce(p_full_name, ''))) < 3
    or char_length(btrim(coalesce(p_full_name, ''))) > 120
  then
    raise exception using message = 'Enter your full legal name.';
  end if;

  v_phone := private.normalize_phone(coalesce(p_phone, ''));
  if char_length(v_phone) < 8 or char_length(v_phone) > 15 then
    raise exception using message = 'Enter a valid phone number.';
  end if;

  v_email := lower(nullif(btrim(coalesce(p_email, '')), ''));
  if v_email is not null and v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[A-z]{2,}$' collate "C" then
    raise exception using message = 'Enter a valid email address.';
  end if;

  v_country := upper(btrim(coalesce(p_country, '')));
  if v_country = '' or not (v_country = any(v_rule.eligible_country_codes)) then
    raise exception using message = 'Your country is not eligible for this competition.';
  end if;

  v_team_name := nullif(btrim(coalesce(p_fpl_team_name, '')), '');
  v_manager_name := nullif(btrim(coalesce(p_fpl_manager_name, '')), '');
  if v_team_name is null or char_length(v_team_name) < 2 or char_length(v_team_name) > 120 then
    raise exception using message = 'Enter a valid FPL team name.';
  end if;
  if v_manager_name is null or char_length(v_manager_name) < 3 or char_length(v_manager_name) > 120 then
    raise exception using message = 'Enter a valid FPL manager name.';
  end if;

  select id, auth_user_id
  into v_participant_id, v_existing_auth_user_id
  from public.participants
  where phone_normalized = v_phone
  limit 1;

  if found then
    if auth.uid() is null
      or v_existing_auth_user_id is null
      or auth.uid() <> v_existing_auth_user_id
    then
      raise exception using message = 'This phone number is already linked to a participant. Contact support to register for another season.';
    end if;

    if exists (
      select 1 from public.registrations
      where participant_id = v_participant_id
        and competition_season_id = v_season.id
    ) then
      raise exception using message = 'You are already registered for this competition season.';
    end if;

    update public.participants
    set full_name = btrim(p_full_name),
        whatsapp_phone = nullif(btrim(coalesce(p_whatsapp_phone, '')), ''),
        email = v_email,
        country = v_country,
        updated_at = now()
    where id = v_participant_id;
  else
    insert into public.participants (
      full_name, phone, whatsapp_phone, email, country, status
    ) values (
      btrim(p_full_name), btrim(p_phone),
      nullif(btrim(coalesce(p_whatsapp_phone, '')), ''), v_email,
      v_country, 'active'
    ) returning id into v_participant_id;
  end if;

  insert into public.registrations as inserted_registration (
    participant_id, competition_season_id, status, eligibility_status,
    rules_version, registration_channel, metadata
  ) values (
    v_participant_id, v_season.id, 'pending', 'pending',
    v_rule.version, 'web',
    jsonb_build_object(
      'submitted_team_name', v_team_name,
      'submitted_manager_name', v_manager_name,
      'fpl_entry_id_resolved_from_league', false,
      'fpl_resolution_state', 'awaiting_fpl_sync',
      'official_league_id', v_season.external_league_id,
      'publicity_consent', coalesce(p_publicity_consent, false),
      'prize_kyc_check_stage', 'winner_review'
    )
  ) returning inserted_registration.id, inserted_registration.public_reference,
      inserted_registration.eligible_from_round
    into v_registration_id, v_reference, v_eligible_from_round;

  insert into public.registration_verifications (
    registration_id, fpl_status, fpl_manager_name, fpl_team_name, fpl_notes
  ) values (
    v_registration_id, 'pending', v_manager_name, v_team_name,
    format('Awaiting publication by the official FPL league API. Eligible from Gameweek %s.', v_eligible_from_round)
  )
  on conflict on constraint registration_verifications_registration_id_key do update
  set fpl_status = 'pending',
      fpl_manager_name = excluded.fpl_manager_name,
      fpl_team_name = excluded.fpl_team_name,
      fpl_notes = excluded.fpl_notes,
      updated_at = now();

  insert into public.participant_consents (
    registration_id, consent_type, document_version, accepted, metadata
  ) values
    (v_registration_id, 'competition_rules', v_rule.version::text, true, '{}'::jsonb),
    (v_registration_id, 'privacy_notice', '1.0', true, '{}'::jsonb),
    (v_registration_id, 'winner_publicity', '1.0', coalesce(p_publicity_consent, false), '{}'::jsonb);

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(), 'public_registration_awaiting_fpl_sync', 'registration', v_registration_id::text,
    jsonb_build_object(
      'competition_season_id', v_season.id,
      'registration_reference', v_reference,
      'eligible_from_round', v_eligible_from_round,
      'team_name', v_team_name,
      'manager_name', v_manager_name,
      'official_league_id', v_season.external_league_id
    )
  );

  return query select v_reference, v_registration_id, v_eligible_from_round;
exception
  when unique_violation then
    raise exception using message = 'A participant, email address, or FPL team in this registration is already in use.';
end;
$$;

revoke all on function public.submit_public_pending_fpl_registration(
  text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.submit_public_pending_fpl_registration(
  text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, text
) to service_role;

create or replace function public.resolve_pending_fpl_registration(
  p_registration_id uuid,
  p_fpl_entry_id text,
  p_fpl_team_name text,
  p_fpl_manager_name text
)
returns void
language plpgsql
security definer
set search_path = 'public', 'private', 'pg_temp'
as $$
declare
  v_registration public.registrations%rowtype;
  v_resolved_at timestamptz := now();
begin
  perform private.require_service_context();
  if btrim(coalesce(p_fpl_entry_id, '')) !~ '^[0-9]{1,12}$' then
    raise exception using message = 'The FPL team could not be resolved to a valid Entry ID.';
  end if;

  select * into v_registration
  from public.registrations
  where id = p_registration_id
  for update;
  if not found then raise exception using message = 'Registration not found.'; end if;
  if coalesce(v_registration.metadata ->> 'fpl_resolution_state', '') <> 'awaiting_fpl_sync' then
    raise exception using message = 'This registration is not awaiting FPL reconciliation.';
  end if;

  insert into public.fantasy_entries (
    registration_id, competition_season_id, provider, provider_entry_id,
    manager_name, team_name, verified_at
  ) values (
    v_registration.id, v_registration.competition_season_id, 'approved_fpl',
    btrim(p_fpl_entry_id), btrim(p_fpl_manager_name), btrim(p_fpl_team_name), v_resolved_at
  );

  update public.registration_verifications
  set fpl_status = 'verified',
      fpl_verified_entry_id = btrim(p_fpl_entry_id),
      fpl_manager_name = btrim(p_fpl_manager_name),
      fpl_team_name = btrim(p_fpl_team_name),
      fpl_notes = 'Automatically verified after FPL published the new entry in the official Vult mini-league.',
      fpl_checked_at = v_resolved_at,
      fpl_checked_by = null,
      updated_at = v_resolved_at
  where registration_id = v_registration.id;

  update public.registrations
  set metadata = metadata || jsonb_build_object(
        'fpl_entry_id_resolved_from_league', true,
        'fpl_resolution_state', 'verified',
        'fpl_resolved_at', v_resolved_at
      ),
      updated_at = v_resolved_at
  where id = v_registration.id;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    null, 'pending_fpl_registration_reconciled', 'registration', v_registration.id::text,
    jsonb_build_object(
      'entry_id', btrim(p_fpl_entry_id),
      'team_name', btrim(p_fpl_team_name),
      'manager_name', btrim(p_fpl_manager_name),
      'source', 'official_vult_fpl_league'
    )
  );
exception
  when unique_violation then
    raise exception using message = 'This FPL Entry ID is already linked to another registration.';
end;
$$;

revoke all on function public.resolve_pending_fpl_registration(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_pending_fpl_registration(uuid, text, text, text)
  to service_role;

insert into public.notification_templates(
  event_key, name, description, subject_template, body_template, default_channels, status
)
values (
  'registration_awaiting_fpl_sync',
  'Registration awaiting FPL sync',
  'Sent when Vult saves a registration before FPL publishes the new league entry.',
  'Registration saved — join Vult FPL for Gameweek {{eligible_from_gameweek}}',
  'Hello {{participant_name}},\n\nYour Vult EPL Fantasy registration has been saved successfully.\n\nTeam: {{fpl_team_name}}\nManager: {{fpl_manager_name}}\nReference: {{registration_reference}}\nEligible from: Gameweek {{eligible_from_gameweek}}\n\nFPL has not published your entry through its public league feed yet. You will not be included in completed Gameweeks before Gameweek {{eligible_from_gameweek}}, but you can compete for weekly prizes from Gameweek {{eligible_from_gameweek}} onward after your league entry is verified.\n\nUse the private button below to join the official Vult FPL league. Vult will check again automatically and email you when your entry is approved.\n\nJoin League: {{league_join_url}}\nRules: {{rules_url}}\n\nVult EPL Fantasy',
  array['email'],
  'active'
)
on conflict (event_key) do update set
  name = excluded.name,
  description = excluded.description,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  default_channels = excluded.default_channels,
  status = 'active',
  updated_at = now();

-- Apply the eligibility cutoff to weekly, monthly and season scoreboards while
-- preserving the existing audited ranking implementation.
do $patch_scoreboard_cutoff$
declare
  v_oid oid;
  v_definition text;
  v_old text := $old$and reg.eligibility_status = 'eligible'$old$;
  v_new text := $new$and reg.eligibility_status = 'eligible'
      and r.external_round_id >= coalesce(reg.eligible_from_round, 1)$new$;
  v_matches integer;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'recalculate_scoreboards'
  limit 1;

  if v_oid is null then
    raise exception 'private.recalculate_scoreboards was not found';
  end if;

  v_definition := pg_get_functiondef(v_oid);
  v_matches := (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old);
  if v_matches < 5 then
    raise exception 'The scoreboard implementation changed; found only % eligibility clauses', v_matches;
  end if;

  execute replace(v_definition, v_old, v_new);
end
$patch_scoreboard_cutoff$;

comment on function private.recalculate_scoreboards(uuid) is
  'Ranks only rounds at or after each registration eligibility cutoff, then uses reported points and point-arrival order.';
