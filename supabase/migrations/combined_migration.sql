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
-- SIH26262 Migration 0002: Row Level Security (RLS) & Custom Claims

-- Helper functions to get current user details from JWT or profiles
create or replace function current_user_role() returns text as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', ''),
    (select role::text from profiles where user_id = auth.uid())
  );
$$ language sql stable security definer;

create or replace function current_user_region_id() returns uuid as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'region_id', '')::uuid,
    (select region_id from profiles where user_id = auth.uid())
  );
$$ language sql stable security definer;

create or replace function current_user_institution_id() returns uuid as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'institution_id', '')::uuid,
    (select institution_id from profiles where user_id = auth.uid())
  );
$$ language sql stable security definer;

-- Trigger to sync profile attributes into auth.users.raw_app_meta_data
create or replace function sync_profile_claims() returns trigger as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role', new.role,
    'region_id', new.region_id,
    'institution_id', new.institution_id
  )
  where id = new.user_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_profile_claims_sync on profiles;
create trigger on_profile_claims_sync
  after insert or update on profiles
  for each row execute function sync_profile_claims();

-- Enable RLS on all tables
alter table regions enable row level security;
alter table institutions enable row level security;
alter table profiles enable row level security;
alter table workflow_templates enable row level security;
alter table applications enable row level security;
alter table stage_history enable row level security;
alter table documents enable row level security;
alter table evc_visits enable row level security;
alter table undertakings enable row level security;
alter table sla_rules enable row level security;
alter table escalation_chains enable row level security;
alter table alerts enable row level security;
alter table notifications enable row level security;
alter table audit_log enable row level security;
alter table system_settings enable row level security;
alter table scheduler_runs enable row level security;

-- 1. Regions
drop policy if exists "Regions read by all authenticated" on regions;
create policy "Regions read by all authenticated" on regions
  for select using (auth.role() = 'authenticated');

-- 2. Institutions
drop policy if exists "Institutions read policy" on institutions;
create policy "Institutions read policy" on institutions
  for select using (
    current_user_role() in ('bureau_officer', 'admin') or
    (current_user_role() in ('scrutiny_officer', 'regional_officer', 'evc_member') and region_id = current_user_region_id()) or
    (current_user_role() = 'institution' and id = current_user_institution_id())
  );

drop policy if exists "Institutions write policy for institution" on institutions;
create policy "Institutions write policy for institution" on institutions
  for update using (
    current_user_role() = 'institution' and id = current_user_institution_id()
  );

-- 3. Profiles
drop policy if exists "Profiles read policy" on profiles;
create policy "Profiles read policy" on profiles
  for select using (
    user_id = auth.uid() or
    current_user_role() in ('bureau_officer', 'admin') or
    (current_user_role() in ('scrutiny_officer', 'regional_officer') and region_id = current_user_region_id())
  );

drop policy if exists "Profiles update own profile" on profiles;
create policy "Profiles update own profile" on profiles
  for update using (user_id = auth.uid());

-- 4. Workflow Templates
drop policy if exists "Workflow templates read by authenticated" on workflow_templates;
create policy "Workflow templates read by authenticated" on workflow_templates
  for select using (auth.role() = 'authenticated');

-- 5. Applications
drop policy if exists "Applications read policy" on applications;
create policy "Applications read policy" on applications
  for select using (
    current_user_role() in ('bureau_officer', 'admin') or
    (current_user_role() in ('scrutiny_officer', 'regional_officer') and region_id = current_user_region_id()) or
    (current_user_role() = 'evc_member' and (assigned_to = auth.uid() or exists (
      select 1 from evc_visits ev where ev.application_id = applications.id and auth.uid() = any(ev.committee_members)
    ))) or
    (current_user_role() = 'institution' and institution_id = current_user_institution_id())
  );

drop policy if exists "Applications insert for institution" on applications;
create policy "Applications insert for institution" on applications
  for insert with check (
    current_user_role() = 'institution' and institution_id = current_user_institution_id()
  );

-- 6. Stage History
drop policy if exists "Stage history read policy" on stage_history;
create policy "Stage history read policy" on stage_history
  for select using (
    exists (
      select 1 from applications a
      where a.id = stage_history.application_id
    )
  );

