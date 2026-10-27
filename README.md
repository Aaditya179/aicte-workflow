# Nirikshan (SIH26262)

> **AICTE Workflow Automation, SLA Monitoring & Statutory Governance Platform**
> 
> *Advisory only — final decisions rest with the competent authority. Designed to align with the Digital Personal Data Protection Act, 2023.*

Nirikshan provides end-to-end statutory workflow automation, real-time SLA countdowns, multi-channel escalation before pendency breaches occur, and a tamper-evident cryptographic audit log for all AICTE approval stages.

---

## 1. System Architecture

```mermaid
graph TD
  User([Browser / Mobile Client]) -->|Next.js App Router| Frontend[Frontend: Nirikshan Next.js]
  Frontend -->|REST API / Bearer JWT| FastAPI[Backend: FastAPI Service]
  Frontend -->|Auth / Realtime / Signed Storage| Supabase[(Supabase Platform)]
  
  subgraph Backend Core Services
    FastAPI --> Engine[Workflow Engine]
    FastAPI --> Risk[Delay-Risk Engine 0-100]
    FastAPI --> Health[Compliance Health Score 0-100]
    FastAPI --> Audit[Cryptographic SHA-256 Audit Chain]
    FastAPI --> AI[AI Advisory Assistant: Claude/Anthropic]
    FastAPI --> Rules[Dynamic SLA Rules Engine]
  end

  subgraph Automation & Background
    Sched[APScheduler] -->|Every 5 mins| Watchdog[SLA Breach & Escalation Watchdog]
    Sched -->|Cron| Recompute[Health & Risk Score Recomputation]
    Watchdog -->|Multi-Channel| Notifier[Notifier Service: Email / SMS / In-App]
  end

  subgraph External Integration Layer
    Engine --> Adapter[AICTE System Adapter: Mock / Live Stub]
  end
```

---

## 2. Evaluation Demo Credentials

