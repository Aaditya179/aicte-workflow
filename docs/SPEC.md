# SIH26262 – Build Spec for the Coding Tool

Oct 26, 2026 · @Aaditya

This is the single source of truth for building the SIH26262 prototype: paste one section at a time into your coding tool, tell it to follow the spec exactly, and ask it to check with you before deviating.

## 0. Rules for the coding tool

- All business logic lives in FastAPI. The frontend only displays data and calls the API; Supabase is used directly only for auth, realtime and file storage.
- Every deadline calculation calls `clock.now()`. Nothing else calls `datetime.now()` for business logic.
- Timelines, SLAs, reminder offsets and escalation chains come from database tables, never from constants in code.
- Every mutation writes an audit entry in the same transaction.
- Alerts are idempotent: the unique key on `alerts` must make a scheduler rerun create nothing new.
- AI output is advisory and labelled so in the UI. The system never approves, rejects or verifies on behalf of an officer.
- No real AICTE calls. All external data goes through the adapter in `backend/adapters`.
- TypeScript strict mode in the frontend; Pydantic models for every request and response in the backend.
- Schema changes are SQL migration files in `supabase/migrations`, never ad hoc edits in the dashboard.
- Write tests for the workflow engine, scheduler, escalation and audit chain before moving on to the next module.

## 1. Stack and repo layout

- Frontend: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Recharts, next-intl, react-joyride.
- Backend: FastAPI on Python 3.11, APScheduler, Pydantic v2, supabase-py with the service-role key, ReportLab and openpyxl for reports.
- Platform: Supabase Postgres, Auth, Storage and Realtime.
- Email: Resend. LLM: Anthropic API.

```
sih26262/
  supabase/
    migrations/   0001_schema.sql, 0002_rls.sql, 0003_views.sql
  backend/
    main.py
    core/         config.py, security.py, clock.py, db.py
    routers/      applications, evc, undertakings, documents, alerts,
                  dashboards, reports, admin, audit, ai, demo
    services/     workflow_engine, rule_engine, scheduler, notifier, audit,
                  risk, health_score, llm, reports
    adapters/     base.py, mock.py, live_stub.py
    schemas/
    tests/        test_workflow, test_scheduler, test_escalation, test_audit_chain
    seed/         seed.py, data/
  frontend/
    app/          welcome, (auth)/login, (app)/dashboard, applications, evc,
                  undertakings, documents, alerts, reports, audit, admin
    components/
    lib/          supabase.ts, api.ts, i18n.ts
  docs/SPEC.md
  README.md
```

## 2. Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | frontend | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | frontend | Public key for auth and realtime |
| `NEXT_PUBLIC_API_URL` | frontend | FastAPI base URL |
| `SUPABASE_URL` | backend | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | backend | Service-role key, never sent to the browser |
| `SUPABASE_JWT_SECRET` | backend | Verifies user JWTs |
| `RESEND_API_KEY` | backend | Email sending |
| `LLM_API_KEY` | backend | Summaries, drafts, natural-language query |
| `FRONTEND_ORIGIN` | backend | CORS allow-list |
| `SCHEDULER_ENABLED` | backend | true on exactly one instance |

## 3. Database schema

Save as `supabase/migrations/0001_schema.sql`.

