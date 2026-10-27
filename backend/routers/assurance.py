"""
Decision Assurance Router (§15.2)

Endpoints:
- POST /api/v1/applications/{id}/decisions (Draft decision, snapshot evidence, run checks)
- GET /api/v1/decisions/{id}/assurance (Latest assurance report with flags)
- POST /api/v1/assurance/flags/{id}/acknowledge (Acknowledge a flag)
- POST /api/v1/assurance/flags/{id}/override (Override with mandatory reason)
- POST /api/v1/decisions/{id}/commit (Commits decision; fails if any open flags)
- GET /api/v1/assurance/rechecks (Audit & bureau view of post-decision flags)
- POST /api/v1/assurance/recheck/run (Manual trigger for daily recheck)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from core.security import get_current_user, require_role, AuthenticatedUser, require_case_access
from services.assurance import assurance_service
from core.db import db

router = APIRouter(tags=["assurance"])


class DecisionDraftRequest(BaseModel):
    stage_key: str
    outcome: str = Field(..., description="approve | approve_with_conditions | reject | return")
    remarks: Optional[str] = ""


class OverrideFlagRequest(BaseModel):
    reason: str = Field(..., min_length=5, description="Audited justification reason for overriding the flag")


@router.post("/applications/{id}/decisions")
async def create_or_update_decision_draft(
    id: str,
    body: DecisionDraftRequest,
    current_user: AuthenticatedUser = Depends(require_case_access)
):
    """
    Drafts a decision on an application, snapshots evidence,
    and runs the 8 statutory assurance checks.
    """
    role = current_user.role
    if role not in ["regional_officer", "bureau_officer", "scrutiny_officer", "sac_shc_member"]:
        raise HTTPException(status_code=403, detail="Only authorized officers can formulate decisions")
    app = db.fetch_one("applications", id=id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if role in ("regional_officer", "scrutiny_officer") and app.get("region_id") != current_user.region_id:
        raise HTTPException(status_code=403, detail="Application is outside your region")

    try:
        res = await assurance_service.create_decision_draft(
            application_id=id,
            stage_key=body.stage_key,
            outcome=body.outcome,
            remarks=body.remarks or "",
            user_id=current_user.id,
            actor=current_user
        )
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/decisions/{id}/assurance")
async def get_decision_assurance_report(
    id: str,
    current_user: AuthenticatedUser = Depends(require_case_access)
):
    """
    Fetches the latest assurance report and all associated flags for a decision.
    """
    report = db.table("assurance_reports").select("*") \
        .eq("decision_id", id) \
        .order("generated_at", desc=True) \
        .limit(1).execute().data

    if not report:
        raise HTTPException(status_code=404, detail="No assurance report found for this decision")

    rep = report[0]
    flags = db.table("assurance_flags").select("*") \
        .eq("decision_id", id).execute().data or []

    decision = db.fetch_one("decisions", id=id)

    return {
        "decision": decision,
        "report": rep,
        "flags": flags,
        "open_count": sum(1 for f in flags if f.get("status") == "open")
    }


@router.post("/assurance/flags/{id}/acknowledge")
async def acknowledge_flag(
    id: str,
    current_user: AuthenticatedUser = Depends(require_case_access)
):
    """
    Officer acknowledges an advisory flag.
    """
    try:
        updated = await assurance_service.acknowledge_flag(flag_id=id, user_id=current_user.id, actor=current_user)
        return {"status": "success", "flag": updated}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/assurance/flags/{id}/override")
async def override_flag(
    id: str,
    body: OverrideFlagRequest,
    current_user: AuthenticatedUser = Depends(require_case_access)
):
    """
    Officer overrides a flag with a mandatory documented reason.
    """
    try:
        updated = await assurance_service.override_flag(
            flag_id=id,
            user_id=current_user.id,
            reason=body.reason,
            actor=current_user
        )
        return {"status": "success", "flag": updated}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/decisions/{id}/commit")
async def commit_decision(
    id: str,
    current_user: AuthenticatedUser = Depends(require_case_access)
):
    """
    Commits the decision. Fails if any flag is still 'open'.
    """
    try:
        res = await assurance_service.commit_decision(decision_id=id, user_id=current_user.id, actor=current_user)
        return {"status": "success", "decision": res}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/assurance/rechecks")
async def list_post_decision_rechecks(
    current_user: AuthenticatedUser = Depends(require_role(["bureau_officer", "auditor"]))
):
    """
    Lists post-decision recheck reports and flags for auditors and bureau officers.
    """
    reports = db.table("assurance_reports").select("*, decisions(*, applications(application_no, institutions(name)))") \
        .eq("kind", "post") \
        .order("generated_at", desc=True) \
        .limit(50).execute().data or []
    return {"rechecks": reports}


@router.post("/assurance/recheck/run")
async def trigger_recheck_now(
    current_user: AuthenticatedUser = Depends(require_role(["bureau_officer"]))
):
    """Manually triggers the daily post-decision recheck job."""
    res = await assurance_service.run_daily_post_decision_recheck()
    return {"status": "success", "summary": res}
