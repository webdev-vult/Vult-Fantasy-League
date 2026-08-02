create index if not exists announcements_created_by_idx on public.announcements(created_by);
create index if not exists announcements_updated_by_idx on public.announcements(updated_by);
create index if not exists announcements_published_by_idx on public.announcements(published_by);
create index if not exists notification_templates_created_by_idx on public.notification_templates(created_by);
create index if not exists notification_templates_updated_by_idx on public.notification_templates(updated_by);
create index if not exists disputes_resolved_by_idx on public.disputes(resolved_by);
create index if not exists disputes_closed_by_idx on public.disputes(closed_by);
create index if not exists notification_outbox_season_idx on public.notification_outbox(competition_season_id);

drop policy if exists dispute_public_access_tokens_service_managed on public.dispute_public_access_tokens;
create policy dispute_public_access_tokens_service_managed
on public.dispute_public_access_tokens
for select
to authenticated
using (false);

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
  if v_notification.scheduled_at > now() and p_outcome='sent' then raise exception using message='Delivery cannot be confirmed before the scheduled time.'; end if;
  if p_outcome='sent' and v_notification.channel in ('email','whatsapp') and nullif(btrim(coalesce(p_provider_message_id,'')),'') is null then
    raise exception using message='A delivery reference is required for a sent email or WhatsApp record.';
  end if;
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
