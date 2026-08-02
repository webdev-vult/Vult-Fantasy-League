create or replace function public.get_admin_reporting_dashboard(
  p_competition_season_id uuid,
  p_requested_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_season_id uuid;
begin
  v_role := private.require_service_admin(
    p_requested_by,
    array['super_admin','competition_manager','compliance_officer','finance_officer','content_manager','support_officer','auditor']::text[]
  );

  if p_competition_season_id is not null then
    select id into v_season_id
    from public.competition_seasons
    where id = p_competition_season_id;
    if v_season_id is null then
      raise exception using message = 'Competition season not found.';
    end if;
  else
    select id into v_season_id
    from public.competition_seasons
    order by starts_at desc nulls last, registration_opens_at desc nulls last, created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'requested_role', v_role,
    'selected_season_id', v_season_id,
    'seasons', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', cs.id,
        'name', cs.name,
        'status', cs.status,
        'provider', cs.data_provider,
        'starts_at', cs.starts_at,
        'ends_at', cs.ends_at,
        'registrations', (select count(*) from public.registrations r where r.competition_season_id = cs.id),
        'approved_registrations', (select count(*) from public.registrations r where r.competition_season_id = cs.id and r.status = 'approved'),
        'unique_participants', (select count(distinct r.participant_id) from public.registrations r where r.competition_season_id = cs.id),
        'finalised_rounds', (select count(*) from public.rounds ro where ro.competition_season_id = cs.id and ro.is_final = true),
        'published_leaderboards', (select count(*) from public.leaderboard_publications lp where lp.competition_season_id = cs.id and lp.status = 'published'),
        'confirmed_winners', (select count(*) from public.winner_candidates wc where wc.competition_season_id = cs.id and wc.status = 'confirmed'),
        'paid_prizes', (select count(*) from public.prize_payments pp where pp.competition_season_id = cs.id and pp.status = 'paid'),
        'open_disputes', (select count(*) from public.disputes d where d.competition_season_id = cs.id and d.status not in ('resolved','rejected','closed'))
      ) order by cs.starts_at desc nulls last, cs.registration_opens_at desc nulls last, cs.created_at desc), '[]'::jsonb)
      from public.competition_seasons cs
    ),
    'selected_season', (
      select jsonb_build_object(
        'id', cs.id,
        'name', cs.name,
        'status', cs.status,
        'provider', cs.data_provider,
        'registration_opens_at', cs.registration_opens_at,
        'registration_closes_at', cs.registration_closes_at,
        'starts_at', cs.starts_at,
        'ends_at', cs.ends_at,
        'rules_version', cs.rules_version
      )
      from public.competition_seasons cs
      where cs.id = v_season_id
    ),
    'headline', jsonb_build_object(
      'registrations', (select count(*) from public.registrations r where r.competition_season_id = v_season_id),
      'approved', (select count(*) from public.registrations r where r.competition_season_id = v_season_id and r.status = 'approved'),
      'approval_rate', (
        select case when count(*) = 0 then 0 else round((count(*) filter (where status='approved'))::numeric * 100 / count(*), 2) end
        from public.registrations r where r.competition_season_id = v_season_id
      ),
      'unique_participants', (select count(distinct participant_id) from public.registrations r where r.competition_season_id = v_season_id),
      'fpl_verified', (
        select count(*) from public.registration_verifications rv
        join public.registrations r on r.id = rv.registration_id
        where r.competition_season_id = v_season_id and rv.fpl_status = 'verified'
      ),
      'vult_verified', (
        select count(*) from public.registration_verifications rv
        join public.registrations r on r.id = rv.registration_id
        where r.competition_season_id = v_season_id and rv.vult_status = 'verified'
      ),
      'high_duplicate_risk', (
        select count(*) from public.registration_verifications rv
        join public.registrations r on r.id = rv.registration_id
        where r.competition_season_id = v_season_id and rv.duplicate_risk = 'high'
      ),
      'rounds_total', (select count(*) from public.rounds ro where ro.competition_season_id = v_season_id),
      'rounds_finalised', (select count(*) from public.rounds ro where ro.competition_season_id = v_season_id and ro.is_final = true),
      'score_rows', (
        select count(*) from public.round_scores rs
        join public.rounds ro on ro.id = rs.round_id
        where ro.competition_season_id = v_season_id
      ),
      'published_leaderboards', (select count(*) from public.leaderboard_publications lp where lp.competition_season_id = v_season_id and lp.status = 'published'),
      'confirmed_winners', (select count(*) from public.winner_candidates wc where wc.competition_season_id = v_season_id and wc.status = 'confirmed'),
      'active_settlements', (select count(*) from public.prize_payments pp where pp.competition_season_id = v_season_id and pp.status not in ('paid','cancelled','reversed')),
      'paid_settlements', (select count(*) from public.prize_payments pp where pp.competition_season_id = v_season_id and pp.status = 'paid'),
      'open_disputes', (select count(*) from public.disputes d where d.competition_season_id = v_season_id and d.status not in ('resolved','rejected','closed')),
      'overdue_disputes', (select count(*) from public.disputes d where d.competition_season_id = v_season_id and d.status not in ('resolved','rejected','closed') and d.due_at < now()),
      'queued_notifications', (select count(*) from public.notification_outbox n where n.competition_season_id = v_season_id and n.status in ('queued','manual_pending')),
      'failed_notifications', (select count(*) from public.notification_outbox n where n.competition_season_id = v_season_id and n.status = 'failed'),
      'failed_provider_runs', (select count(*) from public.provider_sync_runs psr where psr.competition_season_id = v_season_id and psr.status = 'failed')
    ),
    'registration_statuses', (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', total) order by status), '[]'::jsonb)
      from (select r.status, count(*) as total from public.registrations r where r.competition_season_id = v_season_id group by r.status) x
    ),
    'eligibility_statuses', (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', total) order by status), '[]'::jsonb)
      from (select r.eligibility_status as status, count(*) as total from public.registrations r where r.competition_season_id = v_season_id group by r.eligibility_status) x
    ),
    'verification_statuses', jsonb_build_object(
      'fpl', (
        select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', total) order by status), '[]'::jsonb)
        from (select rv.fpl_status as status, count(*) as total from public.registration_verifications rv join public.registrations r on r.id = rv.registration_id where r.competition_season_id = v_season_id group by rv.fpl_status) x
      ),
      'vult', (
        select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', total) order by status), '[]'::jsonb)
        from (select rv.vult_status as status, count(*) as total from public.registration_verifications rv join public.registrations r on r.id = rv.registration_id where r.competition_season_id = v_season_id group by rv.vult_status) x
      ),
      'duplicate_risk', (
        select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', total) order by status), '[]'::jsonb)
        from (select rv.duplicate_risk as status, count(*) as total from public.registration_verifications rv join public.registrations r on r.id = rv.registration_id where r.competition_season_id = v_season_id group by rv.duplicate_risk) x
      )
    ),
    'registration_trend', (
      select coalesce(jsonb_agg(jsonb_build_object('period', period, 'count', total) order by period), '[]'::jsonb)
      from (select date_trunc('month', r.registered_at)::date as period, count(*) as total from public.registrations r where r.competition_season_id = v_season_id group by date_trunc('month', r.registered_at)::date) x
    ),
    'provider_runs', (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', total, 'accepted', accepted, 'rejected', rejected, 'warnings', warnings) order by status), '[]'::jsonb)
      from (
        select psr.status, count(*) as total, coalesce(sum(psr.accepted_record_count),0) as accepted, coalesce(sum(psr.rejected_record_count),0) as rejected, coalesce(sum(psr.warning_count),0) as warnings
        from public.provider_sync_runs psr where psr.competition_season_id = v_season_id group by psr.status
      ) x
    ),
    'latest_provider_run', (
      select jsonb_build_object('id',psr.id,'provider',psr.provider,'status',psr.status,'source_label',psr.source_label,'accepted',psr.accepted_record_count,'rejected',psr.rejected_record_count,'warnings',psr.warning_count,'started_at',psr.started_at,'completed_at',psr.completed_at,'error_summary',psr.error_summary)
      from public.provider_sync_runs psr where psr.competition_season_id = v_season_id order by psr.created_at desc limit 1
    ),
    'round_statuses', (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', total) order by status), '[]'::jsonb)
      from (select ro.status, count(*) as total from public.rounds ro where ro.competition_season_id = v_season_id group by ro.status) x
    ),
    'leaderboard_statuses', (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', total, 'rows', row_count) order by status), '[]'::jsonb)
      from (select lp.status, count(*) as total, coalesce(sum(lp.row_count),0) as row_count from public.leaderboard_publications lp where lp.competition_season_id = v_season_id group by lp.status) x
    ),
    'winner_statuses', (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', total) order by status), '[]'::jsonb)
      from (select wc.status, count(*) as total from public.winner_candidates wc where wc.competition_season_id = v_season_id and wc.is_current = true group by wc.status) x
    ),
    'payment_statuses', (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'currency', currency, 'count', total, 'amount', amount) order by currency, status), '[]'::jsonb)
      from (select pp.status, pp.currency, count(*) as total, coalesce(sum(pp.amount),0) as amount from public.prize_payments pp where pp.competition_season_id = v_season_id group by pp.status, pp.currency) x
    ),
    'prize_spending', (
      with currencies as (
        select p.currency from public.prizes p where p.competition_season_id = v_season_id
        union
        select pp.currency from public.prize_payments pp where pp.competition_season_id = v_season_id
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'currency', c.currency,
        'configured_value', (
          select coalesce(sum(p.amount * case
            when p.frequency = 'weekly' then greatest((select count(*) from public.rounds ro where ro.competition_season_id = v_season_id), 1)
            when p.frequency = 'monthly' then greatest((select count(*) from public.monthly_periods mp where mp.competition_season_id = v_season_id), 1)
            else 1 end),0)
          from public.prizes p where p.competition_season_id = v_season_id and p.currency = c.currency and p.is_active = true
        ),
        'committed', (select coalesce(sum(pp.amount),0) from public.prize_payments pp where pp.competition_season_id = v_season_id and pp.currency = c.currency and pp.status <> 'cancelled'),
        'paid', (select coalesce(sum(pp.amount),0) from public.prize_payments pp where pp.competition_season_id = v_season_id and pp.currency = c.currency and pp.status = 'paid'),
        'reversed', (select coalesce(sum(pp.amount),0) from public.prize_payments pp where pp.competition_season_id = v_season_id and pp.currency = c.currency and pp.status = 'reversed')
      ) order by c.currency), '[]'::jsonb)
      from currencies c
    ),
    'dispute_statuses', (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', total) order by status), '[]'::jsonb)
      from (select d.status, count(*) as total from public.disputes d where d.competition_season_id = v_season_id group by d.status) x
    ),
    'dispute_categories', (
      select coalesce(jsonb_agg(jsonb_build_object('category', category, 'count', total) order by category), '[]'::jsonb)
      from (select d.category, count(*) as total from public.disputes d where d.competition_season_id = v_season_id group by d.category) x
    ),
    'notification_statuses', (
      select coalesce(jsonb_agg(jsonb_build_object('channel', channel, 'status', status, 'count', total) order by channel, status), '[]'::jsonb)
      from (select n.channel, n.status, count(*) as total from public.notification_outbox n where n.competition_season_id = v_season_id group by n.channel, n.status) x
    ),
    'retention', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'season_id', x.id,
        'season_name', x.name,
        'registered_participants', x.registered_participants,
        'returning_participants', x.returning_participants,
        'new_participants', x.registered_participants - x.returning_participants,
        'retention_rate', case when x.registered_participants = 0 then 0 else round(x.returning_participants::numeric * 100 / x.registered_participants, 2) end
      ) order by x.sort_at), '[]'::jsonb)
      from (
        select cs.id, cs.name, coalesce(cs.starts_at, cs.registration_opens_at, cs.created_at) as sort_at,
               count(distinct r.participant_id) as registered_participants,
               count(distinct r.participant_id) filter (where exists (
                 select 1 from public.registrations prior join public.competition_seasons pcs on pcs.id = prior.competition_season_id
                 where prior.participant_id = r.participant_id and prior.competition_season_id <> cs.id
                   and coalesce(pcs.starts_at, pcs.registration_opens_at, pcs.created_at) < coalesce(cs.starts_at, cs.registration_opens_at, cs.created_at)
               )) as returning_participants
        from public.competition_seasons cs left join public.registrations r on r.competition_season_id = cs.id
        group by cs.id, cs.name, cs.starts_at, cs.registration_opens_at, cs.created_at
      ) x
    ),
    'freshness', jsonb_build_object(
      'registrations', (select max(r.updated_at) from public.registrations r where r.competition_season_id = v_season_id),
      'provider_runs', (select max(psr.updated_at) from public.provider_sync_runs psr where psr.competition_season_id = v_season_id),
      'scores', (select max(rs.updated_at) from public.round_scores rs join public.rounds ro on ro.id=rs.round_id where ro.competition_season_id = v_season_id),
      'leaderboards', (select max(lp.updated_at) from public.leaderboard_publications lp where lp.competition_season_id = v_season_id),
      'winners', (select max(wc.updated_at) from public.winner_candidates wc where wc.competition_season_id = v_season_id),
      'payments', (select max(pp.updated_at) from public.prize_payments pp where pp.competition_season_id = v_season_id),
      'disputes', (select max(d.updated_at) from public.disputes d where d.competition_season_id = v_season_id),
      'communications', (select max(n.updated_at) from public.notification_outbox n where n.competition_season_id = v_season_id)
    )
  );
end;
$$;

revoke all on function public.get_admin_reporting_dashboard(uuid,uuid) from public, anon, authenticated;
grant execute on function public.get_admin_reporting_dashboard(uuid,uuid) to service_role;