```sql
create extension if not exists pgcrypto;

create type user_role as enum ('institution','scrutiny_officer','regional_officer','evc_member','bureau_officer','admin');
create type app_status as enum ('draft','in_progress','returned','approved','rejected','closed');
create type evc_status as enum ('queued','scheduled','completed','overdue','cancelled');
create type undertaking_status as enum ('pending','submitted','verified','rejected','overdue');
create type doc_status as enum ('active','expiring','expired','renewed','under_verification','verified');
create type alert_kind as enum ('upcoming','overdue','escalation','expiry');
create type alert_status as enum ('open','acknowledged','resolved');
create type severity_t as enum ('info','warning','critical');

create table regions (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  aicte_id text unique not null,
  state text, city text,
  region_id uuid references regions(id),
  kind text check (kind in ('new','existing')) default 'existing',
  contact_email text,
  health_score int default 100,
  health_updated_at timestamptz,
  created_at timestamptz default now()
);

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null,
  region_id uuid references regions(id),
  institution_id uuid references institutions(id),
  phone text,
  locale text default 'en'
);

create table workflow_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  definition jsonb not null,
  version int default 1,
  is_active boolean default true
);

create table applications (
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

create table stage_history (
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

create table documents (
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

create table evc_visits (
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

create table undertakings (
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

create table sla_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null,  -- stage | evc_scheduling | evc_completion | undertaking | document_expiry
  stage_key text,
  template_code text,
  region_id uuid references regions(id),
  duration_days int not null,
  reminder_offsets_days int[] default '{7,3,1}',
  is_active boolean default true
);

create table escalation_chains (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  region_id uuid references regions(id),
  levels jsonb not null,  -- [{level, after_days_overdue, notify_role}]
  ack_timeout_hours int default 48
);

-- For kind upcoming and expiry, level stores the reminder offset in days.
-- For kind overdue, level is 0. For kind escalation, level is the chain level.
create table alerts (
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

create table notifications (
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

create table audit_log (
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

create function audit_block() returns trigger as $$
begin raise exception 'audit_log is append-only'; end;
$$ language plpgsql;

create trigger audit_no_change before update or delete on audit_log
  for each row execute function audit_block();

create table system_settings (key text primary key, value jsonb not null);
insert into system_settings values ('clock_offset_seconds', '0');

create table scheduler_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz,
  finished_at timestamptz,
  clock_now timestamptz,
  alerts_created int default 0,
  escalations_created int default 0,
  errors text
);
```

Save as `0003_views.sql`: create the views `v_pendency_by_stage_region` (counts and average age by stage and region), `v_officer_workload` (open, overdue and average age per officer), `v_overdue_summary` (overdue applications, EVCs, undertakings and documents by region) and `v_institution_compliance` (pending undertakings, expiring documents and health score per institution). Each view must compare against the simulated time, so expose a SQL function `app_now()` that returns `now()` plus the stored clock offset and use it instead of `now()`.

### Row Level Security (`0002_rls.sql`)

- Enable RLS on every table.
- `institution`: can read and write only rows whose `institution_id` equals their profile's `institution_id`.
- `scrutiny_officer`, `regional_officer`, `evc_member`: read rows in their region (EVC members only their assigned visits).
- `bureau_officer` and `admin`: read everything.
- `audit_log`: read-only for bureau officers and admins; no update or delete for anyone.
- `notifications`: a user reads and updates only their own.
- All writes go through FastAPI with the service-role key, which checks roles in code as well.
- Add a JWT hook or login step that copies `role`, `region_id` and `institution_id` into the token claims.

## 4. Workflow templates

Store the definition as JSON in `workflow_templates.definition`. The seed script converts the YAML below. Seed four templates; the SLA days are placeholders that the admin can edit.

```yaml
code: SCRUTINY_EVC
start: scrutiny
stages:
  scrutiny:
    label: Scrutiny
    sla_days: 15
    owner_role: scrutiny_officer
    next: evc_queue
    on_return: institution_response
  institution_response:
    label: Institution Response
    sla_days: 7
    owner_role: institution
    next: re_scrutiny
  re_scrutiny:
    label: Re-scrutiny
    sla_days: 10
    owner_role: scrutiny_officer
    next: evc_queue
    on_return: institution_response
  evc_queue:
    label: EVC Queue
    sla_days: 30
    owner_role: regional_officer
    next: evc_visit
    creates: evc_visit
  evc_visit:
    label: EVC Visit
    sla_days: 15
    owner_role: evc_member
    next: final_decision
  final_decision:
    label: Final Decision
    sla_days: 20
    owner_role: bureau_officer
    next: null
```

| Template code | Stage order |
| --- | --- |
| `ONLY_SCRUTINY` | scrutiny, final\_decision (return loop through institution\_response and re\_scrutiny) |
| `SCRUTINY_EVC` | scrutiny, evc\_queue, evc\_visit, final\_decision (return loop as above) |
| `EVC_SAC_SHC` | evc\_queue, evc\_visit, sac\_shc (bureau officer, 20 days), final\_decision |
| `ONLY_EVC` | evc\_queue, evc\_visit, final\_decision |

