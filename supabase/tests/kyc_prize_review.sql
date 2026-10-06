-- Regression test for 20261006023336_defer_kyc_until_prize_review.sql.
-- Run on an isolated test database after applying the migration, with
-- ON_ERROR_STOP enabled. All synthetic data is rolled back; no emails are sent.
begin;
do $test$
declare
  v_admin uuid := gen_random_uuid();
  v_comp uuid := gen_random_uuid();
  v_season uuid := gen_random_uuid();
  v_cs uuid := gen_random_uuid();
  v_rule uuid := gen_random_uuid();
  v_round uuid := gen_random_uuid();
  v_month uuid := gen_random_uuid();
  v_par uuid;
  v_reg uuid;
  v_level_zero uuid;
  v_prize uuid;
  v_candidate uuid;
  v_run uuid;
  v_publication uuid;
  v_status text;
  v_checks jsonb;
  v_scope text;
  v_blocked boolean;
  i integer;
begin
  insert into auth.users(id, email) values (v_admin, v_admin::text || '@example.invalid');
  insert into public.admin_profiles(id, full_name, role) values (v_admin, 'KYC regression admin', 'super_admin');
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  insert into public.competitions(id, slug, name) values (v_comp, v_comp::text, 'KYC regression competition');
  insert into public.seasons(id, code, name) values (v_season, v_season::text, 'KYC regression season');
  insert into public.competition_seasons(id, competition_id, season_id, slug, name, status)
  values (v_cs, v_comp, v_season, v_cs::text, 'KYC regression', 'active');
  insert into public.competition_rules(id, competition_season_id, version, title, status)
  values (v_rule, v_cs, 1, 'KYC regression rules', 'published');
  insert into public.rounds(id, competition_season_id, external_round_id, name, status, is_final)
  values (v_round, v_cs, 1, 'Gameweek 1', 'final', true);
  insert into public.monthly_periods(id, competition_season_id, name, start_round, end_round, status)
  values (v_month, v_cs, 'Test month', 1, 1, 'active');

  -- 0–3 are approved and FPL-verified at every KYC level. 4–6 have higher
  -- scores but must be excluded: FPL pending, registration pending, suspended.
  for i in 0..6 loop
    v_par := gen_random_uuid();
    v_reg := gen_random_uuid();
    insert into public.participants(id, full_name, phone)
    values (v_par, 'KYC test ' || i, '2327700000' || i);
    insert into public.registrations(id, participant_id, competition_season_id, status, eligibility_status, eligible_from_round)
    values (v_reg, v_par, v_cs,
      case when i in (0,5) then 'pending' when i=6 then 'suspended' else 'approved' end,
      case when i in (0,5) then 'pending' when i=6 then 'review_required' else 'eligible' end, 1);
    insert into public.registration_verifications(registration_id, fpl_status, vult_status, vult_kyc_level, vult_verified_reference)
    values (v_reg, case when i=4 then 'pending' else 'verified' end,
      case when i=0 then 'pending' else 'verified' end, least(i,3),
      case when i=0 then null else '2327700000' || i end)
    on conflict (registration_id) do update set fpl_status=excluded.fpl_status,
      vult_status=excluded.vult_status, vult_kyc_level=excluded.vult_kyc_level,
      vult_verified_reference=excluded.vult_verified_reference;
    insert into public.fantasy_entries(registration_id, competition_season_id, provider_entry_id, manager_name, team_name, verified_at)
    values (v_reg, v_cs, (10000+i)::text, 'KYC test ' || i, 'Team ' || i, now());
    insert into public.participant_consents(registration_id, consent_type, document_version, accepted)
    values (v_reg, 'winner_publicity', '1', true);
    insert into public.round_scores(registration_id, round_id, reported_points, effective_points, total_points, score_status, is_provisional)
    values (v_reg, v_round, case when i<4 then 100-i else 1000 end,
      case when i<4 then 100-i else 1000 end, case when i<4 then 100-i else 1000 end, 'final', false);
    if i=0 then
      v_level_zero := v_reg;
      perform public.transition_registration_status(v_reg, 'approved', 'Regression approval at KYC 0');
      if not exists(select 1 from public.registrations where id=v_reg and status='approved' and eligibility_status='eligible') then
        raise exception 'FAIL: KYC 0 approval was blocked';
      end if;
    end if;
  end loop;
  update public.monthly_periods set status='completed' where id=v_month;
  perform private.recalculate_scoreboards(v_cs);
  if (select count(*) from public.season_scores where competition_season_id=v_cs) <> 4
    or (select count(*) from public.monthly_scores where monthly_period_id=v_month) <> 4
    or (select round_rank from public.round_scores where registration_id=v_level_zero and round_id=v_round) <> 1
    or (select rank from public.season_scores where registration_id=v_level_zero and competition_season_id=v_cs) <> 1 then
    raise exception 'FAIL: KYC-independent scoreboards or FPL/approval exclusions';
  end if;
  raise notice 'PASS: approval at KYC 0; all four KYC levels ranked; FPL-pending/pending/suspended excluded';

  update public.competition_seasons set status='completed' where id=v_cs;
  foreach v_scope in array array['round','monthly','overall'] loop
    v_publication := public.publish_leaderboard(v_cs, v_scope,
      case when v_scope='round' then v_round end,
      case when v_scope='monthly' then v_month end, 'Regression ' || v_scope, 'KYC policy regression', v_admin);
    if (select count(*) from public.public_leaderboard_rows where publication_id=v_publication) <> 4
      or not exists(select 1 from public.public_leaderboard_rows where publication_id=v_publication and source_key=md5(v_level_zero::text) and rank=1) then
      raise exception 'FAIL: % publication excludes or misranks KYC 0', v_scope;
    end if;
    v_prize := gen_random_uuid();
    insert into public.prizes(id, competition_season_id, code, name, frequency)
    values(v_prize, v_cs, v_prize::text, 'KYC regression prize', case when v_scope='round' then 'weekly' else v_scope end);
    v_run := public.generate_winner_candidate_internal(v_cs, v_prize, v_scope,
      case when v_scope='round' then v_round end,
      case when v_scope='monthly' then v_month end, v_admin);
    select id into v_candidate from public.winner_candidates where generation_run_id=v_run and is_current;
    if not exists(select 1 from public.winner_candidates where id=v_candidate and registration_id=v_level_zero and eligibility_status='review_required') then
      raise exception 'FAIL: % generation skipped the highest-scoring KYC 0 manager', v_scope;
    end if;
    raise notice 'PASS: % snapshot and candidate select top KYC 0 manager', v_scope;
  end loop;

  perform public.competition_review_winner_candidate(v_candidate, 'approve', 'Regression competition review', v_admin);
  v_blocked := false;
  begin
    perform public.compliance_review_winner_candidate(v_candidate, 'approve', 'Regression compliance review', v_admin);
  exception when others then
    if sqlerrm not like 'Verify the winner%KYC Level%' then raise; end if;
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'FAIL: compliance approval allowed KYC 0'; end if;

  -- Mismatched Vult phone still cannot pass despite a claimed Level 1.
  update public.registration_verifications set vult_status='verified', vult_kyc_level=1,
    vult_verified_reference='23277000999' where registration_id=v_level_zero;
  v_blocked := false;
  begin
    perform private.assert_winner_kyc_verified(v_candidate);
  exception when others then
    if sqlerrm not like 'Verify the winner%KYC Level%' then raise; end if;
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'FAIL: mismatched account passed KYC'; end if;
  update public.registration_verifications set vult_verified_reference='23277000000' where registration_id=v_level_zero;
  perform public.compliance_review_winner_candidate(v_candidate, 'approve', 'Verified current KYC evidence', v_admin);

  -- Re-read evidence at confirmation, even after compliance was approved.
  update public.registration_verifications set vult_kyc_level=0 where registration_id=v_level_zero;
  v_blocked := false;
  begin
    perform public.confirm_winner_candidate(v_candidate, 'Regression confirmation', v_admin);
  exception when others then
    if sqlerrm not like 'Verify the winner%KYC Level%' then raise; end if;
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'FAIL: confirmation trusted stale KYC evidence'; end if;
  update public.registration_verifications set vult_kyc_level=1 where registration_id=v_level_zero;
  perform public.confirm_winner_candidate(v_candidate, 'Verified current KYC confirmation', v_admin);

  update public.registration_verifications set vult_kyc_level=0 where registration_id=v_level_zero;
  v_blocked := false;
  begin
    perform public.prepare_prize_payment(v_candidate, v_admin);
  exception when others then
    if sqlerrm not like 'Verify the winner%KYC Level%' then raise; end if;
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'FAIL: payment preparation bypassed KYC'; end if;
  raise notice 'PASS: compliance, confirmation and payment block incomplete/mismatched KYC; Level 1 can confirm';

  select eligibility_status, checks into v_status, v_checks
  from private.evaluate_winner_eligibility(v_level_zero,v_cs,v_rule,'overall',v_prize,true);
  if v_status <> 'review_required' or not exists(select 1 from jsonb_array_elements(v_checks) c where c->>'code'='vult_kyc_level' and c->>'status'='review') then
    raise exception 'FAIL: pending prize KYC is not reviewable';
  end if;
  if has_function_privilege('anon','private.assert_winner_kyc_verified(uuid)','execute')
    or has_function_privilege('authenticated','private.assert_winner_kyc_verified(uuid)','execute')
    or not has_function_privilege('service_role','private.assert_winner_kyc_verified(uuid)','execute') then
    raise exception 'FAIL: KYC helper grants';
  end if;
  raise notice 'PASS: KYC helper is service-role-only';
end
$test$;
rollback;
