create extension if not exists pgcrypto;

create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  starts_on date,
  ends_on date,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.competition_seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  slug text not null unique,
  name text not null,
  status text not null default 'draft'
    check (status in (
      'draft',
      'registration_open',
      'registration_closed',
      'active',
      'completed',
      'archived',
      'cancelled'
    )),
  data_provider text not null default 'mock'
    check (data_provider in ('mock', 'csv', 'approved_fpl', 'licensed')),
  external_league_id text,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  rules_version integer not null default 1 check (rules_version > 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, season_id),
  check (
    registration_closes_at is null
    or registration_opens_at is null
    or registration_closes_at >= registration_opens_at
  ),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  external_round_id integer not null check (external_round_id > 0),
  name text not null,
  deadline_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'awaiting_finalisation', 'final', 'locked', 'cancelled')),
  is_current boolean not null default false,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_season_id, external_round_id)
);

create unique index rounds_one_current_per_competition_season
  on public.rounds (competition_season_id)
  where is_current = true;

create table public.monthly_periods (
  id uuid primary key default gen_random_uuid(),
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  name text not null,
  start_round integer not null check (start_round > 0),
  end_round integer not null check (end_round >= start_round),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'locked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_season_id, name)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  phone text not null,
  whatsapp_phone text,
  date_of_birth date,
  country text not null default 'Sierra Leone',
  city text,
  vult_customer_ref text,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index participants_phone_unique
  on public.participants (lower(phone));

create unique index participants_email_unique
  on public.participants (lower(email))
  where email is not null;

create unique index participants_vult_customer_ref_unique
  on public.participants (lower(vult_customer_ref))
  where vult_customer_ref is not null;

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete restrict,
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended', 'disqualified')),
  eligibility_status text not null default 'pending'
    check (eligibility_status in ('pending', 'eligible', 'ineligible', 'review_required')),
  registered_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, competition_season_id)
);

create table public.fantasy_entries (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete cascade,
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  provider text not null default 'mock'
    check (provider in ('mock', 'csv', 'approved_fpl', 'licensed')),
  provider_entry_id text not null,
  manager_name text,
  team_name text,
  verified_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_season_id, provider, provider_entry_id)
);

create table public.score_snapshots (
  id uuid primary key default gen_random_uuid(),
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  source_endpoint text not null,
  request_key text not null,
  response_data jsonb not null,
  response_hash text,
  http_status integer,
  fetched_at timestamptz not null default now()
);

create index score_snapshots_request_lookup
  on public.score_snapshots (competition_season_id, request_key, fetched_at desc);

create table public.round_scores (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  reported_points integer not null default 0,
  effective_points integer not null default 0,
  total_points integer not null default 0,
  transfer_cost integer not null default 0 check (transfer_cost >= 0),
  chip_used text,
  round_rank bigint,
  overall_rank bigint,
  is_provisional boolean not null default true,
  source_snapshot_id uuid references public.score_snapshots(id) on delete set null,
  finalised_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id, round_id)
);

create index round_scores_round_ranking
  on public.round_scores (round_id, effective_points desc, round_rank asc nulls last);

create table public.prizes (
  id uuid primary key default gen_random_uuid(),
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  code text not null,
  name text not null,
  frequency text not null
    check (frequency in ('weekly', 'monthly', 'overall', 'special')),
  position integer not null default 1 check (position > 0),
  amount numeric(18, 2) not null default 0 check (amount >= 0),
  currency text not null default 'SLE',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_season_id, code)
);

create table public.winner_candidates (
  id uuid primary key default gen_random_uuid(),
  competition_season_id uuid not null references public.competition_seasons(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete restrict,
  prize_id uuid references public.prizes(id) on delete restrict,
  round_id uuid references public.rounds(id) on delete restrict,
  monthly_period_id uuid references public.monthly_periods(id) on delete restrict,
  score integer not null,
  rank integer not null default 1 check (rank > 0),
  status text not null default 'provisional'
    check (status in (
      'provisional',
      'under_review',
      'compliance_approved',
      'rejected',
      'confirmed',
      'payment_pending',
      'paid',
      'published'
    )),
  rules_version integer not null check (rules_version > 0),
  generated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (round_id is not null or monthly_period_id is not null or prize_id is not null)
);

create table public.prize_payments (
  id uuid primary key default gen_random_uuid(),
  winner_candidate_id uuid not null unique references public.winner_candidates(id) on delete restrict,
  participant_id uuid not null references public.participants(id) on delete restrict,
  prize_id uuid references public.prizes(id) on delete restrict,
  amount numeric(18, 2) not null check (amount >= 0),
  currency text not null default 'SLE',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'processing', 'paid', 'failed', 'reversed', 'cancelled')),
  destination_reference text,
  transaction_reference text unique,
  evidence_path text,
  approved_by uuid references auth.users(id) on delete set null,
  paid_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null
    check (role in (
      'super_admin',
      'competition_manager',
      'compliance_officer',
      'finance_officer',
      'content_manager',
      'support_officer',
      'auditor'
    )),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated by default as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_lookup
  on public.audit_logs (entity_type, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger competitions_set_updated_at
before update on public.competitions
for each row execute function public.set_updated_at();

create trigger seasons_set_updated_at
before update on public.seasons
for each row execute function public.set_updated_at();

create trigger competition_seasons_set_updated_at
before update on public.competition_seasons
for each row execute function public.set_updated_at();

create trigger rounds_set_updated_at
before update on public.rounds
for each row execute function public.set_updated_at();

create trigger monthly_periods_set_updated_at
before update on public.monthly_periods
for each row execute function public.set_updated_at();

create trigger participants_set_updated_at
before update on public.participants
for each row execute function public.set_updated_at();

create trigger registrations_set_updated_at
before update on public.registrations
for each row execute function public.set_updated_at();

create trigger fantasy_entries_set_updated_at
before update on public.fantasy_entries
for each row execute function public.set_updated_at();

create trigger round_scores_set_updated_at
before update on public.round_scores
for each row execute function public.set_updated_at();

create trigger prizes_set_updated_at
before update on public.prizes
for each row execute function public.set_updated_at();

create trigger winner_candidates_set_updated_at
before update on public.winner_candidates
for each row execute function public.set_updated_at();

create trigger prize_payments_set_updated_at
before update on public.prize_payments
for each row execute function public.set_updated_at();

create trigger admin_profiles_set_updated_at
before update on public.admin_profiles
for each row execute function public.set_updated_at();

alter table public.competitions enable row level security;
alter table public.seasons enable row level security;
alter table public.competition_seasons enable row level security;
alter table public.rounds enable row level security;
alter table public.monthly_periods enable row level security;
alter table public.participants enable row level security;
alter table public.registrations enable row level security;
alter table public.fantasy_entries enable row level security;
alter table public.score_snapshots enable row level security;
alter table public.round_scores enable row level security;
alter table public.prizes enable row level security;
alter table public.winner_candidates enable row level security;
alter table public.prize_payments enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.audit_logs enable row level security;

comment on table public.competition_seasons is
  'Season-specific configuration for a permanent Vult competition.';
comment on table public.registrations is
  'A participant registration for one competition season.';
comment on table public.score_snapshots is
  'Immutable raw responses received from a fantasy data provider.';
comment on table public.winner_candidates is
  'Provisional and approved winners generated by the scoring and eligibility engine.';