-- 7. Documents
drop policy if exists "Documents read policy" on documents;
create policy "Documents read policy" on documents
  for select using (
    current_user_role() in ('bureau_officer', 'admin') or
    (current_user_role() in ('scrutiny_officer', 'regional_officer', 'evc_member') and exists (
      select 1 from institutions i where i.id = documents.institution_id and i.region_id = current_user_region_id()
    )) or
    (current_user_role() = 'institution' and institution_id = current_user_institution_id())
  );

drop policy if exists "Documents insert policy for institution" on documents;
create policy "Documents insert policy for institution" on documents
  for insert with check (
    current_user_role() in ('bureau_officer', 'admin', 'regional_officer', 'scrutiny_officer') or
    (current_user_role() = 'institution' and institution_id = current_user_institution_id())
  );

-- 8. EVC Visits
drop policy if exists "EVC visits read policy" on evc_visits;
create policy "EVC visits read policy" on evc_visits
  for select using (
    current_user_role() in ('bureau_officer', 'admin') or
    (current_user_role() = 'regional_officer' and exists (
      select 1 from applications a where a.id = evc_visits.application_id and a.region_id = current_user_region_id()
    )) or
    (current_user_role() = 'evc_member' and auth.uid() = any(committee_members)) or
    (current_user_role() = 'institution' and exists (
      select 1 from applications a where a.id = evc_visits.application_id and a.institution_id = current_user_institution_id()
    ))
  );

-- 9. Undertakings
drop policy if exists "Undertakings read policy" on undertakings;
create policy "Undertakings read policy" on undertakings
  for select using (
    current_user_role() in ('bureau_officer', 'admin') or
    (current_user_role() in ('scrutiny_officer', 'regional_officer') and exists (
      select 1 from institutions i where i.id = undertakings.institution_id and i.region_id = current_user_region_id()
    )) or
    (current_user_role() = 'institution' and institution_id = current_user_institution_id())
  );

drop policy if exists "Undertakings update for institution" on undertakings;
create policy "Undertakings update for institution" on undertakings
  for update using (
    current_user_role() = 'institution' and institution_id = current_user_institution_id()
  );

-- 10. SLA Rules & Escalation Chains
drop policy if exists "SLA rules read policy" on sla_rules;
create policy "SLA rules read policy" on sla_rules
  for select using (auth.role() = 'authenticated');

drop policy if exists "Escalation chains read policy" on escalation_chains;
create policy "Escalation chains read policy" on escalation_chains
  for select using (auth.role() = 'authenticated');

-- 11. Alerts
drop policy if exists "Alerts read policy" on alerts;
create policy "Alerts read policy" on alerts
  for select using (
    current_user_role() in ('bureau_officer', 'admin') or
    target_user_id = auth.uid() or
    target_role = current_user_role()
  );

-- 12. Notifications
drop policy if exists "Notifications user isolation" on notifications;
create policy "Notifications user isolation" on notifications
  for all using (user_id = auth.uid());

-- 13. Audit Log (Read-only for bureau and admin)
drop policy if exists "Audit log read for bureau and admin" on audit_log;
create policy "Audit log read for bureau and admin" on audit_log
  for select using (current_user_role() in ('bureau_officer', 'admin'));

-- 14. System Settings
drop policy if exists "System settings read by authenticated" on system_settings;
create policy "System settings read by authenticated" on system_settings
  for select using (auth.role() = 'authenticated');

-- 15. Scheduler Runs
drop policy if exists "Scheduler runs read for bureau and admin" on scheduler_runs;
create policy "Scheduler runs read for bureau and admin" on scheduler_runs
  for select using (current_user_role() in ('bureau_officer', 'admin'));
-- SIH26262 Migration 0003: Simulated Time Function and Compliance Views