## 5. Backend services

### 5.1 Clock (`core/clock.py`)

```python
from datetime import datetime, timedelta, timezone
from core.settings_store import get_setting

def now() -> datetime:
    offset = int(get_setting('clock_offset_seconds', 0))
    return datetime.now(timezone.utc) + timedelta(seconds=offset)
```

`POST /admin/clock/advance` adds days to the offset and runs the scheduler immediately. `POST /admin/clock/reset` sets it to 0.

### 5.2 Audit (`services/audit.py`)

```python
import hashlib, json

def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), default=str)

def record(db, actor, action, entity_type, entity_id, before, after, reason=None):
    db.execute('select pg_advisory_xact_lock(42)')  # serialise chain writes
    prev = db.fetch_val('select hash from audit_log order by seq desc limit 1') or 'GENESIS'
    payload = canonical({
        'actor': str(actor.id), 'role': actor.role, 'action': action,
        'entity': [entity_type, str(entity_id)],
        'before': before, 'after': after, 'reason': reason,
    })
    h = hashlib.sha256((prev + payload).encode()).hexdigest()
    db.execute(
        'insert into audit_log (actor_id, actor_role, action, entity_type, entity_id,'
        ' before, after, reason, prev_hash, hash) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
        (actor.id, actor.role, action, entity_type, entity_id,
         json.dumps(before, default=str), json.dumps(after, default=str), reason, prev, h))
```

`GET /audit/verify` walks the log in order, recomputes every hash, and returns `{ok: true}` or the sequence number of the first broken link.

### 5.3 Workflow engine (`services/workflow_engine.py`)

```python
class WorkflowEngine:
    def start(self, db, institution, app_type, actor) -> Application: ...
    def advance(self, db, app_id, actor, remarks=None) -> Application: ...
    def return_for_deficiency(self, db, app_id, actor, reason) -> Application: ...
    def revert(self, db, app_id, actor, target_stage, reason) -> Application: ...
    def reassign(self, db, app_id, actor, new_assignee, reason) -> Application: ...
    def compute_due(self, db, stage_def, region_id, entered_at) -> datetime: ...
```

Behaviour that must hold:

- `advance` requires the actor's role to match the stage's `owner_role`, or the actor to be an admin.
- On advance: close the open `stage_history` row, open a new one, set `stage_entered_at` from `clock.now()`, compute `due_at`, assign the next owner (same region, fewest open cases), write an audit entry, and create an in-app notification for the new owner.
- If the next stage has `creates: evc_visit`, insert an `evc_visits` row with `scheduling_due_at` from the matching SLA rule.
- `return_for_deficiency` and `revert` reject an empty reason, set status to `returned` where relevant, and always notify the institution.
- `compute_due` uses a matching row in `sla_rules` (region-specific first, then template-wide) and falls back to the template's `sla_days`.
- Final decision stays a manual action by the competent authority; nothing auto-approves.

### 5.4 Scheduler (`services/scheduler.py`)

Run with APScheduler every minute when `SCHEDULER_ENABLED` is true, and on demand after a clock change. Take a Postgres advisory lock so two runs never overlap.

```python
def run_once(db):
    now = clock.now()
    run = start_run(db, now)
    for ent in MONITORED:  # application_stage, evc_scheduling, evc_completion, undertaking, document
        rule_cache = load_rules(db, ent)
        for row in ent.open_rows(db):
            due = ent.due_at(row)
            rule = rule_cache.match(row)
            days_left = (due - now).total_seconds() / 86400
            if days_left > 0:
                reached = [o for o in rule.reminder_offsets_days if days_left <= o]
                if reached:  # fire only the smallest offset reached
                    fire(db, ent, row, kind=ent.upcoming_kind, level=min(reached),
                         severity='info' if min(reached) > 3 else 'warning')
            else:
                days_over = -days_left
                fire(db, ent, row, kind='overdue', level=0, severity='warning')
                for lvl in chain_for(db, ent, row).levels:
                    if days_over >= lvl['after_days_overdue']:
                        fire(db, ent, row, kind='escalation', level=lvl['level'], severity='critical')
    resolve_cleared_alerts(db)        # stage advanced, undertaking verified, renewal verified
    reescalate_unacknowledged(db, now)  # critical alerts not acknowledged within ack_timeout_hours
    finish_run(db, run)

def fire(db, ent, row, kind, level, severity):
    inserted = insert_alert_on_conflict_do_nothing(db, ent, row, kind, level, severity)
    if inserted:
        for user in resolve_targets(db, ent, row, kind, level):
            notifier.send(db, user, inserted)  # in-app first, then email
```

