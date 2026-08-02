create extension if not exists pgcrypto;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  competition_season_id uuid references public.competition_seasons(id) on delete set null,
  slug text not null,
  title text not null check (char_length(btrim(title)) between 5 and 180),
  summary text check (summary is null or char_length(btrim(summary)) between 10 and 500),
  body text not null check (char_length(btrim(body)) between 20 and 20000),
  category text not null default 'general' check (category in ('general','registration','gameweek','leaderboard','winner','payment','rules','maintenance')),
  audience text not null default 'public' check (audience in ('public','participants','admins','all')),
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
  is_pinned boolean not null default false,
  publish_at timestamptz,
  expires_at timestamptz,
  published_at timestamptz,
  created_by uuid references public.admin_profiles(id) on delete set null,
  updated_by uuid references public.admin_profiles(id) on delete set null,
  published_by uuid references public.admin_profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (expires_at is null or publish_at is null or expires_at > publish_at)
);

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (event_key ~ '^[a-z0-9_]+$'),
  name text not null check (char_length(btrim(name)) between 3 and 120),
  description text,
  subject_template text,
  body_template text not null check (char_length(btrim(body_template)) between 5 and 10000),
  default_channels text[] not null default array['in_app']::text[],
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references public.admin_profiles(id) on delete set null,
  updated_by uuid references public.admin_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (default_channels <@ array['email','whatsapp','in_app','manual']::text[])
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  case_reference text not null default ('VFD-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12))),
  competition_season_id uuid not null references public.competition_seasons(id) on delete restrict,
  registration_id uuid not null references public.registrations(id) on delete restrict,
  participant_id uuid not null references public.participants(id) on delete restrict,
  category text not null check (category in ('registration','score','eligibility','winner','payment','other')),
  subject text not null check (char_length(btrim(subject)) between 8 and 180),
  description text not null check (char_length(btrim(description)) between 20 and 5000),
  related_reference text,
  related_round_id uuid references public.rounds(id) on delete set null,
  related_monthly_period_id uuid references public.monthly_periods(id) on delete set null,
  related_winner_candidate_id uuid references public.winner_candidates(id) on delete set null,
  related_payment_id uuid references public.prize_payments(id) on delete set null,
  status text not null default 'open' check (status in ('open','assigned','under_review','awaiting_participant','resolved','rejected','escalated','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references public.admin_profiles(id) on delete set null,
  escalated_to uuid references public.admin_profiles(id) on delete set null,
  submitted_channel text not null default 'web' check (submitted_channel in ('web','admin','email','whatsapp','phone')),
  contact_email text,
  contact_phone text,
  decision text check (decision is null or decision in ('upheld','partially_upheld','rejected','no_action','withdrawn')),
  resolution_summary text,
  resolved_by uuid references public.admin_profiles(id) on delete set null,
  resolved_at timestamptz,
  closed_by uuid references public.admin_profiles(id) on delete set null,
  closed_at timestamptz,
  due_at timestamptz,
  last_activity_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_reference)
);

create table public.dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete restrict,
  author_type text not null check (author_type in ('participant','admin','system')),
  author_admin_id uuid references public.admin_profiles(id) on delete set null,
  channel text not null default 'in_app' check (channel in ('in_app','email','whatsapp','phone','internal')),
  visibility text not null default 'participant' check (visibility in ('participant','internal')),
  message text not null check (char_length(btrim(message)) between 2 and 10000),
  created_at timestamptz not null default now(),
  check ((author_type = 'admin' and author_admin_id is not null) or author_type <> 'admin')
);

create table public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete restrict,
  submitted_by_type text not null check (submitted_by_type in ('participant','admin','system')),
  submitted_by_admin uuid references public.admin_profiles(id) on delete set null,
  visibility text not null default 'participant' check (visibility in ('participant','internal')),
  evidence_type text not null default 'supporting_document' check (evidence_type in ('supporting_document','screenshot','statement','payment_receipt','score_evidence','other')),
  storage_path text,
  external_url text,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  notes text,
  created_at timestamptz not null default now(),
  check (nullif(btrim(coalesce(storage_path, '')), '') is not null or nullif(btrim(coalesce(external_url, '')), '') is not null),
  check ((submitted_by_type = 'admin' and submitted_by_admin is not null) or submitted_by_type <> 'admin')
);

