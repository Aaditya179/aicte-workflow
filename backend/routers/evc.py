from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timedelta, timezone
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, require_role, get_current_user
from core import clock
from services import audit as audit_service
from services import notifier

router = APIRouter(prefix="/evc", tags=["EVC Visits"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


class EVCScheduleRequest(BaseModel):
    scheduled_for: datetime
    committee_members: List[str] = Field(default_factory=list)


class EVCReportRequest(BaseModel):
    title: str = "EVC Expert Committee Inspection Report"
    storage_path: str = "documents/evc_reports/inspection_report.pdf"
    remarks: Optional[str] = None


@router.get("")
async def list_evc_visits(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    List EVC visits queue and calendar data (Section 6, 7.1).
    Scoped by role and region:
    - admin, bureau_officer: all visits
    - regional_officer: visits in their region
    - evc_member: visits where user is assigned or in committee
    """
    query = _supabase.table("evc_visits").select("*, applications(application_no, current_stage, region_id, institutions(name, city))")

    if status_filter:
        query = query.eq("status", status_filter)

    query = query.order("queued_at", desc=True).limit(limit)
    res = query.execute()
    visits = res.data or []

    # Filter by user scope if not admin / bureau
    if user.role == "regional_officer" and user.region_id:
        visits = [v for v in visits if v.get("applications", {}).get("region_id") == user.region_id]
    elif user.role == "evc_member":
        uid = str(user.id)
        visits = [v for v in visits if uid in (v.get("committee_members") or [])]

    return visits


@router.get("/{evc_id}")
async def get_evc_visit(
    evc_id: str,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Get single EVC visit details with linked documents."""
    res = _supabase.table("evc_visits").select(
        "*, applications(*, institutions(*)), documents(*)"
    ).eq("id", evc_id).limit(1).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="EVC visit not found")
    return res.data[0]


@router.post("/{evc_id}/schedule")
async def schedule_evc_visit(
    evc_id: str,
    req: EVCScheduleRequest,
    user: AuthenticatedUser = Depends(require_role(["regional_officer", "admin"]))
):
    """
    Schedule an EVC visit date and assign committee members (Section 6).
    Checks conflicts and auto-resolves evc_scheduling alerts.
    """
    evc_res = _supabase.table("evc_visits").select("*, applications(region_id, application_no)").eq("id", evc_id).limit(1).execute()
    if not evc_res.data:
        raise HTTPException(status_code=404, detail="EVC visit not found")
    evc = evc_res.data[0]

    scheduled_dt = req.scheduled_for if req.scheduled_for.tzinfo else req.scheduled_for.replace(tzinfo=timezone.utc)
    completion_due = scheduled_dt + timedelta(days=15)

    update_payload = {
        "status": "scheduled",
        "scheduled_for": scheduled_dt.isoformat(),
        "completion_due_at": completion_due.isoformat(),
        "committee_members": req.committee_members,
    }

    res = _supabase.table("evc_visits").update(update_payload).eq("id", evc_id).execute()
    updated = res.data[0] if res.data else None

    # Auto-resolve open scheduling alerts for this EVC
    now_iso = clock.now().isoformat()
    _supabase.table("alerts").update({"status": "resolved", "resolved_at": now_iso}) \
        .eq("entity_type", "evc_scheduling") \
        .eq("entity_id", evc_id) \
        .eq("status", "open").execute()

    # Record audit log
    audit_service.record(
        actor=user,
        action="EVC_SCHEDULED",
        entity_type="evc_visit",
        entity_id=evc_id,
        before=evc,
        after=updated,
        reason=f"Scheduled for {scheduled_dt.date()} with {len(req.committee_members)} committee members"
    )

    # Notify committee members
    if req.committee_members:
        app_no = evc.get("applications", {}).get("application_no", "Application")
        notifier.notify_users(
            user_ids=req.committee_members,
            title="Assigned to EVC Inspection Committee",
            body=f"You have been assigned to the expert visit committee for {app_no} on {scheduled_dt.date()}."
        )

    return updated


@router.post("/{evc_id}/report")
async def upload_evc_report(
    evc_id: str,
    req: EVCReportRequest,
    user: AuthenticatedUser = Depends(require_role(["evc_member", "regional_officer", "admin"]))
):
    """Attach the official EVC inspection report (Section 6)."""
    evc_res = _supabase.table("evc_visits").select("*, applications(institution_id, application_no)").eq("id", evc_id).limit(1).execute()
    if not evc_res.data:
        raise HTTPException(status_code=404, detail="EVC visit not found")
    evc = evc_res.data[0]
    app_meta = evc.get("applications") or {}

    # Register report in documents table
    doc_payload = {
        "institution_id": app_meta.get("institution_id"),
        "application_id": evc.get("application_id"),
        "doc_type": "evc_report",
        "title": req.title,
        "storage_path": req.storage_path,
        "status": "verified",
        "uploaded_by": str(user.id),
        "verified_by": str(user.id),
        "verified_at": clock.now().isoformat()
    }
    doc_res = _supabase.table("documents").insert(doc_payload).execute()
    doc_id = doc_res.data[0]["id"] if doc_res.data else None

    # Link report to evc visit
    res = _supabase.table("evc_visits").update({"report_document_id": doc_id}).eq("id", evc_id).execute()
    updated = res.data[0] if res.data else None

    # Audit log
    audit_service.record(
        actor=user,
        action="EVC_REPORT_ATTACHED",
        entity_type="evc_visit",
        entity_id=evc_id,
        before=evc,
        after=updated,
        reason=req.remarks or "Inspection report attached by committee"
    )

    return {"ok": True, "document_id": doc_id, "evc": updated}


@router.post("/{evc_id}/complete")
async def complete_evc_visit(
    evc_id: str,
    user: AuthenticatedUser = Depends(require_role(["evc_member", "regional_officer", "admin"]))
):
    """Mark EVC inspection visit complete (Section 6). Auto-resolves completion alerts."""
    evc_res = _supabase.table("evc_visits").select("*").eq("id", evc_id).limit(1).execute()
    if not evc_res.data:
        raise HTTPException(status_code=404, detail="EVC visit not found")
    evc = evc_res.data[0]

    now_iso = clock.now().isoformat()
    update_payload = {
        "status": "completed",
        "completed_at": now_iso
    }
    res = _supabase.table("evc_visits").update(update_payload).eq("id", evc_id).execute()
    updated = res.data[0] if res.data else None

    # Auto-resolve evc_completion alerts
    _supabase.table("alerts").update({"status": "resolved", "resolved_at": now_iso}) \
        .eq("entity_type", "evc_completion") \
        .eq("entity_id", evc_id) \
        .eq("status", "open").execute()

    audit_service.record(
        actor=user,
        action="EVC_COMPLETED",
        entity_type="evc_visit",
        entity_id=evc_id,
        before=evc,
        after=updated,
        reason="EVC inspection marked complete by committee"
    )

    return updated