Monitored items and their due fields:

| Entity | Due field | Upcoming kind | Overdue when |
| --- | --- | --- | --- |
| Application stage | `applications.due_at` | upcoming | now is past due and status is in\_progress |
| EVC scheduling | `evc_visits.scheduling_due_at` | upcoming | past due and status is queued |
| EVC completion | `evc_visits.completion_due_at` | upcoming | past due and not completed |
| Undertaking | `undertakings.due_at` | upcoming | past due and status is pending or rejected |
| Document | `documents.valid_until` | expiry (offsets 90, 60, 30, 7) | past expiry and no verified renewal |

Escalation targets: level 1 notifies the assigned officer, level 2 the regional officer of the region, level 3 the bureau officers. Targets come from the matching row in `escalation_chains`.

### 5.5 Notifier (`services/notifier.py`)

- Always insert an in-app notification; Supabase Realtime pushes it to the bell.
- Email through Resend for warning and critical alerts, with a signed one-click acknowledge link.
- Optional WhatsApp or SMS through Twilio for critical alerts only.
- Log every send and retry failures with backoff.

### 5.6 AICTE adapter (`adapters/`)

`base.py` defines `get_institution(aicte_id)`, `list_applications(filters)`, `get_application_documents(app_id)`, `push_status(app_id, status, remarks)` and `authenticate_sso(token)`. `mock.py` reads the seeded tables and is the one wired in. `live_stub.py` raises NotImplementedError and lists the config keys a real connection would need. Also build a CSV and Excel import endpoint for institutions, applications and documents.

## 6. API

All routes live under `/api/v1`, need a valid JWT (except `/demo/accounts`), and are role-checked with a `require_role` dependency.

| Method and path | Roles | Purpose |
| --- | --- | --- |
| `GET /demo/accounts` | public | Demo account cards for the login page |
| `GET /me` | any | Profile and role |
| `POST /applications` | institution | Submit an application and start its workflow |
| `GET /applications` | any, scoped | List with filters (region, stage, status, officer, search) |
| `GET /applications/{id}` | scoped | Detail with stage definition |
| `GET /applications/{id}/timeline` | scoped | Stage history and related audit entries |
| `POST /applications/{id}/advance` | stage owner, admin | Move to the next stage |
| `POST /applications/{id}/return` | officers | Send back for deficiency, reason required |
| `POST /applications/{id}/revert` | regional, bureau | Revert to an earlier stage, reason required |
| `POST /applications/{id}/reassign` | regional, bureau | Change the assigned officer |
| `GET /applications/{id}/summary` | officers | LLM case summary |
| `GET /applications/{id}/risk` | officers | Delay-risk score with reasons |
| `GET /evc` | officers, evc\_member | EVC queue and calendar data |
| `POST /evc/{id}/schedule` | regional | Set date and committee, checks conflicts |
| `POST /evc/{id}/complete` | evc\_member, regional | Mark complete |
| `POST /evc/{id}/report` | evc\_member | Attach the visit report |
| `POST /undertakings` | regional, bureau | Record an undertaking |
| `GET /undertakings` | scoped | List |
| `POST /undertakings/{id}/submit` | institution | Submit evidence |
| `POST /undertakings/{id}/verify` | officers | Verify |
| `POST /undertakings/{id}/reject` | officers | Reject with remarks, reopens with a short deadline |
| `POST /documents` | institution, officers | Register an uploaded document |
| `GET /documents` | scoped | List with validity status |
| `POST /documents/{id}/renew` | institution | Upload a renewal that supersedes the old document |
| `POST /documents/{id}/verify` | officers | Verify the renewal |
| `GET /alerts` | scoped | Alert inbox |
| `POST /alerts/{id}/acknowledge` | target user | Acknowledge |
| `GET /notifications` | self | Notifications |
| `POST /notifications/{id}/read` | self | Mark read |
| `GET /dashboard/{bureau, regional, officer, institution}` | matching role | Dashboard data |
| `GET /reports/{type}` | officers | Report as JSON, or file with `?format=pdf` or `xlsx` |
| `GET and PUT /admin/templates` | admin | Workflow templates |
| `GET and PUT /admin/sla-rules` | admin | SLA rules |
| `GET and PUT /admin/escalation-chains` | admin | Escalation chains |
| `GET /admin/clock`, `POST /admin/clock/advance`, `POST /admin/clock/reset` | admin | Time-travel simulator |
| `POST /admin/seed`, `POST /admin/import` | admin | Reseed or bulk import |
| `GET /audit`, `GET /audit/verify` | bureau, admin | Audit log and integrity check |
| `POST /ai/query` | officers | Natural-language query to a validated filter object |

