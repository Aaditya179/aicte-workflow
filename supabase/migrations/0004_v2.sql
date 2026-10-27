-- Migration 0004_v2.sql: Section 15 additions from Solution Package
-- Run enum modifications first

alter type user_role add value if not exists 'auditor';
alter type user_role add value if not exists 'sac_shc_member';

alter table profiles add column if not exists bureau text;
alter table profiles add column if not exists base_city text;
alter table applications add column if not exists bureau text;

alter table documents add column if not exists sha256 text;
alter table documents add column if not exists version int default 1;
alter table documents add column if not exists metadata jsonb default '{}';  -- extracted fields: institution_name, land_area, ...
alter table documents add column if not exists ocr_suggested_expiry date;
alter table documents add column if not exists ocr_confidence numeric;
alter table documents add column if not exists ocr_status text default 'none';  -- none | suggested | accepted | edited | rejected

alter table notifications add column if not exists delivery_status text default 'queued';  -- queued | sent | delivered | failed | read
alter table notifications add column if not exists delivered_at timestamptz;
alter table notifications add column if not exists provider_ref text;

alter table evc_visits add column if not exists location text;

-- Document Access Log (§15.1, §15.8)
create table if not exists document_access_log (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id),
  user_id uuid references profiles(user_id),
  action text not null,  -- upload | view | download | verify
  ip text,
  created_at timestamptz default now()
);

-- Message Templates for Notifications (§15.1, §15.7)
create table if not exists message_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,  -- acknowledgement | deficiency_letter | deadline_reminder | escalation_notice | renewal_request | undertaking_notice
  channel text not null default 'email',
  locale text not null default 'en',
  subject text,
  body text not null,  -- placeholders like {{reference_no}}, {{due_date}}, {{link}}
  unique (code, channel, locale)
);

-- Central Communications Log (§15.1, §15.7)
create table if not exists communications (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id),
  template_code text,
  channel text,
  subject text,
  body text,
  sent_by uuid references profiles(user_id),
  sent_at timestamptz default now()
);

-- EVC Member Availability Calendar (§15.1, §15.4)
create table if not exists evc_availability (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles(user_id),
  day date not null,
  available boolean default true,
  unique (member_id, day)
);

-- Mandatory Evidence Rules (§15.1, §15.2)
create table if not exists mandatory_evidence (
  id uuid primary key default gen_random_uuid(),
  template_code text not null,
  stage_key text not null,
  doc_type text not null,
  label text not null
);

-- Decisions & Evidence Linking (§15.1, §15.2)
create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id),
  stage_key text not null,
  outcome text,  -- approve | approve_with_conditions | reject | return
  status text default 'draft',  -- draft | committed
  decided_by uuid references profiles(user_id),
  decided_at timestamptz,
  remarks text,
  created_at timestamptz default now()
);

create table if not exists decision_evidence (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references decisions(id) on delete cascade,
  document_id uuid not null references documents(id),
  doc_version int,
  doc_sha256 text,
  valid_until date,
  linked_at timestamptz not null
);

-- Decision Assurance Reports & Flags (§15.1, §15.2)
create table if not exists assurance_reports (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references decisions(id) on delete cascade,
  kind text not null,  -- pre | post
  generated_at timestamptz not null,
  checks jsonb not null,  -- [{check, result, detail}]
  passed int default 0,
  flagged int default 0
);

create table if not exists assurance_flags (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references assurance_reports(id) on delete cascade,
  decision_id uuid not null references decisions(id) on delete cascade,
  check_type text not null,
  severity severity_t not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  status text default 'open',  -- open | acknowledged | overridden
  responded_by uuid references profiles(user_id),
  responded_at timestamptz,
  reason text
);

-- Maker-Checker Approval Requests (§15.1, §15.2)
create table if not exists approval_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null,  -- rule_change | revert | assurance_override
  entity_type text,
  entity_id uuid,
  payload jsonb,
  requested_by uuid not null references profiles(user_id),
  status text default 'pending',  -- pending | approved | rejected
  approved_by uuid references profiles(user_id),
  decided_at timestamptz,
  reason text,
  created_at timestamptz default now()
);

-- Row Level Security (RLS) extensions for v2 tables
alter table document_access_log enable row level security;
alter table message_templates enable row level security;
alter table communications enable row level security;
alter table evc_availability enable row level security;
alter table mandatory_evidence enable row level security;
alter table decisions enable row level security;
alter table decision_evidence enable row level security;
alter table assurance_reports enable row level security;
alter table assurance_flags enable row level security;
alter table approval_requests enable row level security;

-- Read policies
create policy "Allow read on mandatory_evidence" on mandatory_evidence for select using (true);
create policy "Allow read on message_templates" on message_templates for select using (true);
create policy "Allow read on evc_availability" on evc_availability for select using (true);
create policy "Allow read on approval_requests" on approval_requests for select using (true);
create policy "Allow read on decisions" on decisions for select using (true);
create policy "Allow read on decision_evidence" on decision_evidence for select using (true);
create policy "Allow read on assurance_reports" on assurance_reports for select using (true);
create policy "Allow read on assurance_flags" on assurance_flags for select using (true);
create policy "Allow read on communications" on communications for select using (true);
create policy "Allow read on document_access_log" on document_access_log for select using (true);
