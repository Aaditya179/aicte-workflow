# Nirikshan: Project Report

**AICTE approval workflow, SLA monitoring and compliance governance**

Smart India Hackathon · Problem statement **SIH26262**

| | |
| :--- | :--- |
| **Project** | Nirikshan (निरीक्षण, "inspection" or "oversight") |
| **Live application** | https://nirikshan-six.vercel.app |
| **API and interactive docs** | https://nirikshan-api-p3jg.onrender.com/docs |
| **Source** | This repository (`frontend/`, `backend/`, `supabase/`) |

> Advisory only: final decisions rest with the competent authority. Designed to align with the Digital Personal Data Protection Act, 2023.

---

## Abstract

The All India Council for Technical Education (AICTE) approves thousands of technical institutions every year. Each application passes through scrutiny, an expert visit, sometimes an appellate hearing, and a final decision by the bureau, and each stage has its own deadline. After approval, institutions remain under obligations: undertakings to fulfil and statutory documents that expire. Today these deadlines are tracked by hand across offices, so delays are noticed only after they happen, and decisions are hard to defend later.

Nirikshan is a web application that runs every application through a configurable stage workflow and monitors every deadline in it. A rule engine routes each new application to the right workflow from what is applied for and the institution's record. A scheduler checks five kinds of deadline every minute, reminds the people responsible before a deadline, alerts them on it, and escalates through three levels after it, by in-app notification, email, SMS and WhatsApp. Every action is written to a SHA-256 hash-chained audit trail, and a Decision Assurance layer checks the evidence behind each final decision before and after it is committed. Advisory AI helps officers prioritise: a case copilot that explains why a case is delayed, a daily brief, natural-language search, document OCR and drafting aids. A guard discards any AI answer that contains a number the case record does not.

The system is built with Next.js 16, FastAPI and Supabase (PostgreSQL with row-level security), and uses Groq-hosted models for AI. It is deployed on Vercel and Render, and covered by an automated suite of 109 tests.

---

## Contents

