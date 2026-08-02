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
  v_is_internal_admin_notice boolean;
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

  v_is_internal_admin_notice := p_channel = 'in_app' and p_recipient like 'admin:%';
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
    p_idempotency_key, p_created_by,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('internal_admin_notice', v_is_internal_admin_notice)
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
      where n.dispute_id = d.id
        and n.channel = 'in_app'
        and n.status = 'sent'
        and n.recipient = 'registration:' || d.registration_id::text
        and coalesce((n.metadata ->> 'internal_admin_notice')::boolean, false) = false
    ), '[]'::jsonb)
  ) into v_result
  from public.disputes d
  where d.id = v_dispute_id;

  return v_result;
end;
$$;
