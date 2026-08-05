drop function if exists public.submit_public_registration(
  text, text, date, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, text
);

create or replace function public.submit_public_registration(
  p_competition_season_slug text,
  p_full_name text,
  p_phone text,
  p_whatsapp_phone text,
  p_email text,
  p_country text,
  p_fpl_entry_id text,
  p_fpl_team_name text,
  p_fpl_manager_name text,
  p_rules_consent boolean,
  p_privacy_consent boolean,
  p_publicity_consent boolean,
  p_honeypot text default null
)
returns table(registration_reference text, registration_id uuid)
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_season public.competition_seasons%rowtype;
  v_rule public.competition_rules%rowtype;
  v_participant_id uuid;
  v_registration_id uuid;
  v_reference text;
  v_phone text;
  v_email text;
  v_country text;
  v_existing_auth_user_id uuid;
  v_team_name text;
  v_manager_name text;
begin
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
  if v_email is not null and v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' collate "C" then
    raise exception using message = 'Enter a valid email address.';
  end if;

  v_country := upper(btrim(coalesce(p_country, '')));
  if v_country = '' or not (v_country = any(v_rule.eligible_country_codes)) then
    raise exception using message = 'Your country is not eligible for this competition.';
  end if;

  if btrim(coalesce(p_fpl_entry_id, '')) !~ '^[0-9]{1,12}$' then
    raise exception using message = 'The FPL team could not be resolved to a valid Entry ID.';
  end if;

  v_team_name := nullif(btrim(coalesce(p_fpl_team_name, '')), '');
  v_manager_name := nullif(btrim(coalesce(p_fpl_manager_name, '')), '');
  if v_team_name is null then
    raise exception using message = 'Enter your exact FPL team name.';
  end if;
  if v_manager_name is null then
    raise exception using message = 'Enter your exact FPL manager name.';
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

  insert into public.registrations (
    participant_id, competition_season_id, status, eligibility_status,
    rules_version, registration_channel, metadata
  ) values (
    v_participant_id, v_season.id, 'pending', 'pending',
    v_rule.version, 'web',
    jsonb_build_object(
      'submitted_team_name', v_team_name,
      'submitted_manager_name', v_manager_name,
      'fpl_entry_id_resolved_from_league', true,
      'official_league_id', v_season.external_league_id,
      'publicity_consent', coalesce(p_publicity_consent, false)
    )
  ) returning id, public_reference into v_registration_id, v_reference;

  insert into public.fantasy_entries (
    registration_id, competition_season_id, provider, provider_entry_id,
    manager_name, team_name
  ) values (
    v_registration_id, v_season.id, 'approved_fpl',
    btrim(p_fpl_entry_id), v_manager_name, v_team_name
  );

  insert into public.participant_consents (
    registration_id, consent_type, document_version, accepted, metadata
  ) values
    (v_registration_id, 'competition_rules', v_rule.version::text, true, '{}'::jsonb),
    (v_registration_id, 'privacy_notice', '1.0', true, '{}'::jsonb),
    (v_registration_id, 'winner_publicity', '1.0', coalesce(p_publicity_consent, false), '{}'::jsonb);

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(), 'public_registration_submitted', 'registration', v_registration_id::text,
    jsonb_build_object(
      'competition_season_id', v_season.id,
      'registration_reference', v_reference,
      'rules_version', v_rule.version,
      'channel', 'web',
      'fpl_entry_id', btrim(p_fpl_entry_id),
      'team_name', v_team_name,
      'manager_name', v_manager_name,
      'resolved_from_official_league', true
    )
  );

  return query select v_reference, v_registration_id;
exception
  when unique_violation then
    raise exception using message = 'A participant, email address, or FPL team in this registration is already in use.';
end;
$function$;

revoke all on function public.submit_public_registration(
  text, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, text
) from public;

grant execute on function public.submit_public_registration(
  text, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, text
) to anon, authenticated, service_role;