-- Simulated time function based on system_settings clock_offset_seconds
create or replace function app_now() returns timestamptz as $$
  select now() + (
    coalesce((select (value#>>'{}')::bigint from system_settings where key = 'clock_offset_seconds'), 0) * interval '1 second'
  );
$$ language sql stable security definer;

-- 1. v_pendency_by_stage_region
-- Counts and average age by stage and region
create or replace view v_pendency_by_stage_region as
select
  a.region_id,
  r.name as region_name,
  a.current_stage,
  count(*)::int as total_cases,
  count(*) filter (where a.status = 'in_progress')::int as open_cases,
  count(*) filter (where a.status = 'in_progress' and a.due_at < app_now())::int as overdue_cases,
  coalesce(round(avg(extract(epoch from (app_now() - a.stage_entered_at)) / 86400.0)::numeric, 1), 0.0) as avg_stage_age_days,
  coalesce(round(avg(extract(epoch from (app_now() - a.submitted_at)) / 86400.0)::numeric, 1), 0.0) as avg_total_age_days
from applications a
left join regions r on r.id = a.region_id
group by a.region_id, r.name, a.current_stage;

-- 2. v_officer_workload
-- Open, overdue and average age per officer
create or replace view v_officer_workload as
select
  p.user_id as officer_id,
  p.full_name as officer_name,
  p.role as officer_role,
  p.region_id,
  r.name as region_name,
  count(a.id) filter (where a.status = 'in_progress')::int as open_cases,
  count(a.id) filter (where a.status = 'in_progress' and a.due_at < app_now())::int as overdue_cases,
  coalesce(round(avg(extract(epoch from (app_now() - a.stage_entered_at)) / 86400.0) filter (where a.status = 'in_progress')::numeric, 1), 0.0) as avg_case_age_days
from profiles p
left join regions r on r.id = p.region_id
left join applications a on a.assigned_to = p.user_id
where p.role in ('scrutiny_officer', 'regional_officer', 'evc_member', 'bureau_officer')
group by p.user_id, p.full_name, p.role, p.region_id, r.name;

-- 3. v_overdue_summary
-- Overdue applications, EVCs, undertakings and documents by region
create or replace view v_overdue_summary as
select
  r.id as region_id,
  r.name as region_name,
  -- Overdue Applications
  coalesce((
    select count(*)::int
    from applications a
    where a.region_id = r.id
      and a.status = 'in_progress'
      and a.due_at < app_now()
  ), 0) as overdue_applications,
  -- Overdue EVC visits
  coalesce((
    select count(*)::int
    from evc_visits ev
    join applications a on a.id = ev.application_id
    where a.region_id = r.id
      and (
        (ev.status = 'queued' and ev.scheduling_due_at < app_now()) or
        (ev.status in ('scheduled', 'queued') and ev.completion_due_at is not null and ev.completion_due_at < app_now())
      )
  ), 0) as overdue_evcs,
  -- Overdue Undertakings
  coalesce((
    select count(*)::int
    from undertakings u
    join institutions i on i.id = u.institution_id
    where i.region_id = r.id
      and u.status in ('pending', 'rejected', 'overdue')
      and u.due_at < app_now()
  ), 0) as overdue_undertakings,
  -- Expired / Expiring Documents
  coalesce((
    select count(*)::int
    from documents d
    join institutions i on i.id = d.institution_id
    where i.region_id = r.id
      and (
        (d.valid_until < app_now() and d.status in ('expired', 'active')) or
        d.status = 'expired'
      )
  ), 0) as expired_documents
from regions r;

-- 4. v_institution_compliance
-- Pending undertakings, expiring documents and health score per institution
create or replace view v_institution_compliance as
select
  i.id as institution_id,
  i.name as institution_name,
  i.aicte_id,
  i.region_id,
  r.name as region_name,
  i.health_score,
  coalesce(count(distinct u.id) filter (where u.status in ('pending', 'rejected')), 0)::int as pending_undertakings,
  coalesce(count(distinct u.id) filter (where u.status in ('pending', 'rejected', 'overdue') and u.due_at < app_now()), 0)::int as overdue_undertakings,
  coalesce(count(distinct d.id) filter (where d.valid_until between app_now() and (app_now() + interval '30 days')), 0)::int as expiring_documents,
  coalesce(count(distinct d.id) filter (where d.valid_until < app_now() or d.status = 'expired'), 0)::int as expired_documents
from institutions i
left join regions r on r.id = i.region_id
left join undertakings u on u.institution_id = i.id
left join documents d on d.institution_id = i.id
group by i.id, i.name, i.aicte_id, i.region_id, r.name, i.health_score;
