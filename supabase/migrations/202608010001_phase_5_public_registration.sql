create or replace function private.normalize_phone(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select regexp_replace(value, '[^0-9]', '', 'g');
$$;

alter table public.participants
  add column if not exists phone_normalized text
    generated always as (private.normalize_phone(phone)) stored,
  add column if not exists email_normalized text
    generated always as (lower(nullif(btrim(email), ''))) stored,
  add column if not exists vult_customer_ref_normalized text
    generated always as (lower(nullif(btrim(vult_customer_ref), ''))) stored;

create unique index if not exists participants_phone_normalized_key
  on public.participants (phone_normalized);

create unique index if not exists participants_email_normalized_key
  on public.participants (email_normalized)
  where email_normalized is not null;

create unique index if not exists participants_vult_customer_ref_normalized_key
  on public.participants (vult_customer_ref_normalized)
  where vult_customer_ref_normalized is not null;

alter table public.registrations
  add column if not exists public_reference text not null
    default ('VFL-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))),
  add column if not exists rules_version integer not null default 1,
  add column if not exists registration_channel text not null default 'web';

alter table public.registrations
  drop constraint if exists registrations_rules_version_check,
  add constraint registrations_rules_version_check check (rules_version > 0),
  drop constraint if exists registrations_registration_channel_check,
  add constraint registrations_registration_channel_check
    check (registration_channel in ('web', 'admin', 'import'));

create unique index if not exists registrations_public_reference_key
  on public.registrations (public_reference);

create table if not exists public.participant_consents (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  consent_type text not null check (consent_type in ('competition_rules', 'privacy_notice', 'winner_publicity')),
  document_version text not null,
  accepted boolean not null,
  accepted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (registration_id, consent_type, document_version)
);

create index if not exists participant_consents_registration_id_idx
  on public.participant_consents (registration_id);

alter table public.participant_consents enable row level security;

create policy participant_consents_admin_read
  on public.participant_consents
  for select
  to authenticated
  using (private.is_active_admin());

create policy participant_consents_admin_write
  on public.participant_consents
  for all
  to authenticated
  using (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']))
  with check (private.has_admin_role(array['super_admin', 'competition_manager', 'compliance_officer']));

create policy competitions_public_read
  on public.competitions
  for select
  to anon, authenticated
  using (is_active = true);

create policy seasons_public_read
  on public.seasons
  for select
  to anon, authenticated
  using (status in ('upcoming', 'active', 'completed', 'archived'));

create policy competition_seasons_public_read
  on public.competition_seasons
  for select
  to anon, authenticated
  using (status in ('registration_open', 'registration_closed', 'active', 'completed', 'archived'));

create policy competition_rules_public_read
  on public.competition_rules
  for select
  to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1
      from public.competition_seasons cs
      where cs.id = competition_rules.competition_season_id
        and cs.status in ('registration_open', 'registration_closed', 'active', 'completed', 'archived')
    )
  );

create policy prizes_public_read
  on public.prizes
  for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.competition_seasons cs
      where cs.id = prizes.competition_season_id
        and cs.status in ('registration_open', 'registration_closed', 'active', 'completed', 'archived')
    )
  );

alter table public.fantasy_entries
  drop constraint if exists fantasy_entries_provider_check,
  add constraint fantasy_entries_provider_check
    check (provider in ('mock', 'csv', 'fpl_manual', 'approved_fpl', 'licensed'));

