create or replace function private.require_service_context()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  v_role := coalesce(auth.jwt() ->> 'role', current_setting('request.jwt.claim.role', true), '');
  if v_role <> 'service_role' then
    raise exception using message = 'This operation requires the trusted application service.';
  end if;
end;
$$;

create or replace function private.normalized_contact(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when position('@' in coalesce(p_value, '')) > 0 then lower(btrim(coalesce(p_value, '')))
    else regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g')
  end;
$$;

create or replace function private.contact_matches_participant(
  p_participant public.participants,
  p_contact text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.normalized_contact(p_contact) <> '' and (
    private.normalized_contact(p_contact) = private.normalized_contact(p_participant.email)
    or private.normalized_contact(p_contact) = private.normalized_contact(p_participant.phone)
    or private.normalized_contact(p_contact) = private.normalized_contact(p_participant.whatsapp_phone)
  );
$$;

create or replace function private.enqueue_notification(
  p_competition_season_id uuid,
  p_participant_id uuid,
  p_registration_id uuid,
  p_dispute_id uuid,
  p_winner_candidate_id uuid,
  p_payment_id uuid,
  p_template_id uuid,
  p_channel text,
  p_recipient text,
  p_subject text,
  p_body text,
  p_idempotency_key text,
  p_created_by uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
begin
  if p_channel not in ('email','whatsapp','in_app','manual') then
    raise exception using message = 'Notification channel is invalid.';
  end if;
  if nullif(btrim(coalesce(p_recipient, '')), '') is null then
    raise exception using message = 'Notification recipient is required.';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) < 2 then
    raise exception using message = 'Notification body is required.';
  end if;

  v_status := case when p_channel = 'in_app' then 'sent' else 'manual_pending' end;

  insert into public.notification_outbox(
    competition_season_id, participant_id, registration_id, dispute_id,
    winner_candidate_id, payment_id, template_id, channel, recipient,
    subject, body, status, scheduled_at, sent_at, idempotency_key,
    created_by, metadata
  ) values (
    p_competition_season_id, p_participant_id, p_registration_id, p_dispute_id,
    p_winner_candidate_id, p_payment_id, p_template_id, p_channel, btrim(p_recipient),
    nullif(btrim(coalesce(p_subject, '')), ''), btrim(p_body), v_status, now(),
    case when v_status = 'sent' then now() else null end,
    p_idempotency_key, p_created_by, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into v_id;

  if v_status = 'sent' and not exists (
    select 1 from public.notification_delivery_attempts where notification_id = v_id
  ) then
    insert into public.notification_delivery_attempts(
      notification_id, attempt_number, delivery_method, outcome, attempted_by, metadata
    ) values (v_id, 1, 'in_app', 'sent', p_created_by, jsonb_build_object('stored_in_platform', true));
  end if;

  return v_id;
end;
$$;

create or replace function private.issue_dispute_access_token(p_dispute_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.dispute_public_access_tokens(dispute_id, token_hash, expires_at)
  values (p_dispute_id, encode(digest(v_token, 'sha256'), 'hex'), now() + interval '30 minutes');
  return v_token;
end;
$$;

create or replace function private.resolve_dispute_access(
  p_case_reference text,
  p_access_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispute_id uuid;
begin
  select d.id into v_dispute_id
  from public.disputes d
  join public.dispute_public_access_tokens t on t.dispute_id = d.id
  where upper(d.case_reference) = upper(btrim(coalesce(p_case_reference, '')))
    and t.token_hash = encode(digest(coalesce(p_access_token, ''), 'sha256'), 'hex')
    and t.expires_at > now()
  order by t.created_at desc
  limit 1;

  if v_dispute_id is null then
    raise exception using message = 'The case access link is invalid or expired.';
  end if;

  update public.dispute_public_access_tokens
  set last_used_at = now()
  where dispute_id = v_dispute_id
    and token_hash = encode(digest(coalesce(p_access_token, ''), 'sha256'), 'hex');

  return v_dispute_id;
end;
$$;

create or replace function public.submit_participant_dispute(
  p_registration_reference text,
  p_contact text,
  p_category text,
  p_subject text,
  p_description text,
  p_related_reference text default null,
  p_evidence_url text default null,
  p_honeypot text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
  v_participant public.participants%rowtype;
  v_dispute_id uuid;
  v_case_reference text;
  v_access_token text;
  v_template_id uuid;
  v_body text;
  v_related_payment_id uuid;
  v_related_winner_id uuid;
  v_priority text;
begin
  perform private.require_service_context();

  if nullif(btrim(coalesce(p_honeypot, '')), '') is not null then
    raise exception using message = 'Unable to submit this request.';
  end if;
  if p_category not in ('registration','score','eligibility','winner','payment','other') then
    raise exception using message = 'Dispute category is invalid.';
  end if;
  if char_length(btrim(coalesce(p_subject, ''))) not between 8 and 180 then
    raise exception using message = 'Subject must contain between 8 and 180 characters.';
  end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 20 and 5000 then
    raise exception using message = 'Description must contain between 20 and 5,000 characters.';
  end if;
  if nullif(btrim(coalesce(p_evidence_url, '')), '') is not null
    and btrim(p_evidence_url) !~* '^https?://'
  then
    raise exception using message = 'Evidence URL must begin with http:// or https://.';
  end if;

  select r.* into v_registration
  from public.registrations r
  where upper(r.public_reference) = upper(btrim(coalesce(p_registration_reference, '')))
  limit 1;

  if v_registration.id is null then
    raise exception using message = 'The registration reference or contact details are not valid.';
  end if;

  select * into v_participant from public.participants where id = v_registration.participant_id;
  if not private.contact_matches_participant(v_participant, p_contact) then
    raise exception using message = 'The registration reference or contact details are not valid.';
  end if;

  if exists (
    select 1 from public.disputes d
    where d.registration_id = v_registration.id
      and d.category = p_category
      and lower(d.subject) = lower(btrim(p_subject))
      and d.status not in ('resolved','rejected','closed')
      and d.created_at > now() - interval '24 hours'
  ) then
    raise exception using message = 'A similar open case already exists for this registration.';
  end if;

  if p_category = 'payment' and nullif(btrim(coalesce(p_related_reference, '')), '') is not null then
    select pp.id, pp.winner_candidate_id into v_related_payment_id, v_related_winner_id
    from public.prize_payments pp
    where upper(pp.award_reference) = upper(btrim(p_related_reference))
      and pp.participant_id = v_participant.id
    limit 1;
  end if;

  v_priority := case when p_category in ('winner','payment') then 'high' else 'normal' end;

  insert into public.disputes(
    competition_season_id, registration_id, participant_id, category,
    subject, description, related_reference, related_winner_candidate_id,
    related_payment_id, status, priority, submitted_channel,
    contact_email, contact_phone, due_at, metadata
  ) values (
    v_registration.competition_season_id, v_registration.id, v_participant.id, p_category,
    btrim(p_subject), btrim(p_description), nullif(btrim(coalesce(p_related_reference, '')), ''),
    v_related_winner_id, v_related_payment_id, 'open', v_priority, 'web',
    v_participant.email, coalesce(v_participant.whatsapp_phone, v_participant.phone),
    now() + case when v_priority = 'high' then interval '2 days' else interval '5 days' end,
    jsonb_build_object('submitted_contact_hash', encode(digest(private.normalized_contact(p_contact), 'sha256'), 'hex'))
  ) returning id, case_reference into v_dispute_id, v_case_reference;

  insert into public.dispute_messages(dispute_id, author_type, channel, visibility, message)
  values (v_dispute_id, 'participant', 'in_app', 'participant', btrim(p_description));

  insert into public.dispute_status_history(
    dispute_id, from_status, to_status, action, actor_type, notes, metadata
  ) values (
    v_dispute_id, null, 'open', 'case_submitted', 'participant',
    'Participant submitted the case through the public support form.',
    jsonb_build_object('category', p_category, 'registration_reference', v_registration.public_reference)
  );

  if nullif(btrim(coalesce(p_evidence_url, '')), '') is not null then
    insert into public.dispute_evidence(
      dispute_id, submitted_by_type, visibility, evidence_type, external_url, notes
    ) values (
      v_dispute_id, 'participant', 'participant', 'supporting_document', btrim(p_evidence_url),
      'Evidence reference submitted with the original case.'
    );
  end if;

  select id into v_template_id from public.notification_templates where event_key = 'dispute_received';
  v_body := 'We received your case ' || v_case_reference || ' about ' || btrim(p_subject) || '. The current status is Open. Keep this reference for follow-up.';

  perform private.enqueue_notification(
    v_registration.competition_season_id, v_participant.id, v_registration.id, v_dispute_id,
    null, null, v_template_id, 'in_app', 'registration:' || v_registration.id::text,
    'Case ' || v_case_reference || ' received', v_body,
    'dispute:' || v_dispute_id::text || ':received:in_app', null,
    jsonb_build_object('event_key', 'dispute_received')
  );

  if nullif(btrim(coalesce(v_participant.email, '')), '') is not null then
    perform private.enqueue_notification(
      v_registration.competition_season_id, v_participant.id, v_registration.id, v_dispute_id,
      null, null, v_template_id, 'email', v_participant.email,
      'Your Vult Fantasy case ' || v_case_reference || ' was received', v_body,
      'dispute:' || v_dispute_id::text || ':received:email', null,
      jsonb_build_object('event_key', 'dispute_received', 'delivery_policy', 'manual_until_provider_configured')
    );
  end if;

  if nullif(btrim(coalesce(v_participant.whatsapp_phone, v_participant.phone, '')), '') is not null then
    perform private.enqueue_notification(
      v_registration.competition_season_id, v_participant.id, v_registration.id, v_dispute_id,
      null, null, v_template_id, 'whatsapp', coalesce(v_participant.whatsapp_phone, v_participant.phone),
      null, v_body,
      'dispute:' || v_dispute_id::text || ':received:whatsapp', null,
      jsonb_build_object('event_key', 'dispute_received', 'delivery_policy', 'manual_until_provider_configured')
    );
  end if;

  v_access_token := private.issue_dispute_access_token(v_dispute_id);

  insert into public.audit_logs(action, entity_type, entity_id, metadata)
  values ('participant_dispute_submitted', 'dispute', v_dispute_id::text,
    jsonb_build_object('case_reference', v_case_reference, 'category', p_category));

  return jsonb_build_object(
    'case_reference', v_case_reference,
    'access_token', v_access_token,
    'status', 'open'
  );
end;
$$;

create or replace function public.create_dispute_public_access(
  p_case_reference text,
  p_contact text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispute public.disputes%rowtype;
  v_participant public.participants%rowtype;
  v_token text;
begin
  perform private.require_service_context();

  select * into v_dispute from public.disputes
  where upper(case_reference) = upper(btrim(coalesce(p_case_reference, '')))
  limit 1;
  if v_dispute.id is null then
    raise exception using message = 'The case reference or contact details are not valid.';
  end if;

  select * into v_participant from public.participants where id = v_dispute.participant_id;
  if not private.contact_matches_participant(v_participant, p_contact) then
    raise exception using message = 'The case reference or contact details are not valid.';
  end if;

  v_token := private.issue_dispute_access_token(v_dispute.id);
  return jsonb_build_object('case_reference', v_dispute.case_reference, 'access_token', v_token);
end;
$$;

create or replace function public.get_public_dispute_case(
  p_case_reference text,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispute_id uuid;
  v_result jsonb;
begin
  perform private.require_service_context();
  v_dispute_id := private.resolve_dispute_access(p_case_reference, p_access_token);

  select jsonb_build_object(
    'case_reference', d.case_reference,
    'category', d.category,
    'subject', d.subject,
    'status', d.status,
    'priority', d.priority,
    'decision', d.decision,
    'resolution_summary', d.resolution_summary,
    'created_at', d.created_at,
    'updated_at', d.updated_at,
    'last_activity_at', d.last_activity_at,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'author_type', m.author_type,
        'channel', m.channel,
        'message', m.message,
        'created_at', m.created_at
      ) order by m.created_at)
      from public.dispute_messages m
      where m.dispute_id = d.id and m.visibility = 'participant'
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'evidence_type', e.evidence_type,
        'external_url', e.external_url,
        'file_name', e.file_name,
        'notes', e.notes,
        'created_at', e.created_at
      ) order by e.created_at)
      from public.dispute_evidence e
      where e.dispute_id = d.id and e.visibility = 'participant'
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'subject', n.subject,
        'body', n.body,
        'status', n.status,
        'created_at', n.created_at
      ) order by n.created_at)
      from public.notification_outbox n
      where n.dispute_id = d.id and n.channel = 'in_app'
    ), '[]'::jsonb)
  ) into v_result
  from public.disputes d
  where d.id = v_dispute_id;

  return v_result;
