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
