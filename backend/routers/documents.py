from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, date, timedelta, timezone
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, require_role, get_current_user
from core import clock
from services import audit as audit_service
from services import notifier

router = APIRouter(prefix="/documents", tags=["Documents"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


class DocumentCreate(BaseModel):
    institution_id: Optional[str] = None
    application_id: Optional[str] = None
    doc_type: str = Field(..., description="lease | undertaking_evidence | application_form | evc_report | other")
    title: str
    storage_path: str
    valid_from: Optional[date] = None
    valid_until: Optional[date] = None


class DocumentRenew(BaseModel):
    title: str = "Renewed Document"
    storage_path: str
    valid_until: date


class DocumentVerify(BaseModel):
    remarks: Optional[str] = "Document verified by officer"


@router.get("")
async def list_documents(
    doc_type: Optional[str] = None,
    institution_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    List documents with live validity status (Section 6, 7.1).
    Scoped:
    - admin, bureau: all
    - regional: institutions in their region
    - institution: only their own documents
    """
    query = _supabase.table("documents").select("*, institutions(name, city, aicte_id, region_id)")

    if doc_type:
        query = query.eq("doc_type", doc_type)

    if user.role == "institution":
        if user.institution_id:
            query = query.eq("institution_id", user.institution_id)
        else:
            return []
    elif institution_id:
        query = query.eq("institution_id", institution_id)

    query = query.order("created_at", desc=True).limit(limit)
    res = query.execute()
    docs = res.data or []

    # Regional officer filter
    if user.role == "regional_officer" and user.region_id:
        docs = [d for d in docs if d.get("institutions", {}).get("region_id") == user.region_id]

    # Compute live validity status relative to clock.now()
    sim_now = clock.now().date()
    for d in docs:
        if d.get("valid_until"):
            try:
                vu = datetime.fromisoformat(str(d["valid_until"])).date()
                days_left = (vu - sim_now).days
                if days_left < 0:
                    d["live_status"] = "expired"
                elif days_left <= 30:
                    d["live_status"] = "expiring"
                else:
                    d["live_status"] = "active"
                d["days_remaining"] = days_left
            except Exception:
                d["live_status"] = d.get("status", "active")
        else:
            d["live_status"] = d.get("status", "active")

    return docs


@router.post("")
async def register_document(
    req: DocumentCreate,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Register an uploaded document (Section 6)."""
    target_inst_id = req.institution_id or user.institution_id
    if not target_inst_id:
        raise HTTPException(status_code=400, detail="institution_id is required")

    payload = {
        "institution_id": target_inst_id,
        "application_id": req.application_id,
        "doc_type": req.doc_type,
        "title": req.title,
        "storage_path": req.storage_path,
        "valid_from": req.valid_from.isoformat() if req.valid_from else None,
        "valid_until": req.valid_until.isoformat() if req.valid_until else None,
        "status": "active",
        "uploaded_by": str(user.id),
    }

    res = _supabase.table("documents").insert(payload).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to register document")
    created = res.data[0]

    # Audit log
    audit_service.record(
        actor=user,
        action="DOCUMENT_REGISTERED",
        entity_type="document",
        entity_id=created["id"],
        before=None,
        after=created,
        reason=f"Document '{req.title}' registered"
    )

    return created


@router.post("/{doc_id}/renew")
async def renew_document(
    doc_id: str,
    req: DocumentRenew,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Institution uploads a renewal document that supersedes the old document (Section 6).
    Sets status to 'under_verification'.
    """
    doc_res = _supabase.table("documents").select("*, institutions(region_id, name)").eq("id", doc_id).limit(1).execute()
    if not doc_res.data:
        raise HTTPException(status_code=404, detail="Document not found")
    old_doc = doc_res.data[0]

    if user.role == "institution" and user.institution_id != old_doc.get("institution_id"):
        raise HTTPException(status_code=403, detail="Cannot renew documents for other institutions")

    now_iso = clock.now().isoformat()
    # Create renewal document record
    renewal_payload = {
        "institution_id": old_doc.get("institution_id"),
        "application_id": old_doc.get("application_id"),
        "doc_type": old_doc.get("doc_type"),
        "title": req.title,
        "storage_path": req.storage_path,
        "valid_from": clock.now().date().isoformat(),
        "valid_until": req.valid_until.isoformat(),
        "status": "under_verification",
        "uploaded_by": str(user.id),
        "supersedes_document_id": doc_id,
    }

    res = _supabase.table("documents").insert(renewal_payload).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Failed to upload renewal")
    new_doc = res.data[0]

    # Audit log
    audit_service.record(
        actor=user,
        action="DOCUMENT_RENEWAL_SUBMITTED",
        entity_type="document",
        entity_id=new_doc["id"],
        before=old_doc,
        after=new_doc,
        reason=f"Renewal uploaded superseding document {doc_id}"
    )

    # Notify regional officers
    reg_id = old_doc.get("institutions", {}).get("region_id")
    if reg_id:
        officers = _supabase.table("profiles").select("user_id").eq("region_id", reg_id).eq("role", "regional_officer").execute()
        target_uids = [o["user_id"] for o in (officers.data or [])]
        if target_uids:
            notifier.notify_users(
                user_ids=target_uids,
                title="Document Renewal Uploaded",
                body=f"Renewal for '{old_doc['title']}' uploaded by {old_doc.get('institutions', {}).get('name', 'College')}. Ready for verification."
            )

    return new_doc


@router.post("/{doc_id}/verify")
async def verify_document(
    doc_id: str,
    req: DocumentVerify = DocumentVerify(),
    user: AuthenticatedUser = Depends(require_role(["regional_officer", "bureau_officer", "admin"]))
):
    """
    Officer verifies the renewed document (Section 6).
    1. Sets new document status to 'verified'.
    2. Marks superseded old document as 'renewed'.
    3. Auto-resolves open alerts for this document!
    """
    doc_res = _supabase.table("documents").select("*").eq("id", doc_id).limit(1).execute()
    if not doc_res.data:
        raise HTTPException(status_code=404, detail="Document not found")
    doc = doc_res.data[0]

    now_iso = clock.now().isoformat()
    update_payload = {
        "status": "verified",
        "verified_by": str(user.id),
        "verified_at": now_iso
    }
    res = _supabase.table("documents").update(update_payload).eq("id", doc_id).execute()
    updated = res.data[0] if res.data else None

    # If this document superseded an old document, mark the old one as 'renewed'
    old_doc_id = doc.get("supersedes_document_id")
    if old_doc_id:
        _supabase.table("documents").update({"status": "renewed"}).eq("id", old_doc_id).execute()
        # Auto-resolve alerts on the old document
        _supabase.table("alerts").update({"status": "resolved", "resolved_at": now_iso}) \
            .eq("entity_type", "document") \
            .eq("entity_id", old_doc_id) \
            .eq("status", "open").execute()

    # Auto-resolve alerts on this document
    _supabase.table("alerts").update({"status": "resolved", "resolved_at": now_iso}) \
        .eq("entity_type", "document") \
        .eq("entity_id", doc_id) \
        .eq("status", "open").execute()

    # Audit log
    audit_service.record(
        actor=user,
        action="DOCUMENT_VERIFIED",
        entity_type="document",
        entity_id=doc_id,
        before=doc,
        after=updated,
        reason=req.remarks
    )

    return updated
