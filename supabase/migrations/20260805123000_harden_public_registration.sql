drop function if exists public.submit_public_registration(
  text, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, text
);

drop function if exists public.submit_public_registration_by_league_identity(
  text, text, text, text, text, text, text, text, text,
  boolean, boolean, boolean, boolean, text
);

create function public.submit_public_registration(
  p_competition_season_slug text,
  p_full_name text,
  p_phone text,
  p_whatsapp_phone text,
  p_email text,
  p_country text,
  p_fpl_entry_id text,
  p_fpl_team_name text,
  p_fpl_manager_name text,
  p_age_confirmed boolean,
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

  if v_rule.minimum_age > 0 and not coalesce(p_age_confirmed, false) then
    raise exception using message = 'You must confirm that you meet the minimum age requirement.';
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

  if btrim(coalesce(p_fpl_entry_id, '')) !~ '^[0-9]{1,12}$' then
    raise exception using message = 'The FPL team could not be resolved to a valid Entry ID.';
  end if;

  v_team_name := nullif(btrim(coalesce(p_fpl_team_name, '')), '');
  v_manager_name := nullif(btrim(coalesce(p_fpl_manager_name, '')), '');
  if v_team_name is null or char_length(v_team_name) > 120 then
    raise exception using message = 'Enter your exact FPL team name.';
  end if;
  if v_manager_name is null or char_length(v_manager_name) > 120 then
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
      'minimum_age', vWÜ[K›Z[š[][WØYÙKˆ	ØYÙWÙ[YÚXš[]WØÛÛ™š\›YY	ËÛØ[\ØÙJØYÙWØÛÛ™š\›YY˜[ÙJKˆ	İ[ØXØÛİ[İ™\šYšXØ][Û—ÜİYÙIË	ÜÜİÜ™YÚ\İ˜][Û‰Ëˆ	ÜX›XÚ]WØÛÛœÙ[	ËÛØ[\ØÙJÜX›XÚ]WØÛÛœÙ[˜[ÙJBˆ
Bˆ
H™]\›š[™ÈYX›X×Ü™Y™\™[˜ÙH[È—Ü™YÚ\İ˜][Û—ÚY—Ü™Y™\™[˜ÙNÂ‚ˆ[œÙ\[ÈX›XË™˜[\ŞWÙ[šY\È
ˆ™YÚ\İ˜][Û—ÚYÛÛ\]][Û—ÜÙX\ÛÛ—ÚY›İšY\‹›İšY\—Ù[WÚYˆX[˜YÙ\—Û˜[YKX[WÛ˜[YBˆ
H˜[Y\È
ˆ—Ü™YÚ\İ˜][Û—ÚY—ÜÙX\ÛÛ‹šY	Ø\›İ™YÙœ	Ëˆš[JÙœÙ[WÚY
K—ÛX[˜YÙ\—Û˜[YK—İX[WÛ˜[YBˆ
NÂ‚ˆ[œÙ\[ÈX›XËœ\XÚ\[ØÛÛœÙ[È
ˆ™YÚ\İ˜][Û—ÚYÛÛœÙ[İ\KØİ[Y[İ™\œÚ[Û‹XØÙ\YY]Y]Bˆ
H˜[Y\Âˆ
—Ü™YÚ\İ˜][Û—ÚY	ØÛÛ\]][Û—Ü[\ÉË—Ü[K™\œÚ[Û^YKˆœÛÛ˜—ØZ[ÛØš™Xİ
	ÛZ[š[][WØYÙWØÛÛ™š\›YY	ËÛØ[\ØÙJØYÙWØÛÛ™š\›YY˜[ÙJJJKˆ
—Ü™YÚ\İ˜][Û—ÚY	Üš]˜XŞWÛ›İXÙIË	ÌKŒ	ËYKßNšœÛÛ˜ŠKˆ
—Ü™YÚ\İ˜][Û—ÚY	İÚ[›™\—ÜX›XÚ]IË	ÌKŒ	ËÛØ[\ØÙJÜX›XÚ]WØÛÛœÙ[˜[ÙJK	ŞßIÎšœÛÛ˜ŠNÂ‚ˆ[œÙ\[ÈX›XË˜]Y]ÛÙÜÈ
ˆXİÜ—İ\Ù\—ÚYXİ[Û‹[]Wİ\K[]WÚYY]Y]Bˆ
H˜[Y\È
ˆ]]ZY

K	ÜX›X×Ü™YÚ\İ˜][Û—ÜİX›Z]Y	Ë	Ü™YÚ\İ˜][Û‰Ë—Ü™YÚ\İ˜][Û—ÚY^ˆœÛÛ˜—ØZ[ÛØš™Xİ
ˆ	ØÛÛ\]][Û—ÜÙX\ÛÛ—ÚY	Ë—ÜÙX\ÛÛ‹šYˆ	Ü™YÚ\İ˜][Û—Ü™Y™\™[˜ÙIË—Ü™Y™\™[˜ÙKˆ	Ü[\×İ™\œÚ[Û‰Ë—Ü[K™\œÚ[Û‹ˆ	ØÚ[›™[	Ë	İÙX‰Ëˆ	ÙœÙ[WÚY	Ëš[JÙœÙ[WÚY
Kˆ	İX[WÛ˜[YIË•÷FVÕöæÖRÀ¢vÖævW%öæÖRrÂe}µ…¹…•É}¹…µ”°(€€€€€€É•Í½±Ù•‘}™É½µ}½™™¥¥…±}±•…Õ”œ°ÑÉÕ”(€€€€¤(€€¤ì((€É•ÑÕÉ¸ÅÕ•ÉäÍ•±•ĞÙ}É•™•É•¹”°Ù}É•¥ÍÑÉ…Ñ¥½¹}¥ì)•á•ÁÑ¥½¸(€İ¡•¸Õ¹¥ÅÕ•}Ù¥½±…Ñ¥½¸Ñ¡•¸(€€€É…¥Í”•á•ÁÑ¥½¸ÕÍ¥¹œµ•ÍÍ…”€ô€Á…ÉÑ¥¥Á…¹Ğ°•µ…¥°…‘‘É•ÍÌ°½ÈA0Ñ•…´¥¸Ñ¡¥ÌÉ•¥ÍÑÉ…Ñ¥½¸¥Ì…±É•…‘ä¥¸ÕÍ”¸œì)•¹ì(‘™Õ¹Ñ¥½¸ì()É•Ù½­”…±°½¸™Õ¹Ñ¥½¸ÁÕ‰±¥Œ¹ÍÕ‰µ¥Ñ}ÁÕ‰±¥}É•¥ÍÑÉ…Ñ¥½¸ (€Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°(€‰½½±•…¸°‰½½±•…¸°‰½½±•…¸°‰½½±•…¸°Ñ•áĞ(¤™É½´ÁÕ‰±¥Œ°…¹½¸°…ÕÑ¡•¹Ñ¥…Ñ•ì()É…¹Ğ•á•ÕÑ”½¸™Õ¹Ñ¥½¸ÁÕ‰±¥Œ¹ÍÕ‰µ¥Ñ}ÁÕ‰±¥}É•¥ÍÑÉ…Ñ¥½¸ (€Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°Ñ•áĞ°(€‰½½±•…¸°‰½½±•…¸°‰½½±•…¸°‰½½±•…¸°Ñ•áĞ(¤Ñ¼Í•ÉÙ¥•}É½±”ì