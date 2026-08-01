create or replace function public.persist_provider_batch(
  p_competition_season_id uuid,
  p_provider text,
  p_trigger_source text,
  p_source_label text,
  p_source_endpoint text,
  p_idempotency_key text,
  p_response_hash text,
  p_response_data jsonb,
  p_records jsonb,
  p_errors jsonb default '[]'::jsonb,
  p_parent_run_id uuid default null,
  p_requested_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_existing public.provider_sync_runs%rowtype;
  v_snapshot_id uuid;
  v_settings public.fantasy_provider_settings%rowtype;
  v_parent public.provider_sync_runs%rowtype;
  v_attempt integer := 1;
  v_record jsonb;
  v_error jsonb;
  v_raw_count integer := 0;
  v_accepted_count integer := 0;
  v_rejected_count integer := 0;
  v_warning_count integer := 0;
  v_final_status text;
  v_jwt_role text := coalesce((select auth.jwt() ->> 'role'), '');
begin
  if v_jwt_role <> 'service_role' then
    raise exception using message = 'Provider persistence is restricted to the server service role.';
  end if;

  if p_trigger_source in ('manual', 'csv_upload', 'retry')
    and p_requested_by is null
  then
    raise exception using message = 'A requesting administrator is required for this provider run.';
  end if;

  if p_requested_by is not null and not exists (
    select 1
    from public.admin_profiles ap
    where ap.id = p_requested_by
      and ap.is_active = true
      and ap.role in ('super_admin', 'competition_manager')
  ) then
    raise exception using message = 'The requesting administrator is not allowed to persist provider data.';
  end if;

  if p_provider not in ('mock', 'csv', 'approved_fpl', 'licensed') then
    raise exception using message = 'Invalid provider.';
  end if;

  if p_trigger_source not in ('manual', 'csv_upload', 'scheduled', 'retry', 'system_test') then
    raise exception using message = 'Invalid trigger source.';
  end if;

  if nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
    or char_length(p_idempotency_key) > 240
  then
    raise exception using message = 'A valid idempotency key is required.';
  end if;

  if nullif(btrim(coalesce(p_source_endpoint, '')), '') is null
    or char_length(p_source_endpoint) > 500
  then
    raise exception using message = 'A valid provider source endpoint is required.';
  end if;

  if nullif(btrim(coalesce(p_response_hash, '')), '') is not null
    and lower(p_response_hash) !~ '^[0-9a-f]{64}$'
  then
    raise exception using message = 'The provider response hash must be a SHA-256 hexadecimal value.';
  end if;

  if jsonb_typeof(p_records) <> 'array'
    or jsonb_typeof(p_errors) <> 'array'
  then
    raise exception using message = 'Provider records and errors must be JSON arrays.';
  end if;

  v_raw_count := jsonb_array_length(p_records);
  if v_raw_count = 0 then
    raise exception using message = 'The provider batch contains no records.';
  end if;

  if v_raw_count > 5000 then
    raise exception using message = 'A provider batch cannot exceed 5,000 records.';
  end if;

  if jsonb_array_length(p_errors) > 10000 then
    raise exception using message = 'A provider batch cannot exceed 10,000 error records.';
  end if;

  select * into v_existing
  from public.provider_sync_runs
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.competition_season_id is distinct from p_competition_season_id
      or v_existing.provider is distinct from p_provider
      or v_existing.response_hash is distinct from nullif(btrim(coalesce(p_response_hash, '')), '')
    then
      raise exception using message = 'The idempotency key is already associated with a different provider batch.';
    end if;

    return v_existing.id;
  end if;

  select * into v_settings
  from public.fantasy_provider_settings
  where competition_season_id = p_competition_season_id;

  if not found then
    raise exception using message = 'Provider settings were not found.';
  end if;

  if not v_settings.is_enabled then
    raise exception using message = 'Provider ingestion is disabled.';
  end if;

  if v_settings.provider <> p_provider then
    raise exception using message = 'The batch provider does not match the configured provider.';
  end if;

  if p_provider = 'csv' and p_trigger_source = 'scheduled' then
    raise exception using message = 'CSV providers cannot run on a schedule.';
  end if;

  if p_parent_run_id is not null then
    select * into v_parent
    from public.provider_sync_runs
    where id = p_parent_run_id
      and competition_season_id = p_competition_season_id;

    if not found then
      raise exception using message = 'Parent sync run not found.';
    end if;

    if v_parent.provider <> p_provider then
      raise exception using message = 'A retry must use the same provider as its parent run.';
    end if;

    if v_parent.status not in ('failed', 'partial') then
      raise exception using message = 'Only failed or partial provider runs can be retried.';
    end if;

    v_attempt := v_parent.attempt_number + 1;
    if v_attempt > v_settings.max_attempts then
      raise exception using message = 'Maximum retry attempts reached.';
    end if;
  elsif p_trigger_source = 'retry' then
    raise exception using message = 'A retry requires a parent sync run.';
  end if;

  insert into public.provider_sync_runs (
    competition_season_id,
    provider,
    trigger_source,
    status,
    idempotency_key,
    parent_run_id,
    attempt_number,
    requested_by,
    source_label,
    response_hash,
    metadata
  ) values (
    p_competition_season_id,
    p_provider,
    p_trigger_source,
    'running',
    p_idempotency_key,
    p_parent_run_id,
    v_attempt,
    p_requested_by,
    nullif(btrim(coalesce(p_source_label, '')), ''),
    nullif(btrim(coalesce(p_response_hash, '')), ''),
    jsonb_build_object('source_endpoint', p_source_endpoint)
  )
  returning id into v_run_id;

  begin
    select
      count(*) filter (
        where value->>'validation_status' in ('valid', 'warning')
      ),
      count(*) filter (
        where value->>'validation_status' = 'rejected'
      ),
      count(*) filter (
        where value->>'validation_status' = 'warning'
      )
    into v_accepted_count, v_rejected_count, v_warning_count
    from jsonb_array_elements(p_records);

    insert into public.score_snapshots (
      competition_season_id,
      source_endpoint,
      request_key,
      response_data,
      response_hash,
      http_status,
      provider,
      sync_run_id,
      payload_type,
      validation_status,
      metadata
    ) values (
      p_competition_season_id,
      p_source_endpoint,
      p_idempotency_key,
      coalesce(p_response_data, '{}'::jsonb),
      nullif(btrim(coalesce(p_response_hash, '')), ''),
      200,
      p_provider,
      v_run_id,
      'round_scores',
      'pending',
      jsonb_build_object(
        'source_label', p_source_label,
        'record_count', v_raw_count
      )
    )
    returning id into v_snapshot_id;

    for v_record in
      select value from jsonb_array_elements(p_records)
    loop
      insert into public.provider_score_records (
        sync_run_id,
        snapshot_id,
        competition_season_id,
        fantasy_entry_id,
        registration_id,
        round_id,
        provider,
        provider_entry_id,
        external_round_id,
        manager_name,
        team_name,
        reported_points,
        total_points,
        transfer_cost,
        chip_used,
        round_rank,
        overall_rank,
        is_provisional,
        validation_status,
        validation_errors,
        raw_record
      ) values (
        v_run_id,
        v_snapshot_id,
        p_competition_season_id,
        nullif(v_record->>'fantasy_entry_id', '')::uuid,
        nullif(v_record->>'registration_id', '')::uuid,
        nullif(v_record->>'round_id', '')::uuid,
        p_provider,
        nullif(v_record->>'provider_entry_id', ''),
        nullif(v_record->>'external_round_id', '')::integer,
        nullif(v_record->>'manager_name', ''),
        nullif(v_record->>'team_name', ''),
        nullif(v_record->>'reported_points', '')::integer,
        nullif(v_record->>'total_points', '')::integer,
        coalesce(nullif(v_record->>'transfer_cost', '')::integer, 0),
        nullif(v_record->>'chip_used', ''),
        nullif(v_record->>'round_rank', '')::bigint,
        nullif(v_record->>'overall_rank', '')::bigint,
        coalesce((v_record->>'is_provisional')::boolean, true),
        v_record->>'validation_status',
        coalesce(v_record->'validation_errors', '[]'::jsonb),
        coalesce(v_record->'raw_record', '{}'::jsonb)
      );
    end loop;

    for v_error in
      select value from jsonb_array_elements(p_errors)
    loop
      insert into public.provider_sync_errors (
        sync_run_id,
        competition_season_id,
        provider,
        provider_entry_id,
        external_round_id,
        stage,
        error_code,
        message,
        retriable,
        attempt_number,
        details
      ) values (
        v_run_id,
        p_competition_season_id,
        p_provider,
        nullif(v_error->>'provider_entry_id', ''),
        nullif(v_error->>'external_round_id', '')::integer,
        coalesce(nullif(v_error->>'stage', ''), 'validation'),
        coalesce(nullif(v_error->>'error_code', ''), 'provider_error'),
        coalesce(
          nullif(v_error->>'message', ''),
          'Provider record requires review.'
        ),
        coalesce((v_error->>'retriable')::boolean, false),
        v_attempt,
        coalesce(v_error->'details', '{}'::jsonb)
      );
    end loop;

    update public.fantasy_entries
    set last_synced_at = now()
    where id in (
      select distinct nullif(value->>'fantasy_entry_id', '')::uuid
      from jsonb_array_elements(p_records)
      where value->>'validation_status' in ('valid', 'warning')
        and nullif(value->>'fantasy_entry_id', '') is not null
    );

    v_final_status := case
      when v_accepted_count = 0 then 'failed'
      when v_rejected_count > 0 then 'partial'
      else 'succeeded'
    end;

    update public.score_snapshots
    set validation_status = case
          when v_final_status = 'succeeded' then 'valid'
          when v_final_status = 'partial' then 'partial'
          else 'invalid'
        end,
        validated_at = now()
    where id = v_snapshot_id;

    update public.provider_sync_runs
    set status = v_final_status,
        raw_record_count = v_raw_count,
        accepted_record_count = v_accepted_count,
        rejected_record_count = v_rejected_count,
        warning_count = v_warning_count,
        completed_at = now(),
        error_summary = case
          when v_accepted_count = 0
            then 'No provider records passed validation.'
          when v_rejected_count > 0
            then v_rejected_count || ' record(s) rejected during validation.'
          else null
        end
    where id = v_run_id;

    update public.fantasy_provider_settings
    set last_successful_sync_at = case
          when v_final_status in ('succeeded', 'partial') then now()
          else last_successful_sync_at
        end,
        last_failed_sync_at = case
          when v_final_status = 'failed' then now()
          else last_failed_sync_at
        end,
        updated_by = p_requested_by
    where competition_season_id = p_competition_season_id;

    insert into public.audit_logs (
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      p_requested_by,
      'provider_batch_persisted',
      'provider_sync_run',
      v_run_id::text,
      jsonb_build_object(
        'competition_season_id', p_competition_season_id,
        'provider', p_provider,
        'trigger_source', p_trigger_source,
        'status', v_final_status,
        'raw_record_count', v_raw_count,
        'accepted_record_count', v_accepted_count,
        'rejected_record_count', v_rejected_count,
        'warning_count', v_warning_count
      )
    );
  exception
    when others then
      update public.provider_sync_runs
      set status = 'failed',
          completed_at = now(),
          error_summary = sqlerrm
      where id = v_run_id;

      insert into public.provider_sync_errors (
        sync_run_id,
        competition_season_id,
        provider,
        stage,
        error_code,
        message,
        retriable,
        attempt_number,
        details
      ) values (
        v_run_id,
        p_competition_season_id,
        p_provider,
        'persistence',
        sqlstate,
        sqlerrm,
        true,
        v_attempt,
        '{}'::jsonb
      );

      update public.fantasy_provider_settings
      set last_failed_sync_at = now(),
          updated_by = p_requested_by
      where competition_season_id = p_competition_season_id;
  end;

  return v_run_id;
end;
$$;

revoke all on function public.persist_provider_batch(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function public.persist_provider_batch(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  uuid
) to service_role;

comment on function public.persist_provider_batch(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  uuid
) is
  'Persists validated provider batches from the trusted server service role with administrator attribution, idempotency checks and retry lineage controls.';