1. [Introduction](#1-introduction)
2. [Problem statement](#2-problem-statement)
3. [Objectives](#3-objectives)
4. [Existing system and its gaps](#4-existing-system-and-its-gaps)
5. [Proposed system](#5-proposed-system)
6. [System design](#6-system-design)
7. [Implementation](#7-implementation)
8. [Technology stack](#8-technology-stack)
9. [Testing and results](#9-testing-and-results)
10. [Deployment](#10-deployment)
11. [Limitations and future scope](#11-limitations-and-future-scope)
12. [Conclusion](#12-conclusion)
13. [References](#13-references)

---

## 1. Introduction

### 1.1 Background

AICTE is the statutory body for technical education in India. Institutions apply to it every academic year for an extension of approval, an increase in intake, a new course, a change of name or site, approval of a new institution, restoration of intake, or an appeal against an earlier decision.

An application is handled by several offices in turn:

- a **scrutiny officer** examines the submission and the documents;
- an **expert visit committee (EVC)** inspects the campus when required;
- the **Standing Appellate / Standing Hearing Committee (SAC/SHC)** hears appeals;
- a **bureau officer** takes the final decision.

Each stage has a time limit. Approval also creates obligations: undertakings the institution must fulfil by a date, and documents such as land leases and fire NOCs that must stay valid.

### 1.2 Motivation

When deadlines live in registers, spreadsheets and email, nobody sees the whole pipeline. A case can sit at one desk for weeks before anyone notices. An expired lease can go unnoticed until an inspection. When a decision is questioned later, it is hard to show which documents it relied on and whether they were valid at the time. Nirikshan was built to make every deadline visible to the people responsible for it, to act before a deadline is missed rather than after, and to make every decision traceable.

### 1.3 Scope

The project covers the approval process from submission to final decision, the monitoring of post-approval obligations, dashboards and reports for each role, governance controls, and advisory AI. Integration with live AICTE systems is designed behind an adapter but not connected, and the data used is dummy data.

---

## 2. Problem statement

The problem statement areas below are taken from the build spec (`SIH26262 – Build Spec for the Coding Tool.md`), which was written to cover SIH26262 end to end.

The current process suffers from:

- **No single view of where a case is.** Stages are owned by different offices, and nobody sees the whole pipeline or which stage is holding things up.
- **Deadlines that slip silently.** Stage timelines, EVC scheduling, undertakings and document expiries are tracked by hand, so delays are noticed only after they happen.
- **Escalation that depends on people remembering.** There is no automatic reminder before a deadline, no alert on it, and no step-up to a senior officer after it.
- **Decisions that are hard to defend later.** It is difficult to show which documents a decision relied on, whether they were valid at the time, and who did what and when.
- **Rules fixed in process, not in configuration.** Timelines and escalation paths cannot be changed without changing the system, and changes are not controlled.

What the solution is asked to do:

| Area | Requirement |
| :--- | :--- |
| **A. Workflow** | Run approval applications through configurable stage workflows, with role ownership, return for deficiency, revert and reassignment. |
| **B. Timelines and monitoring** | Track every stage, EVC visit, undertaking and document against a deadline set by configurable rules. |
| **C. Alerts and escalation** | Remind before deadlines, alert on them, and escalate through levels after them, across channels, without duplicates. |
| **D. Dashboards and reports** | Role-specific dashboards, pendency and overdue analysis, and exportable reports. |
| **E. Governance** | A tamper-evident audit trail, controlled rule changes, role separation and privacy safeguards. |
| **F. Intelligence** | Advisory AI and scoring that help officers prioritise, never decide. |

---

## 3. Objectives

1. Route every application to the right workflow by rule, and run it through stages that only the owning role can advance.
2. Compute every deadline from administrator-editable rules, and monitor all of them continuously.
3. Remind before, alert on, and escalate after every deadline, once per recipient and channel, and stop when the cause clears.
4. Give each role a dashboard of what needs its attention, and export standard reports.
5. Make every action traceable in an audit trail that shows any tampering.
6. Check the evidence behind each final decision without taking the decision away from the officer.
7. Use AI only to explain, summarise and draft, never to decide, and never let it state a fact the record does not support.
8. Protect personal and case data through role separation, MFA, masking, short-lived document links and logged access.

---

## 4. Existing system and its gaps

| Aspect | Current practice | Gap | How Nirikshan closes it |
| :--- | :--- | :--- | :--- |
| Choosing the process | Decided per case | Inconsistent; reasons not recorded | Routing rules with the reasons shown to the applicant and recorded |
| Tracking stages | Registers, spreadsheets, email | No shared view; stage age unknown | One case record with stage history and due dates |
| Deadlines | Calculated by hand | Missed or noticed late | Deadlines from SLA rules, checked every minute |
| Escalation | Depends on people remembering | No step-up to seniors | Three escalation levels, on four channels |
| Document validity | Checked at inspection | Expired leases and NOCs go unnoticed | Expiry reminders at 90, 60, 30 and 7 days; OCR of expiry dates |
| Evidence for decisions | Scattered files | Hard to defend later | Decision Assurance with evidence snapshots and a daily recheck |
| Audit | Editable logs | Changes can go unnoticed | Hash-chained audit log with on-screen verification |
| Rule changes | Change in process or code | Uncontrolled | Admin-editable rules with maker-checker approval |

---

## 5. Proposed system

### 5.1 Overview

| Area | What Nirikshan does |
| :--- | :--- |
| **A. Workflow** | A workflow engine runs four stage templates. Each new application is routed to a template by rule, from what is applied for and the institution's record. Each stage is owned by one role and assigned to the least-loaded officer in the region. Returns, reverts and reassignments require a reason. |
| **B. Monitoring** | A scheduler checks five kinds of deadline every minute, or whenever the simulated clock moves. Deadlines come from SLA rules that administrators edit: region-specific first, then template-wide, then the template default. |
| **C. Escalation** | Reminders, overdue alerts and three escalation levels are delivered in-app (live), by email, SMS and WhatsApp. Delivery is tracked per recipient and channel. Alerts are idempotent, resolve themselves when the cause clears, and escalate again if nobody acknowledges them. |
| **D. Dashboards** | There is a dashboard for each role and an AI-written daily brief. Bureau and regional dashboards show charts of late items by region and open cases by stage, officer workload with a rebalancing suggestion, and institution health. Reports export as JSON, PDF or Excel. |
| **E. Governance** | A SHA-256 hash-chained audit log can be verified from the UI. A second administrator approves every rule change. Decision Assurance checks the evidence behind every final decision. Row-level security, MFA, masked contact details and logged document access complete the safeguards. |
| **F. Intelligence** | A case copilot, delay-risk and health scores, case summaries, deficiency letter drafts, natural-language search, OCR of leases and certificates, and a daily brief. All of it is labelled advisory and none of it changes a case. |

### 5.2 Users and roles

| Role | Sees | Does |
| :--- | :--- | :--- |
| **Institution** | Its own applications, documents, undertakings and calendar | Submits applications, responds to deficiencies, uploads documents and renewals, submits undertaking evidence |
| **Scrutiny officer** | Cases in their region | Examines submissions, returns for deficiency, advances cases |
| **Regional officer** | Cases in their region | Schedules EVC visits, reverts and reassigns, receives level 2 escalations, rebalances workload |
| **EVC member** | Visits in their region | Sets availability, records visit reports, completes visits |
| **SAC/SHC member** | Only the cases assigned to them | Reviews appeals and SAC/SHC-stage cases |
| **Bureau officer** | All regions | Takes final decisions with Decision Assurance, receives level 3 escalations, approves overrides when maker-checker is on |
| **Administrator** | Rules, users and settings; **no case data** | Proposes rule changes, manages users, imports data, runs the time simulator |
| **Auditor** | Audit trail, document access logs, reports | Read only |

Role and scope are enforced twice: by row-level security in Postgres and again in every FastAPI route.

---

## 6. System design

### 6.1 Architecture

```mermaid
graph TD
  User([Browser]) -->|HTTPS| FE[Next.js frontend on Vercel]
  FE -->|REST with Supabase JWT| API[FastAPI on Render]
  FE -->|Sign-in, MFA, Realtime| SB[(Supabase)]
  API -->|Service role| SB

  subgraph API services
    API --> Routing[Routing rules]
    API --> Engine[Workflow engine]
    API --> Rules[SLA rules and escalation chains]
    API --> Assurance[Decision Assurance]
    API --> Scores[Risk and health scores]
    API --> Brief[Daily brief and case copilot]
    API --> Audit[Hash-chained audit log]
    API --> LLM[AI service]
    API --> Storage[Document storage and access log]
  end

  subgraph Monitoring
    Sched[Scheduler: every minute or on a clock move] --> Checks[Deadline, escalation, recheck jobs]
    Checks --> Notifier[Notifier]
  end

  Notifier --> SB
  Notifier --> Resend[Resend email]
  Notifier --> Twilio[Twilio SMS and WhatsApp]
  Resend -->|Delivery webhooks| API
  Twilio -->|Delivery webhooks| API
  LLM --> Groq[Groq]
  Engine --> Adapter[AICTE adapter: mock, live stub]
```

### 6.2 Design principles

- **Business logic lives in the API.** The frontend displays data and calls the API. It uses Supabase directly only for sign-in, MFA and realtime notifications.
- **One clock.** Every deadline uses `clock.now()`, which adds the simulator's offset, so time travel affects the whole system consistently.
- **Configuration, not code.** Timelines, reminder offsets and escalation chains live in database tables that administrators edit under maker-checker.
- **Every change is audited.** Each mutation writes a hash-chained audit entry.
- **Idempotent alerts.** A unique key makes repeated scheduler runs safe.
- **AI is advisory.** AI output is labelled advisory, checked against the record, and never changes a case.
- **Integration through an adapter.** No real AICTE calls are made: `adapters/base.py` defines the interface, `mock.py` serves seeded data, and `live_stub.py` lists what a real connection needs.

### 6.3 Request path

1. The browser signs in with Supabase Auth and receives a JWT; officers complete TOTP MFA.
2. The browser calls the API with that token. `core/security.py` validates it with Supabase, retrying transient outages and returning 503 rather than signing the user out. It then loads the profile (role, region, institution) and checks the MFA level for officer routes.
3. The route checks the role and scopes the query by region or institution, and row-level security applies the same rule in the database.
4. Writes go through the services, and each write adds an audit entry.

### 6.4 Life of an application

```mermaid
sequenceDiagram
  participant I as Institution
  participant API as API
  participant R as Routing rules
  participant E as Workflow engine
  participant S as Scheduler
  participant O as Officers
  I->>API: Fill in form (route preview)
  API->>R: Type, details, institution record
  R-->>I: Workflow, reasons, stages and deadlines
  I->>API: Submit with declaration
  API->>E: Start on the routed template
  E->>O: Assign least-loaded officer, notify
  S->>O: Reminder, overdue, escalation L1 to L3
  O->>API: Advance, return, schedule EVC, report
  O->>API: Draft final decision
  API-->>O: Assurance report, flags to answer
  O->>API: Commit decision
  S->>O: Post-decision recheck alerts
```

### 6.5 Data model

The database has 26 tables and 4 views.

| Group | Tables |
| :--- | :--- |
| **Organisation** | `regions`, `institutions`, `profiles` |
| **Workflow** | `workflow_templates`, `applications`, `stage_history`, `decisions`, `approval_requests` |
| **Monitored items** | `evc_visits`, `evc_availability`, `undertakings`, `documents`, `document_access_log`, `mandatory_evidence` |
| **Rules** | `sla_rules`, `escalation_chains`, `system_settings` |
| **Alerts** | `alerts`, `notifications`, `message_templates`, `communications`, `scheduler_runs` |
| **Assurance** | `decision_evidence`, `assurance_reports`, `assurance_flags` |
| **Governance** | `audit_log` |
| **Views** | `v_pendency_by_stage_region`, `v_overdue_summary`, `v_officer_workload`, `v_institution_compliance` |

Migrations in `supabase/migrations`:

| File | Contents |
| :--- | :--- |
| `0001_schema.sql` | Schema |
| `0002_rls.sql` | Row-level security |
| `0003_views.sql` | Reporting views |
| `0004_v2.sql` | Assurance, communications and security |
| `0005_alert_cycle.sql` | The alert key per stage visit |
| `0006_realtime.sql` | Realtime notifications |

### 6.6 Code layout

```
backend/
  core/        config, security (JWT, MFA, roles), clock, db, rate limiting
  routers/     applications, assurance, evc, undertakings, documents, institution,
               alerts, notifications, communications, dashboards, reports, ai,
               audit, admin, auth, demo, webhooks
  services/    routing, workflow_engine, rule_engine, scheduler, notifier, email,
               assurance, doc_fields, risk, health_score, brief, copilot, llm,
               storage, reports, approvals, audit
  adapters/    base, mock, live_stub
  seed/        seed data and scripted demo cases
  tests/       pytest suite
frontend/
  app/         welcome, login, mfa, dashboard, applications, evc, undertakings,
               documents, compliance-calendar, alerts, reports, audit, admin
  components/  Navbar, AlertBell, DailyBrief, AssurancePanel, CaseAssistantPanel,
               CaseCopilot, NaturalLanguageSearch, CommunicationsPanel,
               ApplicationFormCard, DocumentUpload, OcrSuggestion,
               DeliveryTimeline, HelpDrawer, ServerWakeNote, SimulatedDateBanner
  context/     language (English, Hindi)
  lib/         API client, Supabase client, walkthrough steps
```

---

## 7. Implementation

This chapter describes each module as built.

### 7.1 Application submission and automatic routing

The institution fills in a structured application and never picks how it is processed.

**The form** (`/applications/new`)
- **Applicant card:** institution name, AICTE ID, location and regional office, filled in from the institution's record.
- **Academic year:** the next two years, for example 2027-28.
- **Application type:** one of eight: extension of approval, increase in intake, new course, change of name, change of site, new institution, restoration of intake, or appeal against a decision.
- **Details for the chosen type:**
  - level, discipline, course, approved and proposed intake, and NBA accreditation for an intake increase;
  - address, land area, and whether the land is owned or leased for a change of site;
  - the trust or society, address and land area for a new institution;
  - the decision appealed and the grounds for an appeal.
- **Declaration:** has to be accepted before submitting.

**How it will be processed.** A side panel, refreshed as the form changes (`POST /applications/route-preview`), shows:
- the workflow the rules chose;
- the reason for each choice;
- every stage with its owner and its deadline, including any regional SLA rule;
- the expected total time.

**Routing rules** (`services/routing.py`)

| Application | Route |
| :--- | :--- |
| Extension of approval | Scrutiny only, unless the land, buildings or programmes changed, the health score is below 60, or a document on record has expired. Each of these adds an expert visit, with its own reason. |
| Increase in intake | Scrutiny only if the course is NBA accredited and the record is in order; otherwise an expert visit is added. |
| New course | Scrutiny only if the institution already runs the discipline with its labs; otherwise an expert visit is added. |
| Change of name | Scrutiny only |
| Change of site, new institution | Scrutiny, then an expert visit |
| Restoration of intake | Expert visit only (the documents are already on record) |
| Appeal | Expert visit, then the SAC/SHC hearing |

**On submission:**
- the server validates the fields for the type and ignores any workflow named in the request;
- the routing reason is recorded on the first stage and in the audit trail;
- the submitted form is saved as the first document in the case file, with a SHA-256 hash;
- the application page shows an **Application** card with the details and why the case was routed that way.

### 7.2 Workflow engine

`services/workflow_engine.py` runs every application through a template stored as JSON in `workflow_templates`.

| Template | Stages |
| :--- | :--- |
| `ONLY_SCRUTINY` | Scrutiny → Final decision (return loop through Institution response and Re-scrutiny) |
| `SCRUTINY_EVC` | Scrutiny → EVC queue → EVC visit → Final decision (same return loop) |
| `ONLY_EVC` | EVC queue → EVC visit → Final decision |
| `EVC_SAC_SHC` | EVC queue → EVC visit → SAC/SHC → Final decision |

**Rules the engine enforces**
- **Stage ownership:** each stage has an owner role, and only that role can advance it. Everyone else sees who holds the stage.
- **Advancing a stage:**
  - closes the stage history row and opens the next one;
  - sets the entry time from the system clock and computes the new due date;
  - assigns the next owner: the officer in the region with the fewest open cases (the national SAC/SHC committee for SAC/SHC stages);
  - writes an audit entry and notifies the new owner.
- **EVC queue:** entering it creates an EVC visit with its own scheduling deadline.
- **Return for deficiency:** sends the case to the institution, with a reason, and notifies it. The resubmission goes to re-scrutiny.
- **Revert to an earlier stage and reassignment:** for regional and bureau officers, each with a mandatory reason. Reverts can be routed through a bureau officer's approval when maker-checker for overrides is on.
- **Final decision:** always a manual action by the competent authority. Nothing approves automatically.

### 7.3 SLA rules and deadlines

- Every deadline is computed from `clock.now()`, so the time simulator moves all of them together.
- A stage's SLA is looked up in `sla_rules` in this order:
  1. a region-specific rule for the stage;
  2. a template-wide rule;
  3. the template's own `sla_days`.
- EVC scheduling and completion, undertakings and document expiry have their own rules and reminder offsets. For example, documents are reminded 90, 60, 30 and 7 days before expiry.
- Administrators edit SLA rules, escalation chains and templates on `/admin/rules`. A change takes effect only after a second administrator approves it.

### 7.4 Deadline monitoring (scheduler)

`services/scheduler.py` runs every minute when enabled, and immediately after every clock change in the simulator.

| Monitored item | Due field | Overdue when |
| :--- | :--- | :--- |
| Application stage | `applications.due_at` | Past due while in progress |
| EVC scheduling | `evc_visits.scheduling_due_at` | Past due while still queued |
| EVC completion | `evc_visits.completion_due_at` | Past due and not completed |
| Undertaking | `undertakings.due_at` | Past due while pending or rejected |
| Document | `documents.valid_until` | Expired with no verified renewal |

On each run, the scheduler:
- **Before a deadline:** fires a reminder, using only the smallest reminder offset reached.
- **On the deadline:** fires an overdue alert.
- **After the deadline:** fires each escalation level whose day threshold has passed.
- **Without duplicates:** a unique key on alerts per item, kind, level and stage visit means a rerun creates nothing new.
- **Clean-up:** resolves alerts whose cause has cleared, such as a stage that advanced, an undertaking that was verified or a renewal that was verified. It also resolves alerts left from an earlier visit to the same stage.
- **Re-escalation:** escalates critical alerts again if nobody acknowledges them within 48 hours.
- **Scores and rechecks:** recomputes institution health scores on every run, and runs the post-decision recheck once per (simulated) day.
- **Bookkeeping:** records each run in `scheduler_runs`. Runs are serialised by a lock, and items are processed in parallel.

### 7.5 Escalation and multi-channel delivery

| Level | When | Who | Channels |
| :--- | :--- | :--- | :--- |
| **1** | On the due date | Assigned officer | In-app, email |
| **2** | 3 days overdue | Regional officer | In-app, email, SMS |
| **3** | 7 days overdue | Bureau officers | In-app, email, SMS, WhatsApp |

- **Configurable chains:** chains are rows in `escalation_chains`, and a region-specific chain overrides the national default.
- **One notification per recipient per channel**, written from the matching message template in the recipient's language.
- **In-app:** notifications reach the alert bell live through Supabase Realtime.
- **Email and SMS/WhatsApp:** email goes through Resend, SMS and WhatsApp through Twilio. Unconfigured providers are simulated and marked so.
- **Delivery tracking:** status moves queued → sent → delivered → failed, updated by provider webhooks (`/webhooks/resend`, `/webhooks/twilio`). The alert's **Delivery** view shows a timeline per recipient and channel.
- **Fallback:** a failed delivery on a critical alert falls back to the next channel.
- **Safe content:** external messages carry only the reference number, the alert type and a signed link, never case details.
- **Acknowledgement:** the signed link in an email acknowledges the alert without signing in.

### 7.6 EVC (expert visit committee) management

- **Queue and visits:** `/evc` shows the queue and the visits, with their scheduling and completion deadlines.
- **Scheduling assistant:** `/evc/{id}/suggest-dates` suggests the three best dates before the scheduling deadline.
  - It considers weekdays in the next 30 days.
  - It keeps a date only if every proposed member is available and not already booked that day.
  - It scores dates by members based in the institution's city, earlier dates and members' monthly load, and explains each suggestion with a travel note.
- **Availability:** EVC members maintain their availability in an editor on the same page.
- **Scheduling:** the regional officer picks a date and the committee, and conflicts are checked.
- **Completion:** members attach the visit report and complete the visit.

### 7.7 Undertakings

- Officers record undertakings with a due date.
- The institution submits evidence; officers verify it, or reject it with remarks, which reopens it with a new deadline.
- Undertakings are monitored and escalated like any other deadline, and feed the health score.

### 7.8 Documents

**Upload protection**
- Only PDF, PNG or JPG up to 10 MB are accepted, checked by content rather than extension.
- Each file is hashed with SHA-256 and stored in a private Supabase Storage bucket.
- Files are served only through signed links that expire after 5 minutes.

**Access logging**
- Every upload, view, download and verification is written to `document_access_log`.
- Ten or more downloads by one user within 5 minutes alert the bureau.

**Renewals:** a renewal supersedes the old document. Once an officer verifies it, the expiry alerts on the old one resolve.

**OCR of validity documents**
- Uploaded leases and certificates are read by a vision model.
- The model suggests the expiry date, with a confidence score and the line it was read from.
- The uploader or an officer accepts, edits or rejects the suggestion, and the response is audited. The date is never saved without that confirmation.

**Fields read from the document:** the institution name, land area, survey number and start date are shown as printed, under "Read from the document".

### 7.9 Institution compliance calendar

`/compliance-calendar` gives the institution a month view and an agenda of:
- undertaking due dates;
- document expiries;
- pending deficiency responses.

Items are colour-coded by status, and each has a one-click Renew or Submit action. The institution dashboard shows the next three items.

### 7.10 Decision Assurance

Decision Assurance is a rule-based layer that checks the evidence behind a decision before it is committed and again afterwards. It never approves, rejects or blocks the officer's judgement. It only requires that every flag gets a recorded response.

| Check | What it looks for |
| :--- | :--- |
| **Evidence linking** | Snapshots each cited document's version, hash and validity when the decision is drafted |
| **Freshness** | A cited document that expires before the decision date |
| **Completeness** | A mandatory document for the template and stage (`mandatory_evidence`) that is missing or unverified |
| **Consistency** | Documents that disagree with each other or with the institution record (see below) |
| **Source verification** | Data that the AICTE adapter could not confirm |
| **Tamper detection** | A stored file whose hash no longer matches its snapshot |
| **Anomaly** | A decision taken in under 10% of the stage SLA, or an officer with 3 or more overrides in 30 days |
| **Post-decision recheck** | A daily job that re-runs freshness and tamper checks on decisions from the last 12 months, and alerts the officer and the regional office on a new flag |

The consistency check compares:
- **Institution names**, across abbreviations and generic words. For example "Demo Inst. of Tech." matches "Demo Institute of Technology".
- **Land areas** across units (acres, hectares, square metres, square feet, gunthas), within 2%, using the lease as the reference.
- **Survey numbers**, across the ways they are written. For example "S. No. 112-3" matches "Survey No. 112/3".
- **Start dates** that fall after the expiry date.
- **Expiry dates** that were edited away from what the OCR read.

**The flow**
1. The officer drafts a decision.
2. An assurance report lists each check as passed or flagged.
3. The officer acknowledges each flag, or overrides it with a written reason; both are audited. When maker-checker for overrides is on, an override waits for a bureau officer's approval.
4. The decision can be committed only when no flag is open.

### 7.11 Scores

**Delay-risk score (0–100)** for each application, computed when requested. It is the sum of four parts, returned with the top reasons:
- time in stage against the SLA (up to 40);
- the officer's load against the regional average (up to 20);
- the number of returns (up to 20);
- the institution's health (up to 20).

Below 35 is labelled Low, 35 to 65 Medium, and above 65 High.

**Compliance health score (0–100)** for each institution. It starts at 100 and subtracts:
- 10 per overdue undertaking;
- 8 per expired document without a verified renewal;
- 3 per document expiring within 30 days;
- 5 per return in the last 12 months (at most 20);
- 5 per unacknowledged critical alert.

80 and above is Good, 50 to 79 Watch, and below 50 At risk. The score breakdown is shown to the institution, and the score feeds both the risk score and application routing.

### 7.12 Dashboards and the daily brief

- **Bureau:**
  - KPI cards: open cases, overdue cases, EVC visits due, expired documents, on-time clearance rate;
  - a **Late items by region** chart (stacked bars of overdue stages, EVC visits, undertakings and documents);
  - an **Open cases by stage** chart with average age and overdue counts;
  - an officer workload table, and institution health grouped by tier.
- **Regional:** the same, scoped to the region, plus a case queue sorted by urgency. A **workload balancer** suggests moving the oldest unstarted cases from the most loaded officer to the least loaded officer of the same role; the officer confirms the move through reassignment.
- **Officer:** my cases, grouped into overdue, due today, due this week and later.
- **Institution:** applications with their stage tracker, health score with its breakdown, statutory documents, undertakings and the next compliance items.
- **Daily brief** (every role except administrator):
  - The server computes plain-sentence facts for the role's scope: my cases, unacknowledged alerts, overdue and soon-due cases, expired and expiring documents, overdue undertakings, the slowest stage, the EVC queue, and the institution's own position. Each fact links to the relevant screen.
  - An AI model turns the facts into a short summary.
  - The summary is discarded, and the facts are shown instead, if it contains any number the facts do not.
- **Live updates:** dashboards refresh through Supabase Realtime.

### 7.13 AI assistance (advisory only)

| Feature | What it does | Guardrail |
| :--- | :--- | :--- |
| **Case copilot** | A chat on each application. It answers questions such as "why is this case delayed?" from a fact sheet built from the case record: stage history against each time limit, returns, alerts, the EVC visit, documents, open assurance flags and officer load. It says first whether the case is actually late, then names the causes, largest first. On request it drafts an escalation to the next level up (scrutiny or EVC → regional office → bureau), which the officer edits and sends as an in-app message | Any number not in the record replaces the answer with one built from the facts; the facts used are shown under each answer; text in remarks is treated as data; sending is the officer's action and is audited |
| **Case summary** | Summarises the stage history, documents, alerts and undertakings in under 150 words, with open issues and the next action | Never states or implies a decision; no facts outside the input |
| **Deficiency letter draft** | A formal letter listing each deficiency and the response deadline | Shown as a draft; the officer edits and sends |
| **Polish** | Improves the wording of an officer's draft message | Never sends anything |
| **Natural-language search** | Turns a question such as "overdue scrutiny cases in western region" into a filter, shows how it was understood as chips, and lists the matching cases, EVC visits, undertakings or documents | The model returns only JSON against an allow-listed schema, which is validated; it never writes SQL; keyword rules take over when the AI is unavailable; results stay within the user's scope |
| **OCR** | Reads expiry dates and key fields from uploaded documents | A person confirms every date |
| **Daily brief** | Summarises the computed facts | Any number not in the facts discards the summary |

- **Models:** Groq's `openai/gpt-oss-120b` for text and `qwen/qwen3.8-27b` for images.
- **Resilience:** there is a failover key, and a mock mode is used when no key is set.
- **Limits:** AI endpoints are rate limited to 30 requests a minute.

### 7.14 Standardised communications

- Message templates in English and Hindi cover acknowledgement, deficiency letter, deadline reminder, escalation notice, renewal request and undertaking notice.
- Officers pick a template on the application page, see the placeholders filled, edit and send.
- Every send is saved in `communications` and audited.

### 7.15 Reports

- Five reports: **pendency** by stage and region, **overdue summary**, **officer workload**, **institution compliance**, and the **audit** log.
- Each can be viewed as JSON or downloaded as PDF (ReportLab) or Excel (openpyxl).
- Exports are limited to officers and auditors, and every export is logged.

### 7.16 Audit trail

- Every transition, decision, assurance response, document action, rule change, copilot escalation and export appends an entry to `audit_log`.
- Each entry records the actor, role, action, entity, before and after values and reason.
- Each entry's hash is SHA-256 of the previous hash plus the entry, so editing any stored row breaks the chain from that point.
- **Verify integrity** on `/audit` walks the whole chain and reports either success or the first broken link.
- The audit page has filters and a before-and-after view of each entry.

### 7.17 Administration

- **Rules** (`/admin/rules`): workflow templates, SLA rules and escalation chains. Each change becomes an approval request.
- **Approvals** (`/admin/approvals`): a second administrator approves or rejects each change, and nobody can approve their own.
- **Settings:** for example, whether assurance overrides and reverts need a bureau officer's approval.
- **Users** (`/admin/users`): view and edit roles, regions and institutions.
- **Bulk import:** institutions, applications and documents from CSV or Excel. This is the path for bringing in cases whose workflow is already known.
- **Time simulator** (`/admin/simulator`): move the clock forward by days, or reset it. The scheduler runs at once, so reminders, overdue alerts and escalations appear as they would over real time. A banner on every page shows the simulated date.
- **Scheduler runs:** the history of runs, with an option to run one now.
- **No case access:** the administrator has no route to case data or case actions.

### 7.18 Security and privacy

**Identity**
- Institutions can sign in with an email OTP.
- Officer routes require a TOTP-verified (MFA) session. One demo officer goes through MFA on screen; the others use a documented demo bypass that must be off in a real deployment.
- Login is limited to 20 attempts a minute, OTP requests to 5 and OTP checks to 10. Five failed logins lock the account for 15 minutes.

**Access**
- Row-level security in Postgres, and the same role and region scoping in the API.
- The administrator cannot read case data, and the auditor is read-only.

**Documents:** type and size checks, hashing, private storage, short-lived signed links, an access log and bulk-download alerts (see 7.8).

**Privacy**
- Contact details are masked in lists and revealed, with an audit entry, on detail views.
- External notifications carry no case details.
- Exports are restricted and logged.

**Input handling:** Pydantic validation on every request, and parameterised queries only.

**Supply chain:** CI runs `pip-audit`, `npm audit` and a production build.

### 7.19 Ease of use

- **Welcome page** (`/welcome`): explains the product, has one-click entry for each demo role, and a six-step "Try it in 2 minutes" path where each step signs in as the right person.
- **Server wake note:** the welcome and login pages check the API and explain the short wait while the free hosting plan wakes up.
- **Help drawer:** a role guide and a glossary (EVC, SAC/SHC, undertaking, SLA, escalation, health score).
- **Language:** English and Hindi interface.
- **Dates:** shown everywhere as dd/mm/yyyy in Indian Standard Time, in the interface, in messages and in reports.
- **Page states:** every page has a short description, empty states and loading skeletons.
- **Advisory note:** a footer on every page says decisions rest with the competent authority.

---

## 8. Technology stack

| Layer | Technology | Used for |
| :--- | :--- | :--- |
| **Frontend** | Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict) | Pages for every role, with server-prerendered shells |
| | Tailwind CSS 4, lucide-react | Styling and icons |
| | Supabase JS | Sign-in, MFA, and Realtime notifications in the browser |
| **Backend** | Python 3.12, FastAPI, Uvicorn, Pydantic 2 | REST API under `/api/v1`, with validation on every request and response |
| | APScheduler | The monitoring job every minute |
| | supabase-py (service role), httpx | Database and storage access, and outbound HTTP |
| | `limits` | Moving-window rate limiting |
| | ReportLab, openpyxl | PDF and Excel reports |
| | pypdf, Pillow | Preparing uploaded documents for OCR |
| **Data** | Supabase PostgreSQL | 26 tables and 4 views, with row-level security |
| | Supabase Auth | Email and password, email OTP, TOTP MFA |
| | Supabase Storage | Private document bucket, signed links |
| | Supabase Realtime | Live notifications |
| **AI** | Groq (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`) | Copilot, summaries, drafts, search filters, OCR, daily brief |
| **Messaging** | Resend, Twilio | Email; SMS and WhatsApp (simulated when not configured) |
| **Hosting** | Vercel, Render, Supabase | Frontend, API, data |
| **Quality** | pytest, GitHub Actions | Test suite; CI with dependency audits and a production build |

---

## 9. Testing and results

### 9.1 Test approach

The backend has an automated pytest suite of **109 tests** in `backend/tests`. The tests call the real API through FastAPI's test client, sign in as the seeded demo users, and run against a Supabase database, so row-level security, role checks and the scheduler are exercised as they run in production. External email is simulated by running with `RESEND_API_KEY=`, and AI calls are mocked where a test needs a fixed answer.

| Area | What is tested |
| :--- | :--- |
| **Workflow** (`test_workflow.py`) | Every template from start to finish; wrong-role and illegal transitions rejected; reasons required for returns, reverts and reassignment |
| **Routing** (`test_routing.py`) | Every application type reaches its workflow; a workflow named in the request is ignored; incomplete applications and a missing declaration are rejected |
| **Scheduler and escalation** (`test_scheduler.py`, `test_escalation.py`) | Reminders at each offset; overdue alerts and every escalation level firing once; no duplicates on rerun; re-escalation; auto-resolution |
| **Audit** (`test_audit_chain.py`) | The chain verifies, and tampering is detected |
| **Assurance** (`test_assurance.py`) | Each check; the commit block; overrides needing a reason; the post-decision recheck; the anomaly flag |
| **Documents** (`test_doc_fields.py`, `test_v2.py`) | OCR suggestions; field matching across names, units and survey numbers; upload validation; signed links; access logging |
| **EVC, undertakings and renewals** (`test_monitoring.py`, `test_differentiators.py`) | Visit scheduling, reports and completion; undertaking evidence, rejection and verification; renewals superseding old documents; alerts resolving when each is done; date suggestions that skip unavailable members, weekends and double bookings |
| **Channels** (`test_email.py`) | A row per channel; fallback on failure; webhook status updates |
| **Security** (`test_auth.py`, `test_v2.py`) | MFA required on officer routes; no case access for the administrator; region and institution isolation; maker-checker |
| **Dashboards and reports** (`test_dashboards_reports.py`) | Dashboard figures that change after a time jump; reporting views; PDF and Excel exports |
| **Service health** (`test_health.py`) | Health endpoints and the demo accounts |
| **Daily brief** (`test_brief.py`) | Deadline facts; the number guard; endpoint access by role |
| **Case copilot** (`test_copilot.py`) | The late or not-late fact; the number guard; the escalation chain for recipients; the audited send |

The frontend is checked by a strict TypeScript compile and a production build, which CI runs on every push together with `pip-audit` and `npm audit`.

### 9.2 Results

The prototype meets each requirement area of the problem statement:

| Area | Result |
| :--- | :--- |
| **A. Workflow** | Eight application types are routed by rule to four workflows, with the reasons shown before submission and recorded after it. |
| **B. Monitoring** | Five kinds of deadline are checked every minute; with the time simulator, weeks of deadlines can be shown in a few minutes. |
| **C. Escalation** | Reminders, overdue alerts and three escalation levels reach the right people on up to four channels, once each, and resolve themselves when the cause clears. |
| **D. Dashboards** | Each of the eight roles has its own view; five reports export as JSON, PDF and Excel. |
| **E. Governance** | Any edit to a stored audit row is detected on verification; rule changes need a second administrator; final decisions cannot be committed with an open assurance flag. |
| **F. Intelligence** | AI answers that state a number not found in the record are replaced by the computed facts, so the copilot and the daily brief cannot report a wrong delay or count. |

**Size of the build**

| Measure | Value |
| :--- | :--- |
| API endpoints | 97 |
| Frontend pages | 27 |
| Database | 26 tables, 4 views, 6 migrations |
| Backend code (core, routers, services, adapters) | about 9,400 lines of Python |
| Frontend code (app, components, lib, context) | about 10,400 lines of TypeScript |
| Automated tests | 109 |

---

## 10. Deployment

| Part | Where | Notes |
| :--- | :--- | :--- |
| Frontend | Vercel | Built with the public Supabase URL, anon key and API URL |
| API | Render (Singapore, free plan) | `render.yaml` blueprint, `/health` check, auto-deploy on push. The free plan sleeps after 15 idle minutes, and the first request after that takes up to a minute. |
| Data | Supabase | Postgres, Auth, Storage, Realtime |
| Scheduler | In the API process | `SCHEDULER_ENABLED=true` on exactly one instance. On the demo deployment it runs on every simulator move. |

Local setup, environment variables and demo accounts are described in the [README](README.md).

---

## 11. Limitations and future scope

### 11.1 Limitations of the prototype

- **AICTE integration:** mocked behind the adapter; no live AICTE system is called.
- **Routing rules:** live in code (`services/routing.py`), not yet in the admin rules editor.
- **Scheduler:** in-process, so only one API instance can run it.
- **Hosting:** the free API plan sleeps when idle, which delays the first request.
- **Demo data:** dummy data, and demo officers can skip MFA through a documented flag.
- **AI:** depends on an external model provider and is rate limited; when it is unavailable, the system falls back to computed facts and keyword rules.

### 11.2 Future scope

- **Integration:** SSO with AICTE systems and a live adapter in place of the mock.
- **Configurable routing:** move routing rules into the admin rules editor under maker-checker.
- **Forecasting:** project pendency and stage load weeks ahead from current queues and historical stage times.
- **Controls:** maker-checker on every sensitive action, and alerts on unusual login locations.
- **Documents:** malware scanning on upload; the hook is marked in `services/storage.py`.
- **Operations:**
  - a dedicated scheduler worker or queue, so the API can scale out;
  - backups with tested restore, and disaster recovery;
  - central logging and monitoring;
  - vulnerability assessment and penetration testing.
- **Hosting and data:** government-approved hosting, and retention rules agreed with AICTE.
- **Reach:** more Indian languages, and a mobile-friendly view for EVC members on site.

---

## 12. Conclusion

Nirikshan shows that the AICTE approval process can be run from one case record in which every deadline is known, monitored and acted on before it is missed. Routing by rule removes inconsistency at the start of a case. A scheduler with configurable SLA rules and escalation chains replaces reminders that depend on memory. Decision Assurance and a hash-chained audit trail make each decision defensible years later. AI is used where it helps, to explain delays, summarise cases, read documents and draft letters, while every final decision stays with the competent authority, and a guard ensures the AI never states a figure the record does not support. With a live AICTE adapter and production hosting, the same design can serve the full national approval cycle.

---

## 13. References

1. All India Council for Technical Education, *Approval Process Handbook* (current academic year).
2. Smart India Hackathon, problem statement SIH26262, and the project build spec (`SIH26262 – Build Spec for the Coding Tool.md`, `docs/SPEC.md`).
3. Government of India, *Digital Personal Data Protection Act, 2023*.
4. Next.js documentation, https://nextjs.org/docs
5. FastAPI documentation, https://fastapi.tiangolo.com
6. Supabase documentation (Postgres, Auth, Storage, Realtime, row-level security), https://supabase.com/docs
7. Groq API documentation, https://console.groq.com/docs
8. Resend and Twilio API documentation.
