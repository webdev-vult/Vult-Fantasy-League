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
      publish_at = case when p_action = 'publish' then now() when p_action = 'schedule' then p_publish_at when p_action = 'unpublish' then null else publish_at end,
      published_at = case when p_action = 'publish' then now() when p_action in ('schedule','unpublish') then null else published_at end,
      published_by = case when p_action = 'publish' then p_requested_by when p_action in ('schedule','unpublish') then null else published_by end,
      updated_by = p_requested_by
  where id = p_announcement_id and status <> 'archived';
  if not found then raise exception using message = 'Announcement not found or archived.'; end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
  values (p_requested_by, 'announcement_' || p_action, 'announcement', p_announcement_id::text,
    jsonb_build_object('status', v_status, 'actor_role', v_role));
  return p_announcement_id;
end;
$$;
