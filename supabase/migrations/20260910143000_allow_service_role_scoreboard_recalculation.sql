-- The official FPL monthly-period sync is SECURITY INVOKER and calls this
-- private helper. Keep it unavailable to public clients while allowing the
-- server-only service role to complete scheduled maintenance.
revoke all on function private.recalculate_scoreboards(uuid) from public, anon, authenticated;
grant execute on function private.recalculate_scoreboards(uuid) to service_role;
