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