end;
$$;

create or replace function public.reply_to_public_dispute(
  p_case_reference text,
  p_access_token text,
  p_message text,
  p_evidence_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispute public.disputes%rowtype;
  v_dispute_id uuid;
  v_message_id uuid;
  v_old_status text;
begin
  perform private.require_service_context();
  if char_length(btrim(coalesce(p_message, ''))) not between 2 and 10000 then
    raise exception using message = 'Reply must contain between 2 and 10,000 characters.';
  end if;
  if nullif(btrim(coalesce(p_evidence_url, '')), '') is not null and btrim(p_evidence_url) !~* '^https?://' then
    raise exception using message = 'Evidence URL must begin with http:// or https://.';
  end if;

  v_dispute_id := private.resolve_dispute_access(p_case_reference, p_access_token);
  select * into v_dispute from public.disputes where id = v_dispute_id for update;
  if v_dispute.status in ('resolved','rejected','closed') then
    raise exception using message = 'This case is closed to participant replies.';
  end if;

  insert into public.dispute_messages(dispute_id, author_type, channel, visibility, message)
  values (v_dispute_id, 'participant', 'in_app', 'participant', btrim(p_message))
  returning id into v_message_id;

  if nullif(btrim(coalesce(p_evidence_url, '')), '') is not null then
    insert into public.dispute_evidence(
      dispute_id, submitted_by_type, visibility, evidence_type, external_url, notes
    ) values (v_dispute_id, 'participant', 'participant', 'supporting_document', btrim(p_evidence_url), 'Evidence added with a participant reply.');
  end if;

  v_old_status := v_dispute.status;
  update public.disputes
  set status = case when status = 'awaiting_participant' then 'under_review' else status end,
      last_activity_at = now()
  where id = v_dispute_id;

  if v_old_status = 'awaiting_participant' then
    insert into public.dispute_status_history(
      dispute_id, from_status, to_status, action, actor_type, notes
    ) values (v_dispute_id, 'awaiting_participant', 'under_review', 'participant_replied', 'participant', 'Participant supplied the requested response.');
  end if;

  perform private.enqueue_notification(
    v_dispute.competition_season_id, v_dispute.participant_id, v_dispute.registration_id,
    v_dispute.id, null, null, null, 'in_app', 'admin:disputes',
    'Participant replied to ' || v_dispute.case_reference,
    'A participant added a reply to case ' || v_dispute.case_reference || '.',
    'dispute:' || v_dispute.id::text || ':participant_reply:' || v_message_id::text,
    null, jsonb_build_object('internal', true)
  );

  return jsonb_build_object('case_reference', v_dispute.case_reference, 'message_id', v_message_id);
end;
$$;

create or replace function public.save_announcement(
  p_announcement_id uuid,
  p_competition_season_id uuid,
  p_slug text,
  p_title text,
  p_summary text,
  p_body text,
  p_category text,
  p_audience text,
  p_is_pinned boolean,
  p_publish_at timestamptz,
  p_expires_at timestamptz,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_id uuid;
begin
  v_role := private.require_service_admin(p_requested_by, array['super_admin','content_manager']::text[]);
  if btrim(coalesce(p_slug, '')) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using message = 'Announcement slug is invalid.';
  end if;
  if p_category not in ('general','registration','gameweek','leaderboard','winner','payment','rules','maintenance') then
    raise exception using message = 'Announcement category is invalid.';
  end if;
  if p_audience not in ('public','participants','admins','all') then
    raise exception using message = 'Announcement audience is invalid.';
  end if;

  if p_announcement_id is null then
    insert into public.announcements(
      competition_season_id, slug, title, summary, body, category, audience,
      is_pinned, publish_at, expires_at, created_by, updated_by, metadata
    ) values (
      p_competition_season_id, btrim(p_slug), btrim(p_title), nullif(btrim(coalesce(p_summary, '')), ''),
      btrim(p_body), p_category, p_audience, coalesce(p_is_pinned, false), p_publish_at, p_expires_at,
      p_requested_by, p_requested_by, jsonb_build_object('last_editor_role', v_role)
    ) returning id into v_id;
  else
    update public.announcements
    set competition_season_id = p_competition_season_id,
        slug = btrim(p_slug), title = btrim(p_title),
        summary = nullif(btrim(coalesce(p_summary, '')), ''), body = btrim(p_body),
        category = p_category, audience = p_audience,
        is_pinned = coalesce(p_is_pinned, false), publish_at = p_publish_at,
        expires_at = p_expires_at, updated_by = p_requested_by,
        metadata = metadata || jsonb_build_object('last_editor_role', v_role)
    where id = p_announcement_id and status <> 'archived'
    returning id into v_id;
    if v_id is null then
      raise exception using message = 'Announcement was not found or is archived.';
    end if;
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_requested_by, 'announcement_saved', 'announcement', v_id::text,
    jsonb_build_object('slug', p_slug, 'audience', p_audience, 'actor_role', v_role));
  return v_id;
end;
$$;

create or replace function public.change_announcement_status(
  p_announcement_id uuid,
  p_action text,
  p_publish_at timestamptz,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_status text;
begin
  v_role := private.require_service_admin(p_requested_by, array['super_admin','content_manager']::text[]);
  if p_action not in ('publish','schedule','unpublish','archive') then
    raise exception using message = 'Announcement action is invalid.';
  end if;
  if p_action = 'schedule' and (p_publish_at is null or p_publish_at <= now()) then
    raise exception using message = 'A future publication time is required.';
  end if;

  v_status := case p_action
    when 'publish' then 'published'
    when 'schedule' then 'scheduled'
    when 'unpublish' then 'draft'
    else 'archived'
  end;

  update public.announcements
  set status = v_status,
      publish_at = case when p_action = 'publish' then now() when p_action = 'schedule' then p_publish_at else publish_at end,
      published_at = case when p_action = 'publish' then now() when p_action = 'unpublish' then null else published_at end,
      published_by = case when p_action = 'publish' then p_requested_by when p_action = 'unpublish' then null else published_by end,
      updated_by = p_requested_by
  where id = p_announcement_id;
  if not found then raise exception using message = 'Announcement not found.'; end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_requested_by, 'announcement_' || p_action, 'announcement', p_announcement_id::text,
    jsonb_build_object('status', v_status, 'actor_role', v_role));
  return p_announcement_id;
end;
$$;

create or replace function public.save_notification_template(
  p_template_id uuid,
  p_event_key text,
  p_name text,
  p_description text,
  p_subject_template text,
  p_body_template text,
  p_default_channels text[],
  p_status text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_id uuid;
begin
  v_role := private.require_service_admin(p_requested_by, array['super_admin','content_manager']::text[]);
  if btrim(coalesce(p_event_key, '')) !~ '^[a-z0-9_]+$' then raise exception using message = 'Template event key is invalid.'; end if;
  if p_status not in ('active','inactive') then raise exception using message = 'Template status is invalid.'; end if;
  if not coalesce(p_default_channels, '{}'::text[]) <@ array['email','whatsapp','in_app','manual']::text[] then
    raise exception using message = 'A template channel is invalid.';
  end if;

  if p_template_id is null then
    insert into public.notification_templates(event_key,name,description,subject_template,body_template,default_channels,status,created_by,updated_by)
    values (btrim(p_event_key),btrim(p_name),nullif(btrim(coalesce(p_description,'')),''),nullif(btrim(coalesce(p_subject_template,'')),''),btrim(p_body_template),p_default_channels,p_status,p_requested_by,p_requested_by)
    returning id into v_id;
  else
    update public.notification_templates
    set event_key=btrim(p_event_key), name=btrim(p_name), description=nullif(btrim(coalesce(p_description,'')),''),
        subject_template=nullif(btrim(coalesce(p_subject_template,'')),''), body_template=btrim(p_body_template),
        default_channels=p_default_channels, status=p_status, updated_by=p_requested_by
    where id=p_template_id returning id into v_id;
    if v_id is null then raise exception using message='Notification template not found.'; end if;
  end if;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
  values (p_requested_by,'notification_template_saved','notification_template',v_id::text,jsonb_build_object('event_key',p_event_key,'actor_role',v_role));
  return v_id;
end;
$$;

create or replace function public.queue_admin_notification(
  p_competition_season_id uuid,
  p_registration_id uuid,
  p_dispute_id uuid,
  p_channel text,
  p_recipient text,
  p_subject text,
  p_body text,
  p_scheduled_at timestamptz,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_registration public.registrations%rowtype;
  v_participant_id uuid;
  v_id uuid;
begin
  v_role := private.require_service_admin(p_requested_by, array['super_admin','content_manager','support_officer']::text[]);
  if p_registration_id is not null then
    select * into v_registration from public.registrations where id=p_registration_id;
    if v_registration.id is null then raise exception using message='Registration not found.'; end if;
    v_participant_id := v_registration.participant_id;
  end if;
  if p_channel not in ('email','whatsapp','in_app','manual') then raise exception using message='Notification channel is invalid.'; end if;

  v_id := private.enqueue_notification(
    coalesce(p_competition_season_id,v_registration.competition_season_id),v_participant_id,p_registration_id,p_dispute_id,
    null,null,null,p_channel,p_recipient,p_subject,p_body,
    'admin:'||p_requested_by::text||':'||encode(gen_random_bytes(12),'hex'),p_requested_by,
    jsonb_build_object('actor_role',v_role,'manual_composition',true)
  );
  if p_scheduled_at is not null and p_scheduled_at > now() then
    update public.notification_outbox set scheduled_at=p_scheduled_at,status='queued',sent_at=null where id=v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.record_notification_delivery(
  p_notification_id uuid,
  p_outcome text,
  p_delivery_method text,
  p_provider_message_id text,
  p_failure_reason text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_notification public.notification_outbox%rowtype;
  v_attempt integer;
begin
  v_role := private.require_service_admin(p_requested_by, array['super_admin','content_manager','support_officer']::text[]);
  if p_outcome not in ('sent','failed','cancelled','skipped') then raise exception using message='Delivery outcome is invalid.'; end if;
  if p_delivery_method not in ('manual','provider','in_app') then raise exception using message='Delivery method is invalid.'; end if;
  if p_outcome='failed' and char_length(btrim(coalesce(p_failure_reason,'')))<8 then raise exception using message='Failure reason must contain at least 8 characters.'; end if;

  select * into v_notification from public.notification_outbox where id=p_notification_id for update;
  if v_notification.id is null then raise exception using message='Notification not found.'; end if;
  if v_notification.status in ('sent','cancelled','skipped') then raise exception using message='This notification is already final.'; end if;
  select coalesce(max(attempt_number),0)+1 into v_attempt from public.notification_delivery_attempts where notification_id=p_notification_id;

  insert into public.notification_delivery_attempts(notification_id,attempt_number,delivery_method,outcome,provider_message_id,failure_reason,attempted_by,metadata)
  values (p_notification_id,v_attempt,p_delivery_method,p_outcome,nullif(btrim(coalesce(p_provider_message_id,'')),''),nullif(btrim(coalesce(p_failure_reason,'')),''),p_requested_by,jsonb_build_object('actor_role',v_role));

  update public.notification_outbox
  set status=p_outcome,
      sent_at=case when p_outcome='sent' then now() else sent_at end,
      provider_message_id=case when p_outcome='sent' then nullif(btrim(coalesce(p_provider_message_id,'')),'') else provider_message_id end,
      failure_reason=case when p_outcome='failed' then btrim(p_failure_reason) else null end
  where id=p_notification_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
  values (p_requested_by,'notification_delivery_recorded','notification',p_notification_id::text,jsonb_build_object('outcome',p_outcome,'channel',v_notification.channel,'actor_role',v_role));
  return p_notification_id;
end;
$$;

create or replace function public.assign_dispute(
  p_dispute_id uuid,
  p_assigned_to uuid,
  p_priority text,
  p_notes text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_dispute public.disputes%rowtype;
begin
  v_role := private.require_service_admin(p_requested_by,array['super_admin','support_officer']::text[]);
  if p_priority not in ('low','normal','high','urgent') then raise exception using message='Priority is invalid.'; end if;
  if char_length(btrim(coalesce(p_notes,'')))<8 then raise exception using message='Assignment notes must contain at least 8 characters.'; end if;
  if not exists(select 1 from public.admin_profiles where id=p_assigned_to and is_active) then raise exception using message='Assignee is not an active administrator.'; end if;
  select * into v_dispute from public.disputes where id=p_dispute_id for update;
  if v_dispute.id is null then raise exception using message='Dispute not found.'; end if;
  if v_dispute.status in ('resolved','rejected','closed') then raise exception using message='A final case cannot be assigned.'; end if;

  update public.disputes set assigned_to=p_assigned_to,priority=p_priority,status='assigned',last_activity_at=now() where id=p_dispute_id;
  insert into public.dispute_status_history(dispute_id,from_status,to_status,action,actor_type,actor_admin_id,notes,metadata)
  values(p_dispute_id,v_dispute.status,'assigned','case_assigned','admin',p_requested_by,btrim(p_notes),jsonb_build_object('assigned_to',p_assigned_to,'priority',p_priority,'actor_role',v_role));
  return p_dispute_id;
end;
$$;

create or replace function public.update_dispute_workflow(
  p_dispute_id uuid,
  p_status text,
  p_escalated_to uuid,
  p_notes text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_dispute public.disputes%rowtype;
begin
  v_role := private.require_service_admin(p_requested_by,array['super_admin','support_officer','competition_manager','compliance_officer','finance_officer']::text[]);
  if p_status not in ('assigned','under_review','awaiting_participant','escalated') then raise exception using message='Workflow status is invalid.'; end if;
  if char_length(btrim(coalesce(p_notes,'')))<8 then raise exception using message='Workflow notes must contain at least 8 characters.'; end if;
  select * into v_dispute from public.disputes where id=p_dispute_id for update;
  if v_dispute.id is null then raise exception using message='Dispute not found.'; end if;
  if v_dispute.status in ('resolved','rejected','closed') then raise exception using message='A final case cannot change workflow status.'; end if;
  if v_dispute.assigned_to is not null and v_dispute.assigned_to<>p_requested_by and v_role not in ('super_admin','support_officer') then
    raise exception using message='Only the assigned administrator or support management can update this case.';
  end if;
  if p_status='escalated' and not exists(select 1 from public.admin_profiles where id=p_escalated_to and is_active) then
    raise exception using message='An active escalation recipient is required.';
  end if;

  update public.disputes
  set status=p_status,escalated_to=case when p_status='escalated' then p_escalated_to else escalated_to end,last_activity_at=now()
  where id=p_dispute_id;
  insert into public.dispute_status_history(dispute_id,from_status,to_status,action,actor_type,actor_admin_id,notes,metadata)
  values(p_dispute_id,v_dispute.status,p_status,case when p_status='escalated' then 'case_escalated' else 'workflow_updated' end,'admin',p_requested_by,btrim(p_notes),jsonb_build_object('escalated_to',p_escalated_to,'actor_role',v_role));
  return p_dispute_id;
end;
$$;

create or replace function public.add_admin_dispute_message(
  p_dispute_id uuid,
  p_visibility text,
  p_channel text,
  p_message text,
  p_notify_email boolean,
  p_notify_whatsapp boolean,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_dispute public.disputes%rowtype;
  v_participant public.participants%rowtype;
  v_message_id uuid;
  v_template_id uuid;
  v_subject text;
begin
  v_role := private.require_service_admin(p_requested_by,array['super_admin','support_officer','competition_manager','compliance_officer','finance_officer']::text[]);
  if p_visibility not in ('participant','internal') then raise exception using message='Message visibility is invalid.'; end if;
  if p_channel not in ('in_app','email','whatsapp','phone','internal') then raise exception using message='Message channel is invalid.'; end if;
  if char_length(btrim(coalesce(p_message,''))) not between 2 and 10000 then raise exception using message='Message must contain between 2 and 10,000 characters.'; end if;
  select * into v_dispute from public.disputes where id=p_dispute_id for update;
  if v_dispute.id is null then raise exception using message='Dispute not found.'; end if;
  if v_dispute.status='closed' then raise exception using message='A closed case cannot receive new messages.'; end if;

  insert into public.dispute_messages(dispute_id,author_type,author_admin_id,channel,visibility,message)
  values(p_dispute_id,'admin',p_requested_by,p_channel,p_visibility,btrim(p_message)) returning id into v_message_id;
  update public.disputes set last_activity_at=now() where id=p_dispute_id;

  if p_visibility='participant' then
    select * into v_participant from public.participants where id=v_dispute.participant_id;
    select id into v_template_id from public.notification_templates where event_key='dispute_updated';
    v_subject := 'Update on Vult Fantasy case '||v_dispute.case_reference;
    perform private.enqueue_notification(v_dispute.competition_season_id,v_dispute.participant_id,v_dispute.registration_id,v_dispute.id,null,null,v_template_id,'in_app','registration:'||v_dispute.registration_id::text,v_subject,btrim(p_message),'dispute:'||v_dispute.id::text||':message:'||v_message_id::text||':in_app',p_requested_by,jsonb_build_object('actor_role',v_role));
    if coalesce(p_notify_email,false) and nullif(btrim(coalesce(v_participant.email,'')),'') is not null then
      perform private.enqueue_notification(v_dispute.competition_season_id,v_dispute.participant_id,v_dispute.registration_id,v_dispute.id,null,null,v_template_id,'email',v_participant.email,v_subject,btrim(p_message),'dispute:'||v_dispute.id::text||':message:'||v_message_id::text||':email',p_requested_by,jsonb_build_object('delivery_policy','manual_until_provider_configured'));
    end if;
    if coalesce(p_notify_whatsapp,false) and nullif(btrim(coalesce(v_participant.whatsapp_phone,v_participant.phone,'')),'') is not null then
      perform private.enqueue_notification(v_dispute.competition_season_id,v_dispute.participant_id,v_dispute.registration_id,v_dispute.id,null,null,v_template_id,'whatsapp',coalesce(v_participant.whatsapp_phone,v_participant.phone),null,btrim(p_message),'dispute:'||v_dispute.id::text||':message:'||v_message_id::text||':whatsapp',p_requested_by,jsonb_build_object('delivery_policy','manual_until_provider_configured'));
    end if;
  end if;
  return v_message_id;
end;
$$;

create or replace function public.add_admin_dispute_evidence(
  p_dispute_id uuid,
  p_visibility text,
  p_evidence_type text,
  p_storage_path text,
  p_external_url text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_notes text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_id uuid;
begin
  v_role := private.require_service_admin(p_requested_by,array['super_admin','support_officer','competition_manager','compliance_officer','finance_officer']::text[]);
  if p_visibility not in ('participant','internal') then raise exception using message='Evidence visibility is invalid.'; end if;
  if p_evidence_type not in ('supporting_document','screenshot','statement','payment_receipt','score_evidence','other') then raise exception using message='Evidence type is invalid.'; end if;
  if not exists(select 1 from public.disputes where id=p_dispute_id) then raise exception using message='Dispute not found.'; end if;
  if nullif(btrim(coalesce(p_storage_path,'')),'') is null and nullif(btrim(coalesce(p_external_url,'')),'') is null then raise exception using message='Provide a storage path or external evidence URL.'; end if;
  if nullif(btrim(coalesce(p_external_url,'')),'') is not null and btrim(p_external_url)!~*'^https?://' then raise exception using message='Evidence URL must begin with http:// or https://.'; end if;
  insert into public.dispute_evidence(dispute_id,submitted_by_type,submitted_by_admin,visibility,evidence_type,storage_path,external_url,file_name,mime_type,size_bytes,notes)
  values(p_dispute_id,'admin',p_requested_by,p_visibility,p_evidence_type,nullif(btrim(coalesce(p_storage_path,'')),''),nullif(btrim(coalesce(p_external_url,'')),''),nullif(btrim(coalesce(p_file_name,'')),''),nullif(btrim(coalesce(p_mime_type,'')),''),p_size_bytes,nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_id;
  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
  values(p_requested_by,'dispute_evidence_added','dispute_evidence',v_id::text,jsonb_build_object('dispute_id',p_dispute_id,'visibility',p_visibility,'actor_role',v_role));
  return v_id;
end;
$$;

create or replace function public.resolve_dispute(
  p_dispute_id uuid,
  p_decision text,
  p_resolution_summary text,
  p_notify_email boolean,
  p_notify_whatsapp boolean,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_dispute public.disputes%rowtype;
  v_allowed boolean;
  v_new_status text;
  v_participant public.participants%rowtype;
  v_template_id uuid;
  v_message_id uuid;
  v_subject text;
begin
  v_role := private.require_service_admin(p_requested_by,array['super_admin','support_officer','competition_manager','compliance_officer','finance_officer']::text[]);
  if p_decision not in ('upheld','partially_upheld','rejected','no_action','withdrawn') then raise exception using message='Decision is invalid.'; end if;
  if char_length(btrim(coalesce(p_resolution_summary,'')))<20 then raise exception using message='Resolution summary must contain at least 20 characters.'; end if;
  select * into v_dispute from public.disputes where id=p_dispute_id for update;
  if v_dispute.id is null then raise exception using message='Dispute not found.'; end if;
  if v_dispute.status in ('resolved','rejected','closed') then raise exception using message='This case already has a final decision.'; end if;

  v_allowed := v_role='super_admin' or
    (v_dispute.category in ('registration','eligibility') and v_role='compliance_officer') or
    (v_dispute.category in ('score','winner') and v_role='competition_manager') or
    (v_dispute.category='payment' and v_role='finance_officer') or
    (v_dispute.category='other' and v_role='support_officer');
  if not v_allowed then raise exception using message='Your role cannot issue the final decision for this case category.'; end if;

  v_new_status := case when p_decision='rejected' then 'rejected' else 'resolved' end;
  update public.disputes
  set status=v_new_status,decision=p_decision,resolution_summary=btrim(p_resolution_summary),resolved_by=p_requested_by,resolved_at=now(),last_activity_at=now()
  where id=p_dispute_id;
  insert into public.dispute_status_history(dispute_id,from_status,to_status,action,actor_type,actor_admin_id,notes,metadata)
  values(p_dispute_id,v_dispute.status,v_new_status,'case_decided','admin',p_requested_by,btrim(p_resolution_summary),jsonb_build_object('decision',p_decision,'actor_role',v_role));
  insert into public.dispute_messages(dispute_id,author_type,author_admin_id,channel,visibility,message)
  values(p_dispute_id,'admin',p_requested_by,'in_app','participant',btrim(p_resolution_summary)) returning id into v_message_id;

  select * into v_participant from public.participants where id=v_dispute.participant_id;
  select id into v_template_id from public.notification_templates where event_key='dispute_resolved';
  v_subject := 'Decision on Vult Fantasy case '||v_dispute.case_reference;
  perform private.enqueue_notification(v_dispute.competition_season_id,v_dispute.participant_id,v_dispute.registration_id,v_dispute.id,null,null,v_template_id,'in_app','registration:'||v_dispute.registration_id::text,v_subject,btrim(p_resolution_summary),'dispute:'||v_dispute.id::text||':resolution:'||v_message_id::text||':in_app',p_requested_by,jsonb_build_object('decision',p_decision));
  if coalesce(p_notify_email,false) and nullif(btrim(coalesce(v_participant.email,'')),'') is not null then
    perform private.enqueue_notification(v_dispute.competition_season_id,v_dispute.participant_id,v_dispute.registration_id,v_dispute.id,null,null,v_template_id,'email',v_participant.email,v_subject,btrim(p_resolution_summary),'dispute:'||v_dispute.id::text||':resolution:'||v_message_id::text||':email',p_requested_by,jsonb_build_object('delivery_policy','manual_until_provider_configured'));
  end if;
  if coalesce(p_notify_whatsapp,false) and nullif(btrim(coalesce(v_participant.whatsapp_phone,v_participant.phone,'')),'') is not null then
    perform private.enqueue_notification(v_dispute.competition_season_id,v_dispute.participant_id,v_dispute.registration_id,v_dispute.id,null,null,v_template_id,'whatsapp',coalesce(v_participant.whatsapp_phone,v_participant.phone),null,btrim(p_resolution_summary),'dispute:'||v_dispute.id::text||':resolution:'||v_message_id::text||':whatsapp',p_requested_by,jsonb_build_object('delivery_policy','manual_until_provider_configured'));
  end if;
  return p_dispute_id;
end;
$$;

create or replace function public.close_dispute(
  p_dispute_id uuid,
  p_notes text,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_dispute public.disputes%rowtype;
begin
  v_role := private.require_service_admin(p_requested_by,array['super_admin','support_officer']::text[]);
  if char_length(btrim(coalesce(p_notes,'')))<8 then raise exception using message='Closure notes must contain at least 8 characters.'; end if;
  select * into v_dispute from public.disputes where id=p_dispute_id for update;
  if v_dispute.id is null then raise exception using message='Dispute not found.'; end if;
  if v_dispute.status not in ('resolved','rejected') then raise exception using message='Only a decided case can be closed.'; end if;
  update public.disputes set status='closed',closed_by=p_requested_by,closed_at=now(),last_activity_at=now() where id=p_dispute_id;
  insert into public.dispute_status_history(dispute_id,from_status,to_status,action,actor_type,actor_admin_id,notes,metadata)
  values(p_dispute_id,v_dispute.status,'closed','case_closed','admin',p_requested_by,btrim(p_notes),jsonb_build_object('actor_role',v_role));
  return p_dispute_id;
end;
$$;

revoke all on function public.submit_participant_dispute(text,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.create_dispute_public_access(text,text) from public, anon, authenticated;
revoke all on function public.get_public_dispute_case(text,text) from public, anon, authenticated;
revoke all on function public.reply_to_public_dispute(text,text,text,text) from public, anon, authenticated;
revoke all on function public.save_announcement(uuid,uuid,text,text,text,text,text,text,boolean,timestamptz,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.change_announcement_status(uuid,text,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.save_notification_template(uuid,text,text,text,text,text,text[],text,uuid) from public, anon, authenticated;
revoke all on function public.queue_admin_notification(uuid,uuid,uuid,text,text,text,text,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.record_notification_delivery(uuid,text,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.assign_dispute(uuid,uuid,text,text,uuid) from public, anon, authenticated;
revoke all on function public.update_dispute_workflow(uuid,text,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.add_admin_dispute_message(uuid,text,text,text,boolean,boolean,uuid) from public, anon, authenticated;
revoke all on function public.add_admin_dispute_evidence(uuid,text,text,text,text,text,text,bigint,text,uuid) from public, anon, authenticated;
revoke all on function public.resolve_dispute(uuid,text,text,boolean,boolean,uuid) from public, anon, authenticated;
revoke all on function public.close_dispute(uuid,text,uuid) from public, anon, authenticated;

grant execute on function public.submit_participant_dispute(text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.create_dispute_public_access(text,text) to service_role;
grant execute on function public.get_public_dispute_case(text,text) to service_role;
grant execute on function public.reply_to_public_dispute(text,text,text,text) to service_role;
grant execute on function public.save_announcement(uuid,uuid,text,text,text,text,text,text,boolean,timestamptz,timestamptz,uuid) to service_role;
grant execute on function public.change_announcement_status(uuid,text,timestamptz,uuid) to service_role;
grant execute on function public.save_notification_template(uuid,text,text,text,text,text,text[],text,uuid) to service_role;
grant execute on function public.queue_admin_notification(uuid,uuid,uuid,text,text,text,text,timestamptz,uuid) to service_role;
grant execute on function public.record_notification_delivery(uuid,text,text,text,text,uuid) to service_role;
grant execute on function public.assign_dispute(uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.update_dispute_workflow(uuid,text,uuid,text,uuid) to service_role;
grant execute on function public.add_admin_dispute_message(uuid,text,text,text,boolean,boolean,uuid) to service_role;
grant execute on function public.add_admin_dispute_evidence(uuid,text,text,text,text,text,text,bigint,text,uuid) to service_role;
grant execute on function public.resolve_dispute(uuid,text,text,boolean,boolean,uuid) to service_role;
grant execute on function public.close_dispute(uuid,text,uuid) to service_role;
