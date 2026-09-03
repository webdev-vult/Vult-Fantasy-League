create or replace function private.reopen_round_when_score_becomes_provisional()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_provisional or new.score_status = 'provisional' then
    update public.rounds
    set status = 'awaiting_finalisation',
        is_final = false,
        finalised_at = null
    where id = new.round_id
      and status not in ('locked', 'cancelled')
      and (is_final or status = 'final');
  end if;

  return new;
end;
$$;

drop trigger if exists round_scores_reopen_provisional_round on public.round_scores;
create trigger round_scores_reopen_provisional_round
after insert or update of is_provisional, score_status on public.round_scores
for each row
when (new.is_provisional or new.score_status = 'provisional')
execute function private.reopen_round_when_score_becomes_provisional();

create or replace function private.validate_completed_monthly_period()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if not exists (
      select 1
      from public.rounds r
      where r.competition_season_id = new.competition_season_id
        and r.external_round_id between new.start_round and new.end_round
    ) then
      raise exception 'A monthly period cannot be completed before its Gameweeks exist.';
    end if;

    if exists (
      select 1
      from public.rounds r
      where r.competition_season_id = new.competition_season_id
        and r.external_round_id between new.start_round and new.end_round
        and (not r.is_final or r.status not in ('final', 'locked'))
    ) then
      raise exception 'Every Gameweek in this monthly period must be final before the period can be completed.';
    end if;

    if exists (
      select 1
      from public.rounds r
      left join public.round_scores rs on rs.round_id = r.id
      where r.competition_season_id = new.competition_season_id
        and r.external_round_id between new.start_round and new.end_round
      group by r.id
      having count(rs.id) = 0
        or bool_or(rs.is_provisional or rs.score_status not in ('final', 'corrected'))
    ) then
      raise exception 'Every score in this monthly period must be final before the period can be completed.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists monthly_periods_require_final_scores on public.monthly_periods;
create trigger monthly_periods_require_final_scores
before update of status on public.monthly_periods
for each row
execute function private.validate_completed_monthly_period();

-- Repair states created when provider records were promoted after a round had
-- already been finalised. Staff must review and finalise these scores again.
update public.rounds r
set status = 'awaiting_finalisation',
    is_final = false,
    finalised_at = null
where r.status = 'final'
  and exists (
    select 1
    from public.round_scores rs
    where rs.round_id = r.id
      and (rs.is_provisional or rs.score_status = 'provisional')
  );

update public.monthly_periods mp
set status = case
  when mp.calendar_month > date_trunc('month', timezone('Africa/Freetown', now()))::date then 'draft'
  else 'active'
end
where mp.status = 'completed'
  and exists (
    select 1
    from public.rounds r
    left join public.round_scores rs on rs.round_id = r.id
    where r.competition_season_id = mp.competition_season_id
      and r.external_round_id between mp.start_round and mp.end_round
    group by r.id
    having not bool_and(r.is_final and r.status in ('final', 'locked'))
      or count(rs.id) = 0
      or bool_or(rs.is_provisional or rs.score_status not in ('final', 'corrected'))
  );

revoke all on function private.reopen_round_when_score_becomes_provisional() from public;
revoke all on function private.validate_completed_monthly_period() from public;
