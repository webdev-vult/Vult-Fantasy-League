drop policy if exists round_scores_admin_insert on public.round_scores;
drop policy if exists round_scores_admin_update on public.round_scores;
drop policy if exists round_scores_admin_delete on public.round_scores;
drop policy if exists round_scores_admin_read on public.round_scores;

comment on table public.round_scores is
'Calculated Gameweek scores. Browser administrators have read-only access; all writes use service-role scoring functions.';
