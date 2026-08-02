drop policy if exists prize_payments_admin_insert on public.prize_payments;
drop policy if exists prize_payments_admin_update on public.prize_payments;
drop policy if exists prize_payments_admin_delete on public.prize_payments;
drop policy if exists prize_payments_admin_read on public.prize_payments;

alter table public.prize_payments
  drop constraint if exists prize_payments_approved_by_fkey,
  drop constraint if exists prize_payments_paid_by_fkey,
  drop constraint if exists prize_payments_status_check;

alter table public.prize_payments
  add column if not exists competition_season_id uuid references public.competition_seasons(id) on delete restrict,
  add column if not exists award_reference text,
  add column if not exists prize_type text not null default 'cash',
  add column if not exists payment_method text not null default 'vult_wallet',
  add column if not exists non_cash_description text,
  add column if not exists destination_status text not null default 'pending',
  add column if not exists destination_verified_by uuid references public.admin_profiles(id) on delete set null,
  add column if not exists destination_verified_at timestamptz,
  add column if not exists destination_verification_notes text,
  add column if not exists finance_review_status text not null default 'pending',
  add column if not exists finance_reviewed_by uuid references public.admin_profiles(id) on delete set null,
  add column if not exists finance_reviewed_at timestamptz,
  add column if not exists finance_review_notes text,
  add column if not exists approved_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists failure_code text,
  add column if not exists failure_reason text,
  add column if not exists cancelled_by uuid references public.admin_profiles(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists reversal_status text not null default 'none',
  add column if not exists reconciliation_status text not null default 'pending',
  add column if not exists payment_deadline_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists prize_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists winner_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists destination_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.prize_payments pp
set competition_season_id = wc.competition_season_id,
    award_reference = coalesce(pp.award_reference, 'VFP-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12)))
from public.winner_candidates wc
where wc.id = pp.winner_candidate_id
  and (pp.competition_season_id is null or pp.award_reference is null);

alter table public.prize_payments
  alter column competition_season_id set not null,
  alter column award_reference set default ('VFP-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))),
  alter column award_reference set not null,
  alter column prize_id set not null,
  alter column status set default 'destination_pending';

alter table public.prize_payments
  add constraint prize_payments_approved_by_fkey foreign key (approved_by) references public.admin_profiles(id) on delete set null,
  add constraint prize_payments_paid_by_fkey foreign key (paid_by) references public.admin_profiles(id) on delete set null,
  add constraint prize_payments_status_check check (status in (
    'destination_pending', 'finance_review', 'approved', 'processing', 'paid', 'failed',
    'cancelled', 'reversal_requested', 'reversal_approved', 'reversal_processing', 'reversed'
  )),
  add constraint prize_payments_prize_type_check check (prize_type in ('cash', 'non_cash', 'mixed')),
  add constraint prize_payments_destination_status_check check (destination_status in ('pending', 'verified', 'rejected', 'not_required')),
  add constraint prize_payments_finance_review_status_check check (finance_review_status in ('pending', 'approved', 'rejected')),
  add constraint prize_payments_reversal_status_check check (reversal_status in ('none', 'requested', 'approved', 'processing', 'completed', 'rejected', 'failed', 'cancelled')),
  add constraint prize_payments_reconciliation_status_check check (reconciliation_status in ('pending', 'matched', 'mismatch', 'resolved', 'not_required')),
  add constraint prize_payments_attempt_count_check check (attempt_count >= 0),
  add constraint prize_payments_award_reference_key unique (award_reference);

create table public.prize_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.prize_payments(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  idempotency_key text not null,
  processor text not null default 'manual' check (processor in ('manual', 'vult_api', 'import')),
  status text not null default 'initiated' check (status in ('initiated', 'succeeded', 'failed', 'cancelled')),
  amount numeric(18,2) not null check (amount >= 0),
  currency text not null,
  destination_reference text,
  transaction_reference text,
  evidence_path text,
  failure_code text,
  failure_reason text,
  requested_by uuid not null references public.admin_profiles(id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, attempt_number),
  unique (idempotency_key),
  unique (transaction_reference)
);

alter table public.prize_payments
  add column if not exists current_attempt_id uuid references public.prize_payment_attempts(id) on delete set null;

create table public.prize_payment_status_history (
  id bigint generated by default as identity primary key,
  payment_id uuid not null references public.prize_payments(id) on delete restrict,
  from_status text,
  to_status text not null,
  action text not null,
  actor_user_id uuid references public.admin_profiles(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.prize_payment_evidence (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.prize_payments(id) on delete restrict,
  attempt_id uuid references public.prize_payment_attempts(id) on delete set null,
  evidence_type text not null check (evidence_type in (
    'destination_verification', 'finance_approval', 'payment_receipt', 'payment_failure',
    'reversal', 'reconciliation', 'non_cash_fulfilment', 'other'
  )),
  storage_path text,
  external_url text,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  notes text,
  uploaded_by uuid not null references public.admin_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (nullif(btrim(coalesce(storage_path, '')), '') is not null or nullif(btrim(coalesce(external_url, '')), '') is not null)
);

create table public.prize_payment_reversals (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.prize_payments(id) on delete restrict,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'processing', 'completed', 'failed', 'cancelled')),
  reason text not null check (char_length(btrim(reason)) >= 8),
  requested_by uuid not null references public.admin_profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.admin_profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  transaction_reference text unique,
  evidence_path text,
  completed_by uuid references public.admin_profiles(id) on delete set null,
  completed_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index prize_payment_reversals_active_idx
  on public.prize_payment_reversals(payment_id)
  where status in ('requested', 'approved', 'processing');

create table public.prize_payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.prize_payments(id) on delete restrict,
  status text not null check (status in ('matched', 'mismatch', 'resolved')),
  external_reference text,
  matched_amount numeric(18,2) check (matched_amount is null or matched_amount >= 0),
  matched_currency text,
  statement_date date,
  notes text not null check (char_length(btrim(notes)) >= 8),
  reviewed_by uuid not null references public.admin_profiles(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index prize_payments_season_status_idx on public.prize_payments(competition_season_id, status, created_at desc);
create index prize_payments_destination_verified_by_idx on public.prize_payments(destination_verified_by);
create index prize_payments_finance_reviewed_by_idx on public.prize_payments(finance_reviewed_by);
create index prize_payments_cancelled_by_idx on public.prize_payments(cancelled_by);
create index prize_payments_current_attempt_idx on public.prize_payments(current_attempt_id);
create index prize_payment_attempts_payment_idx on public.prize_payment_attempts(payment_id, attempt_number desc);
create index prize_payment_attempts_requested_by_idx on public.prize_payment_attempts(requested_by);
create index prize_payment_status_history_payment_idx on public.prize_payment_status_history(payment_id, created_at desc);
create index prize_payment_status_history_actor_idx on public.prize_payment_status_history(actor_user_id);
create index prize_payment_evidence_payment_idx on public.prize_payment_evidence(payment_id, created_at desc);
create index prize_payment_evidence_attempt_idx on public.prize_payment_evidence(attempt_id);
create index prize_payment_evidence_uploaded_by_idx on public.prize_payment_evidence(uploaded_by);
create index prize_payment_reversals_payment_idx on public.prize_payment_reversals(payment_id, created_at desc);
create index prize_payment_reversals_requested_by_idx on public.prize_payment_reversals(requested_by);
create index prize_payment_reversals_reviewed_by_idx on public.prize_payment_reversals(reviewed_by);
create index prize_payment_reversals_completed_by_idx on public.prize_payment_reversals(completed_by);
create index prize_payment_reconciliations_payment_idx on public.prize_payment_reconciliations(payment_id, created_at desc);
create index prize_payment_reconciliations_reviewed_by_idx on public.prize_payment_reconciliations(reviewed_by);

create trigger prize_payment_attempts_set_updated_at
  before update on public.prize_payment_attempts
  for each row execute function public.set_updated_at();
create trigger prize_payment_reversals_set_updated_at
  before update on public.prize_payment_reversals
  for each row execute function public.set_updated_at();

drop trigger if exists prize_payments_set_updated_at on public.prize_payments;
create trigger prize_payments_set_updated_at
  before update on public.prize_payments
  for each row execute function public.set_updated_at();

create or replace function private.prevent_immutable_payment_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using message = 'This payment audit record is immutable.';
end;
$$;

create trigger prize_payment_status_history_immutable
  before update or delete on public.prize_payment_status_history
  for each row execute function private.prevent_immutable_payment_record_change();
create trigger prize_payment_evidence_immutable
  before update or delete on public.prize_payment_evidence
  for each row execute function private.prevent_immutable_payment_record_change();
create trigger prize_payment_reconciliations_immutable
  before update or delete on public.prize_payment_reconciliations
  for each row execute function private.prevent_immutable_payment_record_change();

alter table public.prize_payment_attempts enable row level security;
alter table public.prize_payment_status_history enable row level security;
alter table public.prize_payment_evidence enable row level security;
alter table public.prize_payment_reversals enable row level security;
alter table public.prize_payment_reconciliations enable row level security;

create policy prize_payments_admin_read on public.prize_payments
  for select to authenticated using (private.is_active_admin());
create policy prize_payment_attempts_admin_read on public.prize_payment_attempts
  for select to authenticated using (private.is_active_admin());
create policy prize_payment_status_history_admin_read on public.prize_payment_status_history
  for select to authenticated using (private.is_active_admin());
create policy prize_payment_evidence_admin_read on public.prize_payment_evidence
  for select to authenticated using (private.is_active_admin());
create policy prize_payment_reversals_admin_read on public.prize_payment_reversals
  for select to authenticated using (private.is_active_admin());
create policy prize_payment_reconciliations_admin_read on public.prize_payment_reconciliations
  for select to authenticated using (private.is_active_admin());

revoke all on public.prize_payments from anon, authenticated;
revoke all on public.prize_payment_attempts from anon, authenticated;
revoke all on public.prize_payment_status_history from anon, authenticated;
revoke all on public.prize_payment_evidence from anon, authenticated;
revoke all on public.prize_payment_reversals from anon, authenticated;
revoke all on public.prize_payment_reconciliations from anon, authenticated;
grant select on public.prize_payments to authenticated;
grant select on public.prize_payment_attempts to authenticated;
grant select on public.prize_payment_status_history to authenticated;
grant select on public.prize_payment_evidence to authenticated;
grant select on public.prize_payment_reversals to authenticated;
grant select on public.prize_payment_reconciliations to authenticated;

comment on table public.prize_payments is 'One controlled settlement obligation per confirmed winner candidate.';
comment on table public.prize_payment_attempts is 'Every payout or fulfilment attempt with idempotency, outcome and evidence.';
comment on table public.prize_payment_status_history is 'Append-only audit trail for prize settlement status changes.';
comment on table public.prize_payment_evidence is 'Immutable evidence references supporting payment, failure, reversal and reconciliation decisions.';
comment on table public.prize_payment_reversals is 'Dual-control reversal workflow for completed prize payments.';
comment on table public.prize_payment_reconciliations is 'Immutable finance reconciliation reviews for prize settlements.';