create table if not exists private.registration_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  updated_at timestamptz not null default now(),
  constraint registration_rate_limits_key_hash_check check (key_hash ~ '^[0-9a-f]{64}$')
);

create or replace function public.consume_public_registration_rate_limit(
  p_key_hash text,
  p_limit integer default 12,
  p_window_seconds integer default 600
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := coalesce((select auth.jwt() ->> 'role'), '');
  v_count integer;
  v_started_at timestamptz;
  v_window interval;
begin
  if v_role <> 'service_role' then
    raise exception using message = 'Registration rate limiting is restricted to the server service role.';
  end if;
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using message = 'Rate-limit key is invalid.';
  end if;
  if p_limit < 1 or p_limit > 100 or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception using message = 'Rate-limit policy is invalid.';
  end if;

  v_window := make_interval(secs => p_window_seconds);

  insert into private.registration_rate_limits(key_hash, window_started_at, attempt_count, updated_at)
  values (p_key_hash, now(), 1, now())
  on conflict (key_hash) do update
  set window_started_at = case
        when private.registration_rate_limits.window_started_at <= now() - v_window then now()
        else private.registration_rate_limits.window_started_at
      end,
      attempt_count = case
        when private.registration_rate_limits.window_started_at <= now() - v_window then 1
        else private.registration_rate_limits.attempt_count + 1
      end,
      updated_at = now()
  returning attempt_count, window_started_at
  into v_count, v_started_at;

  allowed := v_count <= p_limit;
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from ((v_started_at + v_window) - now())))::integer)
  end;

  delete from private.registration_rate_limits
  where updated_at < now() - interval '2 days';

  return next;
end;
$function$;

revoke all on function public.consume_public_registration_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_public_registration_rate_limit(text, integer, integer) from anon;
revoke all on function public.consume_public_registration_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.consume_public_registration_rate_limit(text, integer, integer) to service_role;
