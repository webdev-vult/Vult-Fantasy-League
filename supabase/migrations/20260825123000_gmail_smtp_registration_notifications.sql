insert into public.notification_templates(event_key,name,description,subject_template,body_template,default_channels,status)
values
  ('registration_approved','Registration approved','Sent after an administrator approves a participant.','Your Vult EPL Fantasy entry has been approved','Hello {{participant_name}},\n\nYour entry into {{season_name}} has been approved.\n\nTeam: {{fpl_team_name}}\nManager: {{fpl_manager_name}}\nReference: {{registration_reference}}\n\nLeaderboard: {{leaderboard_url}}\nFixtures: {{fixtures_url}}\n\nIf you are selected as a weekly, monthly or overall winner, Vult KYC Level 1 must be confirmed before the prize can be awarded.\n\nVult EPL Fantasy',array['email'],'active'),
  ('registration_rejected','Registration rejected','Sent after an administrator rejects a registration.','Update about your Vult EPL Fantasy registration','Hello {{participant_name}},\n\nYour registration {{registration_reference}} for {{season_name}} was not approved.\n\nReason: {{reason}}\n\nPlease contact Vult support if you need assistance.\n\nVult EPL Fantasy',array['email'],'active'),
  ('registration_suspended','Registration suspended','Sent when an approved registration is suspended.','Your Vult EPL Fantasy entry has been suspended','Hello {{participant_name}},\n\nYour entry {{registration_reference}} for {{season_name}} has been suspended.\n\nReason: {{reason}}\n\nPlease contact Vult support if you need assistance.\n\nVult EPL Fantasy',array['email'],'active'),
  ('registration_disqualified','Registration disqualified','Sent when a registration is disqualified.','Your Vult EPL Fantasy entry has been disqualified','Hello {{participant_name}},\n\nYour entry {{registration_reference}} for {{season_name}} has been disqualified.\n\nReason: {{reason}}\n\nPlease review the competition rules or contact Vult support.\n\nRules: {{rules_url}}\n\nVult EPL Fantasy',array['email'],'active')
on conflict (event_key) do update set
  name=excluded.name,
  description=excluded.description,
  subject_template=excluded.subject_template,
  body_template=excluded.body_template,
  default_channels=excluded.default_channels,
  status='active',
  updated_at=now();

update public.notification_templates
set name='Registration received',
    description='Sent immediately after a successful public registration.',
    subject_template='Vult EPL Fantasy registration received — {{registration_reference}}',
    body_template='Hello {{participant_name}},\n\nYour registration for {{season_name}} has been received.\n\nTeam: {{fpl_team_name}}\nManager: {{fpl_manager_name}}\nReference: {{registration_reference}}\n\nYour entry is awaiting review. We will email you when it is approved or if more information is required.\n\nVult EPL Fantasy',
    default_channels=array['email'],
    status='active',
    updated_at=now()
where event_key='registration_received';

create or replace function public.record_provider_notification_delivery(
  p_notification_id uuid,
  p_outcome text,
  p_provider_message_id text,
  p_failure_reason text,
  p_requested_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_notification public.notification_outbox%rowtype;
  v_attempt integer;
begin
  perform private.require_service_context();
  if p_outcome not in ('sent','failed') then raise exception using message='Provider outcome is invalid.'; end if;
  select * into v_notification from public.notification_outbox where id=p_notification_id for update;
  if v_notification.id is null then raise exception using message='Notification not found.'; end if;
  if v_notification.channel <> 'email' then raise exception using message='Provider delivery only supports email.'; end if;
  if v_notification.status in ('sent','cancelled','skipped') then raise exception using message='This notification is already final.'; end if;
  if p_outcome='sent' and nullif(btrim(coalesce(p_provider_message_id,'')),'') is null then raise exception using message='Provider message ID is required.'; end if;
  if p_outcome='failed' and nullif(btrim(coalesce(p_failure_reason,'')),'') is null then raise exception using message='Failure reason is required.'; end if;

  select coalesce(max(attempt_number),0)+1 into v_attempt from public.notification_delivery_attempts where notification_id=p_notification_id;
  insert into public.notification_delivery_attempts(notification_id,attempt_number,delivery_method,outcome,provider_message_id,failure_reason,attempted_by,metadata)
  values(p_notification_id,v_attempt,'provider',p_outcome,nullif(btrim(coalesce(p_provider_message_id,'')),''),nullif(btrim(coalesce(p_failure_reason,'')),''),p_requested_by,jsonb_build_object('provider','gmail_smtp'));

  update public.notification_outbox
  set status=p_outcome,
      sent_at=case when p_outcome='sent' then now() else sent_at end,
      provider_message_id=case when p_outcome='sent' then btrim(p_provider_message_id) else provider_message_id end,
      failure_reason=case when p_outcome='failed' then btrim(p_failure_reason) else null end,
      metadata=metadata || jsonb_build_object('delivery_provider','gmail_smtp')
  where id=p_notification_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
  values(p_requested_by,'notification_provider_delivery_recorded','notification',p_notification_id::text,jsonb_build_object('outcome',p_outcome,'provider','gmail_smtp'));
  return p_notification_id;
end;
$$;

revoke all on function public.record_provider_notification_delivery(uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.record_provider_notification_delivery(uuid,text,text,text,uuid) to service_role;

