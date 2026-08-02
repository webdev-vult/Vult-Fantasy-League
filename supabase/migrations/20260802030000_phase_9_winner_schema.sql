create table public.winner_generation_runs (
  id uuid primary key default gen_random_uuid(),
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  prize_id uuid not null references public.prizes(id) on delete restrict,
  scope text not null check (scope in ('round', 'monthly', 'overall')),
  round_id uuid references public.rounds(id) on delete restrict,
  monthly_period_id uuid references public.monthly_periods(id) on delete restrict,
  rules_version integer not null check (rules_version > 0),
  status text not null default 'running'
    check (status in ('running', 'completed', 'partial', 'failed')),
  source_row_count integer not null default 0 check (source_row_count >= 0),
  eligible_row_count integer not null default 0 check (eligible_row_count >= 0),
  review_row_count integer not null default 0 check (review_row_count >= 0),
  excluded_row_count integer not null default 0 check (excluded_row_count >= 0),
  generated_candidate_count integer not null default 0 check (generated_candidate_count >= 0),
  tie_breakers jsonb not null default '[]'::jsonb,
  repeat_weekly_winners_allowed boolean not null default true,
  generated_by uuid not null references public.admin_profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'round' and round_id is not null and monthly_period_id is null)
    or (scope = 'monthly' and monthly_period_id is not null and round_id is null)
    or (scope = 'overall' and round_id is null and monthly_period_id is null)
  )
);

alter table public.winner_candidates
  drop constraint if exists winner_candidates_status_check,
  drop constraint if exists winner_candidates_check;

alter table public.winner_candidates
  add column generation_run_id uuid references public.winner_generation_runs(id) on delete restrict,
  add column scope text check (scope in ('round', 'monthly', 'overall')),
  add column source_round_score_id uuid references public.round_scores(id) on delete restrict,
  add column source_monthly_score_id uuid references public.monthly_scores(id) on delete restrict,
  add column source_season_score_id uuid references public.season_scores(id) on delete restrict,
  add column candidate_order integer check (candidate_order is null or candidate_order > 0),
  add column prize_position integer check (prize_position is null or prize_position > 0),
  add column eligibility_status text not null default 'pending'
    check (eligibility_status in ('pending', 'eligible', 'ineligible', 'review_required')),
  add column eligibility_summary jsonb not null default '[]'::jsonb,
  add column tie_break_values jsonb not null default '{}'::jsonb,
  add column competition_review_status text not null default 'pending'
    check (competition_review_status in ('pending', 'approved', 'rejected')),
  add column competition_reviewed_by uuid references public.admin_profiles(id) on delete set null,
  add column competition_reviewed_at timestamptz,
  add column competition_review_notes text,
  add column compliance_review_status text not null default 'pending'
    check (compliance_review_status in ('pending', 'approved', 'rejected')),
  add column compliance_reviewed_by uuid references public.admin_profiles(id) on delete set null,
  add column compliance_reviewed_at timestamptz,
  add column compliance_review_notes text,
  add column confirmed_by uuid references public.admin_profiles(id) on delete set null,
  add column confirmed_at timestamptz,
  add column publicity_consent boolean not null default false,
  add column publication_ready boolean not null default false,
  add column publication_readiness_note text,
  add column replacement_for_candidate_id uuid references public.winner_candidates(id) on delete set null,
  add column replaced_by_candidate_id uuid references public.winner_candidates(id) on delete set null,
  add column rejection_reason text,
  add column is_current boolean not null default true,
  add column display_name_snapshot text,
  add column team_name_snapshot text,
  add column provider_entry_id_snapshot text,
  add column prize_snapshot jsonb not null default '{}'::jsonb;

alter table public.winner_candidates
  add constraint winner_candidates_status_check check (status in (
    'provisional',
    'under_review',
    'competition_approved',
    'compliance_review',
    'compliance_approved',
    'rejected',
    'confirmed',
    'payment_pending',
    'paid',
    'published',
    'superseded'
  )),
  add constraint winner_candidates_scope_source_check check (
    scope is null
    or (scope = 'round' and round_id is not null and monthly_period_id is null and source_round_score_id is not null and source_monthly_score_id is null and source_season_score_id is null)
    or (scope = 'monthly' and monthly_period_id is not null and round_id is null and source_round_score_id is null and source_monthly_score_id is not null and source_season_score_id is null)
    or (scope = 'overall' and round_id is null and monthly_period_id is null and source_round_score_id is null and source_monthly_score_id is null and source_season_score_id is not null)
  );