All evaluation accounts use the standard password: `password123`. Click any persona on the **[Welcome Page](http://localhost:3000/welcome)** to sign in automatically:

| Role | Demo Email | Scope & Purpose |
| :--- | :--- | :--- |
| **Institution** | `institution@demo.sih` | Submit applications, track live health score, resolve deficient undertakings |
| **Scrutiny Officer** | `scrutiny@demo.sih` | Examine submissions, verify documentation, record deficiencies |
| **Regional Officer** | `regional@demo.sih` | Monitor pendency in Western region, rebalance officer workloads, queue EVCs |
| **EVC Member** | `evc@demo.sih` | Review on-site visit schedule, conduct inspection, upload EVC reports |
| **Regional Officer (MFA)** | `mfa.officer@demo.sih` | Same as the regional officer, but signs in with an authenticator app (TOTP) on screen |
| **EVC Members** | `evc2@demo.sih`, `evc3@demo.sih` | Further EVC members based in Pune and Ahmedabad, for suggested visit dates |
| **SAC/SHC Member** | `sacshc@demo.sih` | Sees only the cases assigned to them |
| **Bureau Officer** | `bureau@demo.sih` | National overview, Level-3 escalations, final decisions with Decision Assurance, approves overrides |
| **Administrator** | `admin@demo.sih` | Proposes SLA and rule changes, runs the time simulator, manages users. No access to case data |
| **Second Administrator** | `admin2@demo.sih` | Approves the first administrator's rule changes (maker-checker) |
| **Auditor** | `auditor@demo.sih` | Read-only audit trail, document access logs and reports |

Seeded v2 cases (§15.9): **G** (final decision with four assurance flags), **H** (committed decision whose lease expires in 10 days, so a +15 day jump raises a post-decision flag), **I** (upload `backend/seed/data/sample_lease.png`, also served at `/samples/sample_lease.png`, and accept the suggested expiry date), **J** (the scrutiny officer's next decision raises an anomaly flag).

---

## 3. "Try It in 2 Minutes" Judge Walkthrough

To verify the complete system end-to-end using pre-seeded test cases:

1. **Submit Application as Institution**:
   - Log in as `institution@demo.sih`, open **Applications**, and submit an approval request.
   - Observe the initial statutory stage countdown (SLA timer).
2. **Advance Application as Regional Officer**:
   - Switch to `regional@demo.sih`, open the case, verify and advance past Scrutiny.
   - Watch the interactive stage tracker advance immediately to **EVC Queue**.
3. **Simulate +7 Days Time-Travel**:
   - Switch to `admin@demo.sih`, open **Time Simulator** at `/admin/simulator`, and advance time by **+7 days**.
4. **Inspect Automated Overdue Alerts & Escalations**:
   - Switch back to `regional@demo.sih` and check **Alerts**. Case B turns Critical and displays an automated **Level 2 Escalation** (dispatched to Regional Officer via Email, SMS, and in-app).
5. **Renew Expiring Document**:
   - Switch to `institution@demo.sih`, open **Documents** to review the lease expiring in 28 days, and upload a renewed PDF lease agreement.
6. **Verify Cryptographic Audit Integrity**:
   - Switch to `bureau@demo.sih`, navigate to `/audit`, and click **Verify Integrity**.
   - The engine validates the unbroken SHA-256 hash sequence from the genesis block to the latest mutation.

---

## 4. Multi-Channel Escalation Matrix

When statutory deadlines approach or expire, notifications escalate according to configurable policies:

| Escalation Level | Trigger Window | Recipients | Delivery Channels |
| :--- | :--- | :--- | :--- |
| **Level 1** | 0 days overdue (Day 0) | Assigned officer | In-app, email |
| **Level 2** | 3 days overdue (Day 3) | Regional officer | In-app, email, SMS |
| **Level 3** | 7 days overdue (Day 7) | Bureau officers | In-app, email, SMS, WhatsApp |

Timelines and chains are settings an administrator edits, with a second administrator approving each change. Email, SMS and WhatsApp carry only the reference number, the alert type and a signed link. Every delivery is tracked per recipient and channel (`/alerts/<id>`); a failed delivery on a critical alert falls back to the next channel. Providers that are not configured (Resend, Twilio) are simulated and marked as such.

---

## 5. Security & Privacy Architecture

### What the prototype shows

- **Tamper-evident audit chain**: every state transition, document action and rule change is a SHA-256 linked entry; `/audit` verifies the whole chain.
- **Role separation**: the administrator edits rules and timelines and manages users, but has no route to case data or case actions. The auditor is read-only.
- **MFA and short sessions**: officer routes reject sessions that have not completed TOTP (`DEMO_MFA_BYPASS` lets the other demo officers skip it; it must be off in any real deployment). Login, OTP and AI endpoints are rate limited, and repeated failed logins lock the account.
- **Maker-checker**: rule and timeline changes apply only after a second administrator approves; optionally, case reverts and assurance overrides need a bureau officer's approval.
- **Document protection**: uploads are limited to PDF, PNG and JPG up to 10 MB (checked by content), hashed with SHA-256, kept in a private storage bucket, and served only through links that expire in 5 minutes. Every upload, view, download and verification is logged, and 10 downloads in 5 minutes by one user raises an alert to the bureau.
- **Advisory-only AI**: models summarise, draft, polish wording and suggest expiry dates. A person confirms every date and sends every message; AI never approves, rejects or advances a case.
- **Privacy**: emails and phone numbers are masked in list views and revealed (and audited) on the detail view. Exports are limited to officers and auditors and every export is logged. Designed to align with the Digital Personal Data Protection Act, 2023.

### Production design only (not built)

SSO with AICTE systems, maker-checker on every sensitive action, malware scanning (a marked hook exists in `services/storage.py`), alerts on unusual login locations, backups with tested restore, disaster recovery, centralised logging and monitoring, VAPT, government-approved hosting, and retention rules agreed with AICTE.

---

## 6. Local Setup & Execution

### Prerequisites
- Node.js 20.9+ & npm (required by Next.js 16)
- Python 3.12
- Running Supabase project (or local Supabase CLI)

### Backend Execution
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run database seed (if starting fresh)
python -m seed.seed

# Start FastAPI backend server
uvicorn main:app --reload --port 8000
```
Health endpoint: `http://localhost:8000/health`

### Frontend Execution
```bash
cd frontend
npm install
npm run dev
```
Portal interface: `http://localhost:3000` (Redirects to `/welcome`)

### Running Backend Regression Tests
```bash
cd backend
pytest tests/
```
The tests cover workflow transitions, scheduler alerting and escalation, the audit chain, risk and health scores, Decision Assurance on seeded cases G, H and J, OCR, EVC date suggestions, channel delivery and webhooks, and the security items in §15.11. They run against the Supabase project in `backend/.env` and write test rows to it, so point them at a test project. CI (`.github/workflows/ci.yml`) runs `pip-audit` and `npm audit`.

### Optional delivery providers

Set `RESEND_API_KEY` (and `RESEND_WEBHOOK_SECRET`) for email, and `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` for SMS and WhatsApp. Point the providers' webhooks at `<API_PUBLIC_URL>/api/v1/webhooks/resend` and `/webhooks/twilio`. Without them, deliveries are simulated.

## 7. Deployment (Vercel + Railway)

### Backend on Railway
- Create a service from this repo with **Root Directory** `backend`. `backend/railway.json` sets the start command and the `/health` check; `backend/.python-version` pins Python 3.12.
- Variables: everything in `backend/.env.example`, with these set for the deployment:
  - `FRONTEND_ORIGIN` = the Vercel URL, e.g. `https://nirikshan.vercel.app` (CORS and the links in emails)
  - `API_PUBLIC_URL` = the Railway URL (signed document links, Twilio callbacks)
  - `SUPABASE_JWT_SECRET` = the project's real JWT secret (it also signs alert and document links)
  - `CORS_ORIGIN_REGEX` (optional) to allow Vercel preview deployments
  - `SCHEDULER_ENABLED=true` to raise alerts every minute; run a single instance, since rate limits and the scheduler are per process
- Do not set `PORT`; Railway provides it.

### Frontend on Vercel
- Import the repo with **Root Directory** `frontend` (framework preset Next.js).
- Variables (needed at build time, so redeploy after changing them): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` = `<Railway URL>/api/v1`.
