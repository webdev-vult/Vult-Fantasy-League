create or replace function private.cleanup_expired_dispute_tokens()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.dispute_public_access_tokens
  where expires_at <= now() - interval '24 hours';
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
  perform private.cleanup_expired_dispute_tokens();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.dispute_public_access_tokens(dispute_id, token_hash, expires_at)
  values (p_dispute_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '30 minutes');
  return v_token;
end;
$$;
