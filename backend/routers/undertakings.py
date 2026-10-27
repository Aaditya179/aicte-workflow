from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timedelta, timezone
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, require_role, get_current_user, require_case_access
from core import clock
from services import audit as audit_service
from services import notifier

router = APIRouter(prefix="/undertakings", tags=["Undertakings"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


class UndertakingCreate(BaseModel):
    institution_id: str
    application_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    condition_type: Optional[str] = "compliance"
    due_days: int = 30


class UndertakingSubmit(BaseModel):
    title: str = "Compliance Evidence Document"
    storage_path: str = "documents/undertakings/evidence.pdf"
    evidence_document_id: Optional[str] = None


class UndertakingVerify(BaseModel):
    remarks: Optional[str] = "Evidence verified and accepted"


class UndertakingReject(BaseModel):
    remarks: str = Field(..., min_length=1)
    extension_days: int = Field(7, ge=1)


@router.get("")
async def list_undertakings(
    status_filter: Optional[str] = Query(None, alias="status"),
    institution_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    user: AuthenticatedUser = Depends(require_case_access)
):
    """
    List undertakings (Section 6, 7.1).
    Scoped:
    - admin, bureau: all
    - regional: institutions in their region
    - institution: only their own undertakings
    """
    query = _supabase.table("undertakings").select("*, institutions!inner(name, city, aicte_id, region_id), documents(title, storage_path)")

    if status_filter:
        query = query.eq("status", status_filter)

    if user.role == "institution":
        if user.institution_id:
            query = query.eq("institution_id", user.institution_id)
        else:
            return []
    elif institution_id:
        query = query.eq("institution_id", institution_id)

    # Regional staff see their region only; filtered in the query so the limit applies after scoping
    if user.role in ("regional_officer", "scrutiny_officer", "evc_member") and user.region_id:
        query = query.eq("institutions.region_id", user.region_id)

    query = query.order("due_at", desc=False).limit(limit)
    res = query.execute()
    return res.data or []


@router.post("")
async def create_undertaking(
    req: UndertakingCreate,
    user: AuthenticatedUser = Depends(require_role(["regional_officer", "bureau_officer"]))
):
    """Record a compliance undertaking with SLA due date (Section 6)."""
    now = clock.now()
    due_at = now + timedelta(days=req.due_days)

    payload = {
        "institution_id": req.institution_id,
        "application_id": req.application_id,
        "title": req.title,
        "description": req.description,
        "condition_type": req.condition_type,
        "due_at": due_at.isoformat(),
        "status": "pending"
    }

    res = _supabase.table("undertakings").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to create undertaking")
    created = res.data[0]

    # Audit log
    audit_service.record(
        actor=user,
        action="UNDERTAKING_CREATED",
        entity_type="undertaking",
        entity_id=created["id"],
        before=None,
        after=created,
        reason=f"Mandated compliance undertaking due in {req.due_days} days"
    )

    # Notify institution
    inst_profiles = _supabase.table("profiles").select("user_id").eq("institution_id", req.institution_id).execute()
    target_uids = [p["user_id"] for p in (inst_profiles.data or [])]
    if target_uids:
        notifier.notify_users(
            user_ids=target_uids,
            title="New Compliance Undertaking Assigned",
            body=f"Undertaking '{req.title}' due by {clock.display_date(due_at)}. Please upload compliance evidence."
        )

    return created


@router.post("/{undertaking_id}/submit")
async def submit_undertaking_evidence(
    undertaking_id: str,
    req: UndertakingSubmit,
    user: AuthenticatedUser = Depends(require_case_access)
):
    """
    Institution submits evidence document for undertaking (Section 6).
    Sets status to 'submitted'.
    """
    ut_res = _supabase.table("undertakings").select("*, institutions(region_id, name)").eq("id", undertaking_id).limit(1).execute()
    if not ut_res.data:
        raise HTTPException(status_code=404, detail="Undertaking not found")
    ut = ut_res.data[0]

    # Check permission
    if user.role == "institution" and user.institution_id != ut.get("institution_id"):
        raise HTTPException(status_code=403, detail="Cannot submit evidence for other institutions")
    if ut.get("status") not in ("pending", "rejected", "overdue"):
        raise HTTPException(status_code=400, detail=f"Evidence cannot be submitted while the undertaking is '{ut.get('status')}'")

    if req.evidence_document_id:
        # A file already uploaded through /documents/upload
        doc = _supabase.table("documents").select("id, institution_id").eq("id", req.evidence_document_id).limit(1).execute().data
        if not doc or doc[0]["institution_id"] != ut.get("institution_id"):
            raise HTTPException(status_code=400, detail="The evidence document does not belong to this institution")
        doc_id = doc[0]["id"]
        _supabase.table("documents").update({"status": "under_verification"}).eq("id", doc_id).execute()
    else:
        # Register evidence in documents table
        doc_payload = {
            "institution_id": ut.get("institution_id"),
            "application_id": ut.get("application_id"),
            "doc_type": "undertaking_evidence",
            "title": req.title,
            "storage_path": req.storage_path,
            "status": "under_verification",
            "uploaded_by": str(user.id),
        }
        doc_res = _supabase.table("documents").insert(doc_payload).execute()
        doc_id = doc_res.data[0]["id"] if doc_res.data else None

    # Update undertaking status to 'submitted'
    update_payload = {
        "status": "submitted",
        "evidence_document_id": doc_id,
    }
    res = _supabase.table("undertakings").update(update_payload).eq("id", undertaking_id).execute()
    updated = res.data[0] if res.data else None

    # Audit log
    audit_service.record(
        actor=user,
        action="UNDERTAKING_SUBMITTED",
        entity_type="undertaking",
        entity_id=undertaking_id,
        before=ut,
        after=updated,
        reason="Evidence document uploaded by institution"
    )

    # Notify regional officers
    reg_id = ut.get("institutions", {}).get("region_id")
    if reg_id:
        officers = _supabase.table("profiles").select("user_id").eq("region_id", reg_id).eq("role", "regional_officer").execute()
        target_uids = [o["user_id"] for o in (officers.data or [])]
        if target_uids:
            notifier.notify_users(
                user_ids=target_uids,
                title="Undertaking Evidence Submitted",
                body=f"Evidence submitted for '{ut['title']}'. Ready for officer verification."
            )

    return updated


@router.post("/{undertaking_id}/verify")
async def verify_undertaking(
    undertaking_id: str,
    req: UndertakingVerify,
    user: AuthenticatedUser = Depends(require_role(["regional_officer", "bureau_officer"]))
):
    """
    Verify and approve undertaking evidence (Section 6).
    Auto-resolves open alerts for this undertaking!
    """
    ut_res = _supabase.table("undertakings").select("*").eq("id", undertaking_id).limit(1).execute()
    if not ut_res.data:
        raise HTTPException(status_code=404, detail="Undertaking not found")
    ut = ut_res.data[0]
    if ut.get("status") != "submitted":
        raise HTTPException(status_code=400, detail=f"Only submitted evidence can be verified (status is '{ut.get('status')}')")

    now_iso = clock.now().isoformat()
    update_payload = {
        "status": "verified",
        "verified_by": str(user.id),
        "verified_at": now_iso,
        "remarks": req.remarks
    }

    res = _supabase.table("undertakings").update(update_payload).eq("id", undertaking_id).execute()
    updated = res.data[0] if res.data else None

    # Also mark evidence document as verified
    if ut.get("evidence_document_id"):
        _supabase.table("documents").update({
            "status": "verified",
            "verified_by": str(user.id),
            "verified_at": now_iso
        }).eq("id", ut["evidence_document_id"]).execute()

    # Auto-resolve open alerts for this undertaking
    _supabase.table("alerts").update({"status": "resolved", "resolved_at": now_iso}) \
        .eq("entity_type", "undertaking") \
        .eq("entity_id", undertaking_id) \
        .eq("status", "open").execute()

    audit_service.record(
        actor=user,
        action="UNDERTAKING_VERIFIED",
        entity_type="undertaking",
        entity_id=undertaking_id,
        before=ut,
        after=updated,
        reason=req.remarks
    )

    return updated


@router.post("/{undertaking_id}/reject")
async def reject_undertaking(
    undertaking_id: str,
    req: UndertakingReject,
    user: AuthenticatedUser = Depends(require_role(["regional_officer", "bureau_officer"]))
):
    """
    Reject undertaking evidence with remarks and reopen with short deadline (Section 6).
    """
    ut_res = _supabase.table("undertakings").select("*").eq("id", undertaking_id).limit(1).execute()
    if not ut_res.data:
        raise HTTPException(status_code=404, detail="Undertaking not found")
    ut = ut_res.data[0]

    if not req.remarks.strip():
        raise HTTPException(status_code=400, detail="Remarks are required when rejecting evidence")
    if ut.get("status") != "submitted":
        raise HTTPException(status_code=400, detail=f"Only submitted evidence can be rejected (status is '{ut.get('status')}')")

    now = clock.now()
    new_due = now + timedelta(days=req.extension_days)

    update_payload = {
        "status": "rejected",
        "remarks": req.remarks,
        "due_at": new_due.isoformat()
    }

    res = _supabase.table("undertakings").update(update_payload).eq("id", undertaking_id).execute()
    updated = res.data[0] if res.data else None

    # The reopened undertaking runs against the new deadline; alerts for the old one are closed
    _supabase.table("alerts").update({"status": "resolved", "resolved_at": now.isoformat()}) \
        .eq("entity_type", "undertaking") \
        .eq("entity_id", undertaking_id) \
        .in_("status", ["open", "acknowledged"]).execute()

    audit_service.record(
        actor=user,
        action="UNDERTAKING_REJECTED",
        entity_type="undertaking",
        entity_id=undertaking_id,
        before=ut,
        after=updated,
        reason=req.remarks
    )

    # Notify institution
    inst_profiles = _supabase.table("profiles").select("user_id").eq("institution_id", ut.get("institution_id")).execute()
    target_uids = [p["user_id"] for p in (inst_profiles.data or [])]
    if target_uids:
        notifier.notify_users(
            user_ids=target_uids,
            title="Undertaking Evidence Rejected",
            body=f"Evidence for '{ut['title']}' rejected: {req.remarks}. New deadline: {new_due.date()}."
        )

    return updated
