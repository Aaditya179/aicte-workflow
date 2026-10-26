-- SIH26262 Schema Migration 0001
-- Enable required extensions
create extension if not exists pgcrypto;

-- Enum Types (safe idempotency)
do $$ begin
  create type user_role as enum ('institution', 'scrutiny_officer', 'regional_officer', 'evc_member', 'bureau_officer', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_status as enum ('draft', 'in_progress', 'returned', 'approved', 'rejected', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type evc_status as enum ('queued', 'scheduled', 'completed', 'overdue', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type undertaking_status as enum ('pending', 'submitted', 'verified', 'rejected', 'overdue');
exception when duplicate_object then null; end $$;

do $$ begin
  create type doc_status as enum ('active', 'expiring', 'expired', 'renewed', 'under_verification', 'verified');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_kind as enum ('upcoming', 'overdue', 'escalation', 'expiry');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_status as enum ('open', 'acknowledged', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type severity_t as enum ('info', 'warning', 'critical');
exception when duplicate_object then null; end $$;

-- Regions
create table if not exists regions (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

-- Institutions
create table if not exists institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  aicte_id text unique not null,
  state text,
  city text,
  region_id uuid references regions(id),
  kind text check (kind in ('new', 'existing')) default 'existing',
  contact_email text,
  health_score int default 100,
  health_updated_at timestamptz,
  created_at timestamptz default now()
);

-- Profiles (linked to auth.users)
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null,
  region_id uuid references regions(id),
  institution_id uuid references institutions(id),
  phone text,
  locale text default 'en'
);

-- Workflow Templates
create table if not exists workflow_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  definition jsonb not null,
  version int default 1,
  is_active boolean default true
);

-- Applications
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  application_no text unique not null,
  institution_id uuid not null references institutions(id),
  application_type text not null,
  template_id uuid not null references workflow_templates(id),
  current_stage text not null,
  status app_status default 'in_progress',
  assigned_to uuid references profiles(user_id),
  region_id uuid references regions(id),
  submitted_at timestamptz not null,
  stage_entered_at timestamptz not null,
  due_at timestamptz,
  risk_score int,
  risk_label text,
  created_at timestamptz default now()
);

-- Stage History
create table if not exists stage_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  action text not null,  -- start | advance | return | revert | reassign
  reason text,
  actor_id uuid references profiles(user_id),
  entered_at timestamptz not null,
  exited_at timestamptz
);

-- Documents
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  application_id uuid references applications(id),
  doc_type text not null,  -- lease | undertaking_evidence | application_form | evc_report | other
  title text not null,
  storage_path text,
  valid_from date,
  valid_until date,
  status doc_status default 'active',
  uploaded_by uuid references profiles(user_id),
  verified_by uuid references profiles(user_id),
  verified_at timestamptz,
  supersedes_document_id uuid references documents(id),
  created_at timestamptz default now()
);

-- EVC Visits
create table if not exists evc_visits (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id),
  status evc_status default 'queued',
  queued_at timestamptz not null,
  scheduling_due_at timestamptz not null,
  scheduled_for timestamptz,
  completion_due_at timestamptz,
  completed_at timestamptz,
  committee_members uuid[] default '{}',
  report_document_id uuid references documents(id)
);

-- Undertakings
create table if not exists undertakings (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references institutions(id),
  application_id uuid references applications(id),
  title text not null,
  description text,
  condition_type text,
  due_at timestamptz not null,
  status undertaking_status default 'pending',
  evidence_document_id uuid references documents(id),
  verified_by uuid references profiles(user_id),
  verified_at timestamptz,
  remarks text
);

-- SLA Rules
create table if not exists sla_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null,  -- stage | evc_scheduling | evc_completion | undertaking | document_expiry
  stage_key text,
  template_code text,
  region_id uuid references regions(id),
  duration_days int not null,
  reminder_offsets_days int[] default '{7,3,1}',
  is_active boolean default true
);

-- Escalation Chains
create table if not exists escalation_chains (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  region_id uuid references regions(id),
  levels jsonb not null,  -- [{level, after_days_overdue, notify_role}]
  ack_timeout_hours int default 48
);

-- Alerts
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  kind alert_kind not null,
  level int not null default 0,
  severity severity_t not null,
  message text not null,
  status alert_status default 'open',
  target_role text,
  target_user_id uuid references profiles(user_id),
  acknowledged_by uuid references profiles(user_id),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  fired_at timestamptz not null,
  unique (entity_type, entity_id, kind, level)
);

-- Notifications
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id),
  alert_id uuid references alerts(id),
  channel text not null default 'in_app',  -- in_app | email | whatsapp
  title text not null,
  body text,
  status text default 'queued',  -- queued | sent | failed | read
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz default now()
);

-- Audit Log (Cryptographically chained & append-only)
create table if not exists audit_log (
  seq bigserial primary key,
  actor_id uuid,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  ip text,
  prev_hash text not null,
  hash text not null,
  created_at timestamptz default now()
);

-- Prevent update or delete on audit_log
create or replace function audit_block() returns trigger as $$
begin
  raise exception 'audit_log is append-only';
end;
$$ language plpgsql;

drop trigger if exists audit_no_change on audit_log;
create trigger audit_no_change before update or delete on audit_log
  for each row execute function audit_block();

-- System Settings
create table if not exists system_settings (
  key text primary key,
  value jsonb not null
);

insert into system_settings (key, value)
values ('clock_offset_seconds', '0')
on conflict (key) do nothing;

-- Scheduler Runs
create table if not exists scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz,
  finished_at timestamptz,
  clock_now timestamptz,
  alerts_created int default 0,
  escalations_created int default 0,
  errors text
);
