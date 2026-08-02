create or replace function public.search_admin_audit_history(
  p_requested_by uuid,
  p_search text default null,
  p_action text default null,
  p_entity_type text default null,
  p_actor_user_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_limit integer := least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer := greatest(coalesce(p_offset,0),0);
  v_search text := nullif(left(btrim(coalesce(p_search,'')),160),'');
begin
  v_role := private.require_service_admin(p_requested_by, array['super_admin','auditor']::text[]);

  return (
    with filtered as (
      select al.id, al.actor_user_id, ap.full_name as actor_name, ap.role as actor_role,
             al.action, al.entity_type, al.entity_id, al.metadata, al.created_at
      from public.audit_logs al
      left join public.admin_profiles ap on ap.id = al.actor_user_id
      where (p_action is null or al.action = p_action)
        and (p_entity_type is null or al.entity_type = p_entity_type)
        and (p_actor_user_id is null or al.actor_user_id = p_actor_user_id)
        and (p_from is null or al.created_at >= p_from)
        and (p_to is null or al.created_at < p_to)
        and (
          v_search is null
          or al.action ilike '%' || v_search || '%'
          or al.entity_type ilike '%' || v_search || '%'
          or coalesce(al.entity_id,'') ilike '%' || v_search || '%'
          or coalesce(ap.full_name,'System') ilike '%' || v_search || '%'
          or al.metadata::text ilike '%' || v_search || '%'
        )
    ), paged as (
      select * from filtered order by created_at desc, id desc limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'requested_role', v_role,
      'total', (select count(*) from filtered),
      'limit', v_limit,
      'offset', v_offset,
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'actor_user_id', p.actor_user_id,
        'actor_name', coalesce(p.actor_name,'System'),
        'actor_role', p.actor_role,
        'action', p.action,
        'entity_type', p.entity_type,
        'entity_id', p.entity_id,
        'metadata', p.metadata,
        'created_at', p.created_at
      ) order by p.created_at desc, p.id desc) from paged p), '[]'::jsonb),
      'actions', coalesce((select jsonb_agg(action order by action) from (select distinct action from public.audit_logs) a), '[]'::jsonb),
      'entity_types', coalesce((select jsonb_agg(entity_type order by entity_type) from (select distinct entity_type from public.audit_logs) e), '[]'::jsonb),
      'actors', coalesce((select jsonb_agg(jsonb_build_object('id',ap.id,'name',ap.full_name,'role',ap.role) order by ap.full_name) from public.admin_profiles ap where ap.is_active=true), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.record_report_export(
  p_report_type text,
  p_competition_season_id uuid,
  p_export_format text,
  p_filters jsonb,
  p_row_count integer,
  p_requested_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_export_id uuid;
begin
  v_role := private.require_service_admin(
    p_requested_by,
    array['super_admin','competition_manager','compliance_officer','finance_officer','content_manager','support_officer','auditor']::text[]
  );
  if p_report_type not in ('season_summary','operations','participant_retention','prize_spending','audit_history') then
    raise exception using message='Report type is invalid.';
  end if;
  if p_export_format <> 'csv' then raise exception using message='Export format is invalid.'; end if;
  if coalesce(p_row_count,0) < 0 then raise exception using message='Row count is invalid.'; end if;
  if p_report_type = 'audit_history' and v_role not in ('super_admin','auditor') then
    raise exception using message='This role cannot export audit history.';
  end if;
  if p_competition_season_id is not null and not exists (select 1 from public.competition_seasons where id=p_competition_season_id) then
    raise exception using message='Competition season not found.';
  end if;

  insert into public.report_exports(requested_by,competition_season_id,report_type,export_format,filters,row_count)
  values (p_requested_by,p_competition_season_id,p_report_type,p_export_format,coalesce(p_filters,'{}'::jsonb),coalesce(p_row_count,0))
  returning id into v_export_id;

  insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
  values (p_requested_by,'report_exported','report_export',v_export_id::text,jsonb_build_object(
    'report_type',p_report_type,'competition_season_id',p_competition_season_id,'format',p_export_format,'row_count',coalesce(p_row_count,0),'actor_role',v_role
  ));

  return v_export_id;
end;
$$;

create or replace function public.get_report_export_history(
  p_requested_by uuid,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_limit integer := least(greatest(coalesce(p_limit,25),1),100);
begin
  v_role := private.require_service_admin(
    p_requested_by,
    array['super_admin','competition_manager','compliance_officer','finance_officer','content_manager','support_officer','auditor']::text[]
  );
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id,
      'report_type', x.report_type,
      'export_format', x.export_format,
      'row_count', x.row_count,
      'filters', x.filters,
      'created_at', x.created_at,
      'requested_by', x.requested_by,
      'requested_by_name', x.requested_by_name,
      'requested_by_role', x.requested_by_role,
      'competition_season_id', x.competition_season_id,
      'competition_season_name', x.competition_season_name
    ) order by x.created_at desc), '[]'::jsonb)
    from (
      select re.*, ap.full_name as requested_by_name, ap.role as requested_by_role, cs.name as competition_season_name
      from public.report_exports re
      join public.admin_profiles ap on ap.id = re.requested_by
      left join public.competition_seasons cs on cs.id = re.competition_season_id
      where v_role in ('super_admin','auditor') or re.requested_by = p_requested_by
      order by re.created_at desc
      limit v_limit
    ) x
  );
end;
$$;

revoke all on function public.search_admin_audit_history(uuid,text,text,text,uuid,timestamptz,timestamptz,integer,integer) from public, anon, authenticated;
revoke all on function public.record_report_export(text,uuid,text,jsonb,integer,uuid) from public, anon, authenticated;
revoke all on function public.get_report_export_history(uuid,integer) from public, anon, authenticated;
grant execute on function public.search_admin_audit_history(uuid,text,text,text,uuid,timestamptz,timestamptz,integer,integer) to service_role;
grant execute on function public.record_report_export(text,uuid,text,jsonb,integer,uuid) to service_role;
grant execute on function public.get_report_export_history(uuid,integer) to service_role;
