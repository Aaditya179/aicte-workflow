from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, require_role, get_current_user
from core import clock
from services import scheduler
from services import audit as audit_service

router = APIRouter(prefix="/admin", tags=["Admin"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


class ClockAdvanceRequest(BaseModel):
    days: float = Field(..., description="Number of days to advance (can be fractional or negative)")


class SLARuleUpdate(BaseModel):
    scope: str
    stage_key: Optional[str] = None
    template_code: Optional[str] = None
    duration_days: int
    reminder_offsets_days: List[int] = [7, 3, 1]
    is_active: bool = True


class EscalationChainUpdate(BaseModel):
    scope: str
    levels: List[Dict[str, Any]]
    ack_timeout_hours: int = 48


# -------------------------------------------------------------
# Time-Travel Simulator Endpoints (§5.1, §6, §7.1)
# -------------------------------------------------------------
@router.get("/clock")
async def get_clock(user: AuthenticatedUser = Depends(require_role("admin"))):
    """Get current simulated clock status."""
    sim_now = clock.now()
    actual_utc = datetime.now(timezone.utc)
    offset_days = clock.get_offset_days()
    return {
        "clock_now": sim_now.isoformat(),
        "actual_utc": actual_utc.isoformat(),
        "offset_seconds": int(offset_days * 86400),
        "offset_days": round(offset_days, 2),
        "is_simulated": abs(offset_days) > 0.0001
    }


@router.post("/clock/advance")
async def advance_clock(
    req: ClockAdvanceRequest,
    user: AuthenticatedUser = Depends(require_role("admin"))
):
    """
    Advance simulated time by N days and run scheduler immediately (§5.1).
    Produces reminders, overdue alerts, and escalations accordingly.
    """
    before_time = clock.now().isoformat()
    new_time = clock.advance_days(req.days)

    # Run scheduler immediately after clock advance
    run_result = scheduler.run_once()

    # Record audit log
    audit_service.record(
        actor=user,
        action="CLOCK_ADVANCE",
        entity_type="clock",
        entity_id=None,
        before={"simulated_time": before_time},
        after={"simulated_time": new_time.isoformat(), "days_advanced": req.days},
        reason=f"Admin advanced clock by {req.days} days"
    )

    return {
        "ok": True,
        "new_clock_now": new_time.isoformat(),
        "offset_days": round(clock.get_offset_days(), 2),
        "scheduler_run": run_result
    }


@router.post("/clock/reset")
async def reset_clock(user: AuthenticatedUser = Depends(require_role("admin"))):
    """Reset simulated clock back to real-time UTC and trigger scheduler (§5.1)."""
    before_time = clock.now().isoformat()
    clock.reset()
    reset_time = clock.now()

    run_result = scheduler.run_once()

    audit_service.record(
        actor=user,
        action="CLOCK_RESET",
        entity_type="clock",
        entity_id=None,
        before={"simulated_time": before_time},
        after={"simulated_time": reset_time.isoformat(), "offset_days": 0},
        reason="Admin reset clock to real UTC"
    )

    return {
        "ok": True,
        "new_clock_now": reset_time.isoformat(),
        "offset_days": 0,
        "scheduler_run": run_result
    }


# -------------------------------------------------------------
# Scheduler Management Endpoints (§5.4)
# -------------------------------------------------------------
@router.get("/scheduler/runs")
async def list_scheduler_runs(
    limit: int = Query(20, ge=1, le=100),
    user: AuthenticatedUser = Depends(require_role("admin"))
):
    """List execution history of the scheduler runs."""
    res = _supabase.table("scheduler_runs").select("*").order("started_at", desc=True).limit(limit).execute()
    return res.data or []


@router.post("/scheduler/run")
async def trigger_scheduler_run(user: AuthenticatedUser = Depends(require_role("admin"))):
    """Manually trigger a full scheduler pass immediately."""
    result = scheduler.run_once()
    return {
        "ok": True,
        "run": result
    }


# -------------------------------------------------------------
# SLA Rules & Escalation Chains (§6)
# -------------------------------------------------------------
@router.get("/sla-rules")
async def get_sla_rules(user: AuthenticatedUser = Depends(require_role("admin"))):
    """List all configured SLA rules."""
    res = _supabase.table("sla_rules").select("*").order("scope").execute()
    return res.data or []


@router.put("/sla-rules")
async def update_sla_rule(
    rule: SLARuleUpdate,
    user: AuthenticatedUser = Depends(require_role("admin"))
):
    """Create or update an SLA rule."""
    payload = rule.model_dump()
    res = _supabase.table("sla_rules").upsert(payload).execute()
    return res.data[0] if res.data else {"ok": True}


@router.get("/escalation-chains")
async def get_escalation_chains(user: AuthenticatedUser = Depends(require_role("admin"))):
    """List all escalation chains."""
    res = _supabase.table("escalation_chains").select("*").execute()
    return res.data or []


@router.put("/escalation-chains")
async def update_escalation_chain(
    chain: EscalationChainUpdate,
    user: AuthenticatedUser = Depends(require_role("admin"))
):
    """Update an escalation chain configuration."""
    res = _supabase.table("escalation_chains").upsert(chain.model_dump()).execute()
    return res.data[0] if res.data else {"ok": True}


# -------------------------------------------------------------
# Admin Seed Endpoint (§6, §9)
# -------------------------------------------------------------
@router.post("/seed")
async def run_seed_cases(user: AuthenticatedUser = Depends(require_role("admin"))):
    """Seed or reseed demo cases (Section 9)."""
    from seed.demo_cases import seed_scripted_cases
    cases = seed_scripted_cases()
    return {
        "ok": True,
        "message": "Scripted demo cases seeded successfully",
        "cases": cases
    }