create or replace function public.submit_public_registration(
  p_competition_season_slug text,
  p_full_name text,
  p_date_of_birth date,
  p_phone text,
  p_whatsapp_phone text,
  p_email text,
  p_city text,
  p_country text,
  p_vult_customer_ref text,
  p_fpl_entry_id text,
  p_fpl_team_name text,
  p_rules_consent boolean,
  p_privacy_consent boolean,
  p_publicity_consent boolean,
  p_honeypot text default null
)
returns table (registration_reference text, registration_id uuid)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_season public.competition_seasons%rowtype;
  v_rule public.competition_rules%rowtype;
  v_participant_id uuid;
  v_registration_id uuid;
  v_reference text;
  v_phone text;
  v_email text;
  v_country text;
  v_vult_ref text;
  v_age integer;
  v_existing_auth_user_id uuid;
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

  if p_date_of_birth is null or p_date_of_birth > current_date then
    raise exception using message = 'Enter a valid date of birth.';
  end if;

  v_age := extract(year from age(current_date, p_date_of_birth));
  if v_age < v_rule.minimum_age then
    raise exception using message = 'You do not meet the minimum age requirement.';
  end if;

  v_phone := private.normalize_phone(coalesce(p_phone, ''));
  if char_length(v_phone) < 8 or char_length(v_phone) > 15 then
    raise exception using message = 'Enter a valid phone number.';
  end if;

  v_email := lower(nullif(btrim(coalesce(p_email, '')), ''));
  if v_email is not null and v_email !~ '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' collate "C" then
    raise exception using message = 'Enter a valid email address.';
  end if;

  v_country := upper(btrim(coalesce(p_country, '')));
  if v_country = '' or not (v_country = any(v_rule.eligible_country_codes)) then
    raise exception using message = 'Your country is not eligible for this competition.';
  end if;

  v_vult_ref := nullif(btrim(coalesce(p_vult_customer_ref, '')), '');
  if v_rule.requires_vult_account and v_vult_ref is null then
    raise exception using message = 'A Vult account reference is required.';
  end if;

  if btrim(coalesce(p_fpl_entry_id, '')) !~ '^[0-9]{1,12}$' then
    raise exception using message = 'Enter a valid numeric FPL Entry ID.';
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
        date_of_birth = p_date_of_birth,
        whatsapp_phone = nullif(btrim(coalesce(p_whatsapp_phone, '')), ''),
        email = v_email,
        city = nullif(btrim(coalesce(p_city, '')), ''),
        country = v_country,
        vult_customer_ref = v_vult_ref,
        updated_at = now()
    where id = v_participant_id;
  else
    insert into public.participants (
      full_name, date_of_birth, phone, whatsapp_phone, email,
      city, country, vult_customer_ref, status
    ) values (
      btrim(p_full_name), p_date_of_birth, btrim(p_phone),
      nullif(btrim(coalesce(p_whatsapp_phone, '')), ''), v_email,
      nullif(btrim(coalesce(p_city, '')), ''), v_country, v_vult_ref, 'active'
    ) returning id into v_participant_id;
  end if;

  insert into public.registrations (
    participant_id, competition_season_id, status, eligibility_status,
    rules_version, registration_channel, metadata
  ) values (
    v_participant_id, v_season.id, 'pending', 'pending',
    v_rule.version, 'web',
    jsonb_build_object(
      'submitted_team_name', nullif(btrim(coalesce(p_fpl_team_name, '')), ''),
      'publicity_consent', coalesce(p_publicity_consent, false)
    )
  ) returning id, public_reference into v_registration_id, v_reference;

  insert into public.fantasy_entries (
    registration_id, competition_season_id, provider, provider_entry_id, team_name
  ) values (
    v_registration_id, v_season.id, 'fpl_manual',
    btrim(p_fpl_entry_id), nullif(btrim(coalesce(p_fpl_team_name, '')), '')
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
      'channel', 'web'
    )
  );

  return query select v_reference, v_registration_id;
exception
  when unique_violation then
    raise exception using message = 'A participant, Vult account, email address, or FPL Entry ID in this registration is already in use.';
end;
$$;

revoke all on function public.submit_public_registration(
  text, text, date, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, text
) from public;

grant execute on function public.submit_public_registration(
  text, text, date, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, text
) to anon, authenticated;

notify pgrst, 'reload schema';