create table public.dispute_status_history (
  id bigint generated by default as identity primary key,
  dispute_id uuid not null references public.disputes(id) on delete restrict,
  from_status text,
  to_status text not null,
  action text not null,
  actor_type text not null check (actor_type in ('participant','admin','system')),
  actor_admin_id uuid references public.admin_profiles(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  competition_season_id uuid references public.competition_seasons(id) on delete set null,
  participant_id uuid references public.participants(id) on delete set null,
  registration_id uuid references public.registrations(id) on delete set null,
  dispute_id uuid references public.disputes(id) on delete set null,
  winner_candidate_id uuid references public.winner_candidates(id) on delete set null,
  payment_id uuid references public.prize_payments(id) on delete set null,
  template_id uuid references public.notification_templates(id) on delete set null,
  channel text not null check (channel in ('email','whatsapp','in_app','manual')),
  recipient text not null,
  subject text,
  body text not null check (char_length(btrim(body)) between 2 and 10000),
  status text not null default 'queued' check (status in ('queued','manual_pending','sent','failed','cancelled','skipped')),
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text,
  failure_reason text,
  idempotency_key text not null,
  created_by uuid references public.admin_profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create table public.notification_delivery_attempts (
  id bigint generated by default as identity primary key,
  notification_id uuid not null references public.notification_outbox(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  delivery_method text not null check (delivery_method in ('manual','provider','in_app')),
  outcome text not null check (outcome in ('sent','failed','cancelled','skipped')),
  provider_message_id text,
  failure_reason text,
  attempted_by uuid references public.admin_profiles(id) on delete set null,
  attempted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (notification_id, attempt_number)
);

create table public.dispute_public_access_tokens (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index announcements_publication_idx on public.announcements(status, publish_at desc, is_pinned desc);
create index announcements_season_idx on public.announcements(competition_season_id, status);
create index disputes_season_status_idx on public.disputes(competition_season_id, status, created_at desc);
create index disputes_registration_idx on public.disputes(registration_id, created_at desc);
create index disputes_participant_idx on public.disputes(participant_id, created_at desc);
create index disputes_assignment_idx on public.disputes(assigned_to, status, due_at);
create index disputes_escalation_idx on public.disputes(escalated_to, status);
create index disputes_related_round_idx on public.disputes(related_round_id);
create index disputes_related_monthly_idx on public.disputes(related_monthly_period_id);
create index disputes_related_winner_idx on public.disputes(related_winner_candidate_id);
create index disputes_related_payment_idx on public.disputes(related_payment_id);
create index dispute_messages_dispute_idx on public.dispute_messages(dispute_id, created_at);
create index dispute_messages_author_admin_idx on public.dispute_messages(author_admin_id);
create index dispute_evidence_dispute_idx on public.dispute_evidence(dispute_id, created_at);
create index dispute_evidence_admin_idx on public.dispute_evidence(submitted_by_admin);
create index dispute_status_history_dispute_idx on public.dispute_status_history(dispute_id, created_at desc);
create index dispute_status_history_admin_idx on public.dispute_status_history(actor_admin_id);
create index notification_outbox_status_idx on public.notification_outbox(status, scheduled_at, created_at);
create index notification_outbox_participant_idx on public.notification_outbox(participant_id, created_at desc);
create index notification_outbox_registration_idx on public.notification_outbox(registration_id, created_at desc);
create index notification_outbox_dispute_idx on public.notification_outbox(dispute_id, created_at desc);
create index notification_outbox_winner_idx on public.notification_outbox(winner_candidate_id);
create index notification_outbox_payment_idx on public.notification_outbox(payment_id);
create index notification_outbox_template_idx on public.notification_outbox(template_id);
create index notification_outbox_created_by_idx on public.notification_outbox(created_by);
create index notification_delivery_notification_idx on public.notification_delivery_attempts(notification_id, attempted_at desc);
create index notification_delivery_attempted_by_idx on public.notification_delivery_attempts(attempted_by);
create index dispute_public_access_dispute_idx on public.dispute_public_access_tokens(dispute_id, expires_at desc);

create trigger announcements_set_updated_at before update on public.announcements for each row execute function public.set_updated_at();
create trigger notification_templates_set_updated_at before update on public.notification_templates for each row execute function public.set_updated_at();
create trigger disputes_set_updated_at before update on public.disputes for each row execute function public.set_updated_at();
create trigger notification_outbox_set_updated_at before update on public.notification_outbox for each row execute function public.set_updated_at();

create or replace function private.prevent_immutable_communication_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using message = 'This communication or case audit record is immutable.';
end;
$$;

create trigger dispute_messages_immutable before update or delete on public.dispute_messages for each row execute function private.prevent_immutable_communication_change();
create trigger dispute_evidence_immutable before update or delete on public.dispute_evidence for each row execute function private.prevent_immutable_communication_change();
create trigger dispute_status_history_immutable before update or delete on public.dispute_status_history for each row execute function private.prevent_immutable_communication_change();
create trigger notification_delivery_attempts_immutable before update or delete on public.notification_delivery_attempts for each row execute function private.prevent_immutable_communication_change();

alter table public.announcements enable row level security;
alter table public.notification_templates enable row level security;
alter table public.disputes enable row level security;
alter table public.dispute_messages enable row level security;
alter table public.dispute_evidence enable row level security;
alter table public.dispute_status_history enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_delivery_attempts enable row level security;
alter table public.dispute_public_access_tokens enable row level security;

create policy announcements_admin_read on public.announcements for select to authenticated using ((select private.is_active_admin()));
create policy notification_templates_admin_read on public.notification_templates for select to authenticated using ((select private.is_active_admin()));
create policy disputes_admin_read on public.disputes for select to authenticated using ((select private.is_active_admin()));
create policy dispute_messages_admin_read on public.dispute_messages for select to authenticated using ((select private.is_active_admin()));
create policy dispute_evidence_admin_read on public.dispute_evidence for select to authenticated using ((select private.is_active_admin()));
create policy dispute_status_history_admin_read on public.dispute_status_history for select to authenticated using ((select private.is_active_admin()));
create policy notification_outbox_admin_read on public.notification_outbox for select to authenticated using ((select private.is_active_admin()));
create policy notification_delivery_attempts_admin_read on public.notification_delivery_attempts for select to authenticated using ((select private.is_active_admin()));

revoke all on public.announcements from anon, authenticated;
revoke all on public.notification_templates from anon, authenticated;
revoke all on public.disputes from anon, authenticated;
revoke all on public.dispute_messages from anon, authenticated;
revoke all on public.dispute_evidence from anon, authenticated;
revoke all on public.dispute_status_history from anon, authenticated;
revoke all on public.notification_outbox from anon, authenticated;
revoke all on public.notification_delivery_attempts from anon, authenticated;
revoke all on public.dispute_public_access_tokens from anon, authenticated;

grant select on public.announcements to authenticated;
grant select on public.notification_templates to authenticated;
grant select on public.disputes to authenticated;
grant select on public.dispute_messages to authenticated;
grant select on public.dispute_evidence to authenticated;
grant select on public.dispute_status_history to authenticated;
grant select on public.notification_outbox to authenticated;
grant select on public.notification_delivery_attempts to authenticated;

grant all on public.announcements to service_role;
grant all on public.notification_templates to service_role;
grant all on public.disputes to service_role;
grant all on public.dispute_messages to service_role;
grant all on public.dispute_evidence to service_role;
grant all on public.dispute_status_history to service_role;
grant all on public.notification_outbox to service_role;
grant all on public.notification_delivery_attempts to service_role;
grant all on public.dispute_public_access_tokens to service_role;
grant usage, select on sequence public.dispute_status_history_id_seq to service_role;
grant usage, select on sequence public.notification_delivery_attempts_id_seq to service_role;

insert into public.notification_templates(event_key, name, description, subject_template, body_template, default_channels)
values
  ('dispute_received','Dispute received','Acknowledges a newly submitted participant dispute.','Your Vult Fantasy case {{case_reference}} was received','We received your case {{case_reference}} about {{subject}}. The current status is Open. Keep this reference for follow-up.',array['in_app','email','whatsapp']),
  ('dispute_updated','Dispute updated','Notifies a participant about a case update.','Update on Vult Fantasy case {{case_reference}}','Your case {{case_reference}} has been updated: {{message}}',array['in_app','email','whatsapp']),
  ('dispute_resolved','Dispute resolved','Notifies a participant about a final case decision.','Decision on Vult Fantasy case {{case_reference}}','A decision has been recorded for case {{case_reference}}: {{resolution}}',array['in_app','email','whatsapp']),
  ('registration_received','Registration received','Future registration acknowledgement template.','Vult Fantasy registration received','Your Vult Fantasy registration {{registration_reference}} has been received.',array['email','whatsapp','in_app']),
  ('winner_confirmed','Winner confirmed','Future confirmed-winner template.','Vult Fantasy winner confirmation','Your Vult Fantasy winner verification has been completed.',array['email','whatsapp','in_app']),
  ('prize_paid','Prize paid','Future manual Vult credit confirmation template.','Vult Fantasy prize credited','Your prize has been credited to your verified Vult account. Transaction reference: {{transaction_reference}}.',array['email','whatsapp','in_app'])
on conflict (event_key) do nothing;
