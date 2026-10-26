# SIH26262 – AICTE Workflow & Monitoring Platform

Automated SLA monitoring, time-travel simulation, cryptographic audit trail, and escalation engine for AICTE approval workflows.

## Architecture

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts.
- **Backend**: FastAPI (Python), APScheduler, Pydantic v2, Supabase-py.
- **Platform**: Supabase PostgreSQL, Auth, Storage, and Realtime.
- **Integrations**: Resend (Email), Anthropic Claude (LLM Advisory).

## Repository Structure

```
├── docs/                 # Project documentation and specifications
│   └── SPEC.md
├── supabase/             # Database migrations & RLS
│   └── migrations/
├── backend/              # FastAPI application
│   ├── core/             # Configuration, security, clock, and database helpers
│   ├── routers/          # API route definitions
│   ├── services/         # Workflow, audit, scheduler, notification engines
│   ├── adapters/         # AICTE external system adapters (mock & live)
│   ├── schemas/          # Pydantic request/response schemas
│   ├── tests/            # Test suite
│   ├── seed/             # Seed scripts and test data
│   └── main.py           # Application entrypoint
├── frontend/             # Next.js frontend application
│   ├── app/              # App router pages and layouts
│   ├── components/       # Reusable UI components
│   └── lib/              # Supabase, API, and i18n utilities
└── README.md
```

## Getting Started

### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
Health check: `http://localhost:8000/health`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Accessible at: `http://localhost:3000`