## 7. Frontend

### 7.1 Pages

| Route | Roles | What it shows |
| --- | --- | --- |
| `/welcome` | public | Start-here page with demo login cards (section 8) |
| `/login` | public | Email and password login, plus the demo cards |
| `/dashboard` | all | Redirects to the role's dashboard |
| `/applications` | all, scoped | Table with filters, search and the natural-language query bar |
| `/applications/[id]` | scoped | Stage tracker, documents, timeline, actions, AI summary, risk badge |
| `/evc` | officers, evc\_member | Queue and calendar, scheduling form, report upload |
| `/undertakings` | scoped | List, evidence upload (institution), verify and reject (officers) |
| `/documents` | scoped | Validity tracker with expiry badges and renewal upload |
| `/alerts` | all | Alert inbox with acknowledge and filters by severity |
| `/reports` | officers | Report picker, filters, PDF and Excel export |
| `/audit` | bureau, admin | Filterable log, before and after diff, Verify Integrity button |
| `/admin/rules` | admin | Editors for templates, SLA rules and escalation chains |
| `/admin/simulator` | admin | Time-travel controls |

### 7.2 Dashboards

- Bureau: KPI cards (open, overdue, EVCs due, expiring documents, compliance rate), region-wise bar chart, stage funnel, top bottlenecks, officer workload table, escalation inbox.
- Regional: the same scoped to the region, plus a case queue sorted by urgency.
- Officer: my cases, due today, due this week, overdue.
- Institution: my applications with stage tracker, upcoming deadlines, undertakings, document validity, health score gauge.
- EVC member: assigned visits, calendar, report submission.
- Filters for region, stage, institution, officer, date range and severity. Dashboards refresh live through Supabase Realtime on `alerts` and `applications`.

### 7.3 Shared components and behaviour

- Components: `StageStepper`, `KpiCard`, `RegionChart`, `AlertBell`, `DataTable`, `DiffViewer`, `HealthScoreGauge`, `RiskBadge`, `SimulatedDateBanner`, `HelpDrawer`.
- Every page has a one-line description under its title and useful empty states, with skeleton loaders while data loads.
- Footer on every page: Advisory only, final decisions rest with the competent authority.
- Responsive layout; wide tables scroll inside their own container.
- Hindi and English through next-intl for navigation, dashboards and alerts.
- Role switcher on the login page for demo accounts.

## 8. In-app guidance for judges

Judges will open the deployed link alone, so the app must explain itself in under a minute.

### 8.1 Welcome page (`/welcome`)

- One line on what the platform does, and a short note that data is dummy and the AICTE integration is mocked through an adapter.
- Four demo login cards (Institution, Regional Officer, Bureau Officer, Admin), each with a one-line promise such as See what a college sees, and a one-click Enter as button. Data comes from `GET /demo/accounts`.
- A Try this in 2 minutes checklist (below) with links to the right screens.

### 8.2 Try this in 2 minutes

1. Enter as Institution and submit a new application.
2. Enter as Regional Officer and advance it; watch the stage tracker move.
3. Enter as Admin, open the simulator and jump the clock 7 days.
4. Open Alerts: see the overdue alert and the escalation to the senior officer.
5. Open Documents: see the lease expiry alert and upload a renewal.
6. Open Audit and press Verify Integrity.