create table public.winner_generation_evaluations (
  id uuid primary key default gen_random_uuid(),
  generation_run_id uuid not null references public.winner_generation_runs(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete restrict,
  source_round_score_id uuid references public.round_scores(id) on delete restrict,
  source_monthly_score_id uuid references public.monthly_scores(id) on delete restrict,
  source_season_score_id uuid references public.season_scores(id) on delete restrict,
  source_rank integer not null check (source_rank > 0),
  score integer not null,
  provider_total_points integer not null default 0,
  transfer_cost integer not null default 0,
  gameweeks_counted integer not null default 0 check (gameweeks_counted >= 0),
  weekly_eligible boolean not null default true,
  provider_entry_id text,
  registered_at timestamptz not null,
  fpl_verified_at timestamptz,
  display_name text not null,
  team_name text,
  eligibility_status text not null
    check (eligibility_status in ('eligible', 'ineligible', 'review_required')),
  checks jsonb not null default '[]'::jsonb,
  tie_break_values jsonb not null default '{}'::jsonb,
  selection_order integer check (selection_order is null or selection_order > 0),
  selected_candidate_id uuid references public.winner_candidates(id) on delete set null,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (generation_run_id, registration_id)
);

create table public.winner_candidate_checks (
  id bigint generated by default as identity primary key,
  candidate_id uuid not null references public.winner_candidates(id) on delete cascade,
  check_code text not null,
  check_status text not null check (check_status in ('pass', 'fail', 'review', 'not_applicable')),
  is_required boolean not null default true,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  unique (candidate_id, check_code)
);

create table public.winner_candidate_status_history (
  id bigint generated by default as identity primary key,
  candidate_id uuid not null references public.winner_candidates(id) on delete cascade,
  from_status text,
  to_status text not null,
  action text not null,
  actor_user_id uuid references public.admin_profiles(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index winner_candidates_current_round_prize_idx
  on public.winner_candidates(prize_id, round_id)
  where is_current = true and scope = 'round';
create unique index winner_candidates_current_monthly_prize_idx
  on public.winner_candidates(prize_id, monthly_period_id)
  where is_current = true and scope = 'monthly';
create unique index winner_candidates_current_overall_prize_idx
  on public.winner_candidates(prize_id)
  where is_current = true and scope = 'overall';

create index winner_generation_runs_season_idx on public.winner_generation_runs(competition_season_id, created_at desc);
create index winner_generation_runs_prize_idx on public.winner_generation_runs(prize_id, created_at desc);
create index winner_generation_runs_round_idx on public.winner_generation_runs(round_id);
create index winner_generation_runs_monthly_period_idx on public.winner_generation_runs(monthly_period_id);
create index winner_generation_runs_generated_by_idx on public.winner_generation_runs(generated_by);
create index winner_generation_evaluations_run_order_idx on public.winner_generation_evaluations(generation_run_id, selection_order);
create index winner_generation_evaluations_registration_idx on public.winner_generation_evaluations(registration_id);
create index winner_generation_evaluations_round_score_idx on public.winner_generation_evaluations(source_round_score_id);
create index winner_generation_evaluations_monthly_score_idx on public.winner_generation_evaluations(source_monthly_score_id);
create index winner_generation_evaluations_season_score_idx on public.winner_generation_evaluations(source_season_score_id);
create index winner_generation_evaluations_selected_candidate_idx on public.winner_generation_evaluations(selected_candidate_id);
create index winner_candidate_checks_candidate_idx on public.winner_candidate_checks(candidate_id, check_status);
create index winner_candidate_status_history_candidate_idx on public.winner_candidate_status_history(candidate_id, created_at desc);
create index winner_candidate_status_history_actor_idx on public.winner_candidate_status_history(actor_user_id);
create index winner_candidates_generation_run_idx on public.winner_candidates(generation_run_id);
create index winner_candidates_competition_reviewed_by_idx on public.winner_candidates(competition_reviewed_by);
create index winner_candidates_compliance_reviewed_by_idx on public.winner_candidates(compliance_reviewed_by);
create index winner_candidates_confirmed_by_idx on public.winner_candidates(confirmed_by);
create index winner_candidates_replacement_for_idx on public.winner_candidates(replacement_for_candidate_id);
create index winner_candidates_replaced_by_idx on public.winner_candidates(replaced_by_candidate_id);
create index winner_candidates_source_round_score_idx on public.winner_candidates(source_round_score_id);
create index winner_candidates_source_monthly_score_idx on public.winner_candidates(source_monthly_score_id);
create index winner_candidates_source_season_score_idx on public.winner_candidates(source_season_score_id);
create index winner_candidates_queue_idx on public.winner_candidates(competition_season_id, status, is_current, generated_at desc);

create trigger winner_generation_runs_set_updated_at
before update on public.winner_generation_runs
for each row execute function public.set_updated_at();

alter table public.winner_generation_runs enable row level security;
alter table public.winner_generation_evaluations enable row level security;
alter table public.winner_candidate_checks enable row level security;
alter table public.winner_candidate_status_history enable row level security;

revoke all on table public.winner_generation_runs from anon, authenticated;
revoke all on table public.winner_generation_evaluations from anon, authenticated;
revoke all on table public.winner_candidate_checks from anon, authenticated;
revoke all on table public.winner_candidate_status_history from anon, authenticated;
revoke insert, update, delete, truncate on table public.winner_candidates from authenticated;

grant select on table public.winner_generation_runs to authenticated;
grant select on table public.winner_generation_evaluations to authenticated;
grant select on table public.winner_candidate_checks to authenticated;
grant select on table public.winner_candidate_status_history to authenticated;
grant select on table public.winner_candidates to authenticated;

drop policy if exists winner_candidates_admin_insert on public.winner_candidates;
drop policy if exists winner_candidates_admin_update on public.winner_candidates;
drop policy if exists winner_candidates_admin_delete on public.winner_candidates;

create policy winner_generation_runs_admin_read
on public.winner_generation_runs for select to authenticated
using (private.is_active_admin());

create policy winner_generation_evaluations_admin_read
on public.winner_generation_evaluations for select to authenticated
using (private.is_active_admin());

create policy winner_candidate_checks_admin_read
on public.winner_candidate_checks for select to authenticated
using (private.is_active_admin());

create policy winner_candidate_status_history_admin_read
on public.winner_candidate_status_history for select to authenticated
using (private.is_active_admin());

comment on table public.winner_generation_runs is
  'Audited winner-generation executions for a configured prize and scoring scope.';
comment on table public.winner_generation_evaluations is
  'Every ranked registration evaluated during a winner-generation run, including eligibility and tie-break evidence.';
comment on table public.winner_candidate_checks is
  'Immutable eligibility checks copied onto a selected winner candidate.';
comment on table public.winner_candidate_status_history is
  'Append-only competition, compliance and confirmation workflow history for winner candidates.';
