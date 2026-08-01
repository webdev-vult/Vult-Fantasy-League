create table if not exists public.competition_rules (
  id uuid primary key default gen_random_uuid(),
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'superseded')),
  minimum_age integer not null default 18 check (minimum_age >= 0),
  eligible_country_codes text[] not null default array['SL']::text[],
  requires_vult_account boolean not null default true,
  one_entry_per_participant boolean not null default true,
  employees_eligible boolean not null default false,
  weekly_chip_policy text not null default 'exclude_score_affecting_chips'
    check (weekly_chip_policy in ('allow_all', 'exclude_score_affecting_chips')),
  include_transfer_deductions boolean not null default true,
  repeat_weekly_winners_allowed boolean not null default true,
  dispute_window_hours integer not null default 72 check (dispute_window_hours > 0),
  tie_breakers jsonb not null default '["lowest_fpl_entry_id", "earliest_registration"]'::jsonb,
  disqualification_rules jsonb not null default '[]'::jsonb,
  notes text,
  effective_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.admin_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_season_id, version)
);

create trigger competition_rules_set_updated_at
before update on public.competition_rules
for each row execute function public.set_updated_at();

alter table public.competition_rules enable row level security;

create policy competition_rules_admin_read
on public.competition_rules for select
to authenticated
using (private.is_active_admin());

create policy competition_rules_admin_insert
on public.competition_rules for insert
to authenticated
with check (private.has_admin_role(array['super_admin', 'competition_manager']::text[]));

create policy competition_rules_admin_update
on public.competition_rules for update
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager']::text[]))
with check (private.has_admin_role(array['super_admin', 'competition_manager']::text[]));

create policy competition_rules_admin_delete
on public.competition_rules for delete
to authenticated
using (private.has_admin_role(array['super_admin', 'competition_manager']::text[]));

alter table public.rounds
  add column if not exists finalised_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid references public.admin_profiles(id) on delete set null;

create unique index if not exists rounds_one_current_per_season_idx
on public.rounds (competition_season_id)
where is_current = true;

create index if not exists rounds_locked_by_idx on public.rounds (locked_by);

alter table public.monthly_periods
  add column if not exists description text;

alter table public.prizes
  add column if not exists description text,
  add column if not exists prize_type text not null default 'cash'
    check (prize_type in ('cash', 'non_cash', 'mixed')),
  add column if not exists non_cash_description text,
  add column if not exists payment_method text not null default 'vult_wallet',
  add column if not exists payment_deadline_days integer not null default 14
    check (payment_deadline_days > 0);

create index if not exists competition_rules_competition_season_idx
on public.competition_rules (competition_season_id, version desc);

create index if not exists competition_rules_created_by_idx
on public.competition_rules (created_by);