### 8.3 In-app help

- First-visit tour with react-joyride, 4 to 5 steps per role, skippable, with a Replay tour item in the help menu. Store completion per role in localStorage.
- Persistent Help button opening a drawer with a role guide, a glossary (EVC, SAC/SHC, undertaking, SLA, escalation, health score) and a link to the README.
- Tooltips on the non-obvious controls: the simulator, the risk badge, the health score, the acknowledge button.
- Demo mode banner showing the simulated date and a Reset button whenever the clock offset is not zero.

## 9. Seed data

The seed script is idempotent, and every date is computed relative to `clock.now()` at seed time. It creates 7 regions, about 40 institutions, about 120 applications spread across all stages and all four templates, mixed officer workloads, and 6 demo accounts whose password comes from `DEMO_PASSWORD`.

| Account | Role | Region |
| --- | --- | --- |
| `institution@demo.sih` | institution | Western, Demo Institute of Technology |
| `scrutiny@demo.sih` | scrutiny\_officer | Western |
| `regional@demo.sih` | regional\_officer | Western |
| `evc@demo.sih` | evc\_member | Western |
| `bureau@demo.sih` | bureau\_officer | all |
| `admin@demo.sih` | admin | all |

Scripted cases for the demo (all in the Western region):

| Case | Setup | Demo use |
| --- | --- | --- |
| A | Application in scrutiny, entered 3 days ago | Healthy case for the auto-routing step |
| B | Application in scrutiny, entered 13 days ago, due in 2 days | Time-travel: +3 days gives overdue and level 1, +7 gives level 2, +10 gives level 3 |
| C | EVC queued 28 days ago, scheduling due in 2 days | EVC scheduling alert and escalation |
| D | Undertaking for the demo institution, due in 5 days | Upcoming-deadline notification, evidence upload, verification |
| E | Lease expiring in 28 days, plus a second lease expired 10 days ago | Expiry reminder, overdue alert, renewal flow |
| F | Returned application awaiting institution response, due in 4 days | Return and resubmit flow |

Default escalation chain: level 1 at 0 days overdue to the assigned officer, level 2 at 3 days to the regional officer, level 3 at 7 days to the bureau officers.

## 10. AI and scoring features

All AI output is labelled Advisory in the UI and never changes workflow state.

### 10.1 Delay-risk score (`services/risk.py`)

Score from 0 to 100 as the sum of four capped parts, returned with its top three reasons:

- Stage age: 40 times min(1, time in stage divided by the stage SLA).
- Officer load: 20 times min(1, officer's open cases divided by twice the regional average).
- Returns: 20 times min(1, number of returns on this application divided by 3).
- Institution history: 20 times (1 minus health score divided by 100).

Labels: below 35 is Low, 35 to 65 is Medium, above 65 is High. Recompute on every stage change and in the scheduler run.

### 10.2 Compliance health score (`services/health_score.py`)

Start at 100 and subtract: 10 per overdue undertaking, 8 per expired document without a verified renewal, 3 per document expiring within 30 days, 5 per return for deficiency in the last 12 months (capped at 20), and 5 per unacknowledged critical alert. Floor at 0. Tiers: 80 and above is Good, 50 to 79 is Watch, below 50 is At risk. Recompute in the scheduler and store on `institutions.health_score`.

### 10.3 Case summary and drafts (`services/llm.py`)

- Input: stage history, observations, document list, open alerts and undertakings.
- Prompt rules: write a summary of at most 150 words, list open issues and the next required action, never state or imply a decision, and never invent facts not in the input.
- Deficiency letter draft: formal tone, list each deficiency with the reason recorded by the officer, end with the response deadline. The officer edits and sends; the UI shows Draft, review before sending.

### 10.4 Natural-language query

`POST /ai/query` sends the question to the LLM and asks for JSON only, matching an allow-listed filter schema: `entity` (applications, evc, undertakings, documents), `region`, `stage`, `status`, `overdue` (boolean), `days_overdue_gte`, `institution_name`. Validate the JSON against that schema and run it through the normal filtered list endpoints. Never let the model produce SQL.

### 10.5 Workload balancer

For a regional officer, list officers in the region with their open and overdue counts and suggest moving the oldest unstarted cases from the most loaded officer to the least loaded one. It only suggests; the officer confirms through the reassign endpoint.

## 11. Build order and prompts

Commit after every phase. Start each session by pasting the relevant section of this spec.

### Phase 0: Setup

Prompt: Create the repo layout from section 1, a Next.js app and a FastAPI app with a health endpoint, and env files from section 2. Do not add features yet.

Done when both apps run locally and the repo matches the layout.

### Phase 1: Foundation

Prompt: Create the three migration files from section 3, enable RLS, add the JWT claims for role, region and institution, build the login page, and write the seed script for regions, institutions, templates and demo accounts.

Done when each demo account can log in and a database query shows seeded data.

### Phase 2: Workflow engine

Prompt: Implement the workflow engine from 5.3 and the audit service from 5.2, with the application endpoints from section 6 and tests for all four templates, wrong roles, empty reasons and audit entries. Then build the applications list and detail page with the stage tracker.

Done when an application moves through every template in tests and in the UI, and each move creates an audit entry.

### Phase 3: Scheduler, alerts and time travel

Prompt: Implement the clock service, the scheduler and the notifier from 5.1, 5.4 and 5.5, the SLA and escalation seed rows, the alert and notification endpoints, the realtime alert bell, and the admin simulator page.

Done when jumping the clock on case B produces the reminder, overdue and level 1 to 3 alerts exactly once each, and a rerun creates nothing new.

### Phase 4: Monitoring modules

Prompt: Build the EVC, undertakings and documents modules end to end, backend and UI, including upload, verification, renewal and auto-resolve of alerts.

Done when cases C, D and E from section 9 behave as described.

### Phase 5: Dashboards and reports

Prompt: Create the SQL views using `app_now()`, the four dashboards, and PDF and Excel reports.

Done when dashboard numbers change after a time jump and the reports download.

### Phase 6: Email

Prompt: Add Resend email with signed acknowledge links and a daily digest.

Done when an overdue alert sends one email and the link acknowledges the alert.

### Phase 7: Differentiators

Prompt: Add, in this order: health score, case summary and drafts, audit Verify Integrity page, admin rule builder, risk score, acknowledgement-based re-escalation, workload balancer, natural-language query, Hindi toggle.

Done when each feature works on the seeded data and shows its Advisory label where relevant.

### Phase 8: Judge experience and polish

Prompt: Build the welcome page, demo cards, 2-minute checklist, tours, help drawer and simulated date banner from section 8. Tune seed data, loading and empty states, then write the README with architecture diagram, setup steps, demo accounts and screenshots.

Done when a first-time visitor can complete the 2-minute checklist without help.

## 12. Testing checklist

- Workflow: every template start to finish; illegal transitions rejected; wrong role rejected; return and revert require a reason; due date recomputed after return.
- Scheduler: reminder at each offset; only the smallest reached offset fires; overdue and escalation levels fire once; rerun creates no duplicates; clock offset changes results correctly.
- Escalation: level progression, re-escalation after the acknowledgement timeout, auto-resolve when the cause clears.
- Audit: chain verifies; editing a stored row makes verification fail.
- Access: an institution cannot read another institution's rows; an officer cannot read another region; only admins reach `/admin` routes.
- End to end: submit, advance, time-jump, alert, escalate, resolve, verify audit.

## 13. Deployment

- Frontend on Vercel with the three public variables from section 2.
- Backend on Render or Railway, one instance with `SCHEDULER_ENABLED=true`, a `/health` endpoint, and a keep-warm ping before recording.
- Supabase: run the migrations, create private buckets for documents and reports, and enable Realtime on `alerts`, `notifications` and `applications`.
- Run the seed script against the deployed database, then walk through the 2-minute checklist once.

## 14. Definition of done

- Every PS section A to F can be demonstrated end to end on the deployed link.
- Time travel produces reminders, overdue alerts and all three escalation levels without duplicates.
- All four workflow templates pass their tests and the audit chain verifies.
- Role access is verified for every role.
- A first-time visitor can follow the welcome page and complete the 2-minute checklist.
- README, deployed links, demo video and presentation are ready, with the SLA placeholders stated as configurable defaults.
