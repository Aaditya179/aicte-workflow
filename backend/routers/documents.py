from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form
from fastapi.responses import Response
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, date
import logging
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, require_role, require_case_access
from core import clock
from services import audit as audit_service
from services import notifier
from services import storage

router = APIRouter(prefix="/documents", tags=["Documents"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
logger = logging.getLogger("aicte.documents")
OCR_MIN_CONFIDENCE = 0.6
REGION_ROLES = ("regional_officer", "scrutiny_officer", "evc_member")


class DocumentCreate(BaseModel):
    institution_id: Optional[str] = None
    application_id: Optional[str] = None
    doc_type: str = Field(..., pattern="^(lease|undertaking_evidence|application_form|evc_report|other)$")
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
    user: AuthenticatedUser = Depends(require_case_access)
):
    """
    List documents with live validity status (Section 6, 7.1).
    Scoped:
    - admin, bureau: all
    - regional: institutions in their region
    - institution: only their own documents
    """
    query = _supabase.table("documents").select("*, institutions!inner(name, city, aicte_id, region_id)")

    if doc_type:
        query = query.eq("doc_type", doc_type)

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

    query = query.order("created_at", desc=True).limit(limit)
    res = query.execute()
    docs = res.data or []

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
    user: AuthenticatedUser = Depends(require_case_access)
):
    """Register an uploaded document (Section 6)."""
    target_inst_id = req.institution_id or user.institution_id
    if user.role == "institution" and target_inst_id != user.institution_id:
        raise HTTPException(status_code=403, detail="Cannot register documents for other institutions")
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
    user: AuthenticatedUser = Depends(require_case_access)
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
    request: Request,
    req: DocumentVerify = DocumentVerify(),
    user: AuthenticatedUser = Depends(require_role(["regional_officer", "bureau_officer"]))
):
    """
    Officer verifies the renewed document (Section 6).
    1. Sets new document status to 'verified'.
    2. Marks superseded old document as 'renewed'.
    3. Auto-resolves open alerts on the superseded document.
    """
    doc = _get_scoped_doc(doc_id, user)
    doc.pop("institutions", None)
    storage.log_access(doc_id, user.id, "verify", _client_ip(request))

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
            .in_("status", ["open", "acknowledged"]).execute()

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


# -------------------------------------------------------------
# Upload, signed links and the access log (§15.8), OCR suggestion (§15.3)
# -------------------------------------------------------------
def _client_ip(request: Request) -> Optional[str]:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None)


def _get_scoped_doc(doc_id: str, user: AuthenticatedUser) -> Dict[str, Any]:
    """One document, reported as not found when it lies outside the user's scope."""
    res = _supabase.table("documents").select("*, institutions(name, city, region_id)").eq("id", doc_id).limit(1).execute()
    doc = res.data[0] if res.data else None
    if doc:
        region_id = (doc.get("institutions") or {}).get("region_id")
        if user.role == "institution":
            allowed = bool(user.institution_id) and doc["institution_id"] == user.institution_id
        elif user.role in REGION_ROLES:
            allowed = not user.region_id or region_id == user.region_id
        elif user.role == "sac_shc_member":
            allowed = bool(doc.get("application_id")) and bool(
                _supabase.table("applications").select("id").eq("id", doc["application_id"])
                .eq("assigned_to", user.id).limit(1).execute().data)
        else:
            allowed = user.role == "bureau_officer"
        if not allowed:
            doc = None
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


def _run_ocr(doc: Dict[str, Any], content: bytes, media_type: str) -> Dict[str, Any]:
    """Store the model's suggestion; valid_until stays untouched until a person confirms it."""
    from services import llm
    try:
        result = llm.ocr_expiry(content, media_type)
    except Exception as e:
        logger.warning(f"OCR failed for {doc['id']}: {e}")
        result = {"expiry_date": "", "confidence": 0.0, "evidence_text": ""}
    expiry, confidence = (result.get("expiry_date") or "").strip(), float(result.get("confidence") or 0)
    try:
        expiry = date.fromisoformat(expiry[:10]).isoformat() if expiry else ""
    except ValueError:
        expiry = ""
    readable = bool(expiry) and confidence >= OCR_MIN_CONFIDENCE
    metadata = dict(doc.get("metadata") or {})
    metadata["ocr"] = {
        "evidence_text": result.get("evidence_text") or "",
        "mode": result.get("mode"),
        "readable": readable,
        "message": None if readable else "Could not read the date, enter it manually",
    }
    # Extracted fields feed the consistency check in Decision Assurance
    for key in ("institution_name", "land_area", "survey_number", "start_date"):
        if result.get(key):
            metadata[key] = result[key]
    update = {"metadata": metadata, "ocr_status": "suggested" if readable else "none",
              "ocr_suggested_expiry": expiry if readable else None,
              "ocr_confidence": confidence if readable else None}
    return _supabase.table("documents").update(update).eq("id", doc["id"]).execute().data[0]


@router.post("/upload", status_code=201)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    doc_type: str = Form(..., pattern="^(lease|undertaking_evidence|application_form|evc_report|other)$"),
    title: str = Form(..., min_length=1, max_length=200),
    institution_id: Optional[str] = Form(None),
    application_id: Optional[str] = Form(None),
    valid_from: Optional[date] = Form(None),
    supersedes_document_id: Optional[str] = Form(None),
    user: AuthenticatedUser = Depends(require_case_access),
):
    """
    Upload a file: type and size checked by content, SHA-256 recorded, stored in a private bucket,
    and the upload logged. Validity documents get an OCR expiry suggestion. Passing
    supersedes_document_id makes this a renewal of that document.
    """
    content = await file.read(settings.MAX_UPLOAD_BYTES + 1)
    try:
        media_type, ext, sha256 = storage.validate_upload(content)
    except storage.UploadRejected as e:
        status_code = 413 if len(content) > settings.MAX_UPLOAD_BYTES else 415
        raise HTTPException(status_code=status_code, detail=str(e))

    old_doc = _get_scoped_doc(supersedes_document_id, user) if supersedes_document_id else None
    target_inst = (old_doc or {}).get("institution_id") or institution_id or user.institution_id
    if user.role == "institution" and target_inst != user.institution_id:
        raise HTTPException(status_code=403, detail="Cannot upload documents for other institutions")
    if not target_inst:
        raise HTTPException(status_code=400, detail="institution_id is required")
    if application_id:
        app = _supabase.table("applications").select("institution_id").eq("id", application_id).limit(1).execute().data
        if not app or app[0]["institution_id"] != target_inst:
            raise HTTPException(status_code=400, detail="The application does not belong to this institution")

    path = storage.put(target_inst, content, media_type, ext)
    payload = {
        "institution_id": target_inst,
        "application_id": application_id or (old_doc or {}).get("application_id"),
        "doc_type": (old_doc or {}).get("doc_type") or doc_type,
        "title": title,
        "storage_path": path,
        "valid_from": (valid_from or clock.now().date()).isoformat(),
        "valid_until": None,
        "status": "under_verification" if old_doc else "active",
        "uploaded_by": str(user.id),
        "supersedes_document_id": supersedes_document_id,
        "sha256": sha256,
        "version": ((old_doc or {}).get("version") or 1) + 1 if old_doc else 1,
        "metadata": {"original_filename": file.filename, "media_type": media_type, "size_bytes": len(content)},
        "created_at": clock.now().isoformat(),
    }
    created = _supabase.table("documents").insert(payload).execute().data[0]
    storage.log_access(created["id"], user.id, "upload", _client_ip(request))

    if created["doc_type"] in ("lease", "undertaking_evidence", "other"):
        created = _run_ocr(created, content, media_type)

    audit_service.record(
        actor=user, action="DOCUMENT_RENEWAL_SUBMITTED" if old_doc else "DOCUMENT_UPLOADED",
        entity_type="document", entity_id=created["id"], before=old_doc and {"id": old_doc["id"], "status": old_doc["status"]},
        after={"id": created["id"], "sha256": sha256, "storage_path": path, "version": created["version"]},
        reason=f"Uploaded '{title}'" + (f", superseding {supersedes_document_id}" if old_doc else ""),
    )
    if old_doc:
        region_id = (old_doc.get("institutions") or {}).get("region_id")
        if region_id:
            officers = _supabase.table("profiles").select("user_id").eq("region_id", region_id).eq("role", "regional_officer").execute().data or []
            notifier.notify_users([o["user_id"] for o in officers], "Document renewal uploaded",
                                  f"A renewal for '{old_doc['title']}' is ready for verification.")
    return created


@router.get("/{doc_id}")
async def get_document(doc_id: str, request: Request, user: AuthenticatedUser = Depends(require_case_access)):
    """Document detail with a signed link valid for five minutes. Logged as a view."""
    doc = _get_scoped_doc(doc_id, user)
    storage.log_access(doc_id, user.id, "view", _client_ip(request))
    doc["link"] = storage.signed_link(doc_id, user.id) if doc.get("storage_path") and "/" in doc["storage_path"] else None
    return doc


@router.get("/{doc_id}/file")
async def download_document(doc_id: str, uid: str, exp: int, sig: str, request: Request):
    """Serve the file behind a signed link. Unsigned, tampered or expired links are rejected."""
    if not storage.verify_link(doc_id, uid, exp, sig):
        raise HTTPException(status_code=403, detail="Invalid or expired link")
    res = _supabase.table("documents").select("storage_path, title").eq("id", doc_id).limit(1).execute()
    if not res.data or not res.data[0].get("storage_path"):
        raise HTTPException(status_code=404, detail="Document not found")
    path = res.data[0]["storage_path"]
    try:
        content = storage.get(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found in storage")
    storage.log_access(doc_id, uid, "download", _client_ip(request))
    storage.check_download_anomaly(uid)
    ext = path.rsplit(".", 1)[-1]
    return Response(
        content=content, media_type=storage.media_type_for(path),
        headers={"Content-Disposition": f'inline; filename="document-{doc_id[:8]}.{ext}"',
                 "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/{doc_id}/access-log")
async def document_access_log(
    doc_id: str,
    user: AuthenticatedUser = Depends(require_role(["institution", "regional_officer", "bureau_officer", "auditor"])),
):
    """Who uploaded, viewed, downloaded or verified the document. Auditors read every document's log."""
    if user.role != "auditor":
        _get_scoped_doc(doc_id, user)
    rows = _supabase.table("document_access_log").select("*").eq("document_id", doc_id).order("created_at", desc=True).limit(200).execute().data or []
    uids = list({r["user_id"] for r in rows if r.get("user_id")})
    names = {p["user_id"]: p for p in (_supabase.table("profiles").select("user_id, full_name, role").in_("user_id", uids).execute().data or [])} if uids else {}
    for r in rows:
        r["full_name"] = names.get(r.get("user_id"), {}).get("full_name")
        r["role"] = names.get(r.get("user_id"), {}).get("role")
    return rows


class OcrResponse(BaseModel):
    valid_until: Optional[date] = None
    reason: Optional[str] = Field(None, max_length=500)


@router.post("/{doc_id}/ocr/{action}")
async def respond_to_ocr(
    doc_id: str,
    action: str,
    body: OcrResponse = OcrResponse(),
    user: AuthenticatedUser = Depends(require_case_access),
):
    """
    Accept, edit or reject the OCR expiry suggestion (§15.3). Only this step sets valid_until.
    The uploader's institution or an officer in scope may respond; every response is audited.
    """
    if action not in ("accept", "edit", "reject"):
        raise HTTPException(status_code=404, detail="Unknown action")
    doc = _get_scoped_doc(doc_id, user)
    if doc.get("ocr_status") != "suggested" and action != "edit":
        raise HTTPException(status_code=400, detail="There is no pending suggestion for this document")
    update: Dict[str, Any] = {"ocr_status": {"accept": "accepted", "edit": "edited", "reject": "rejected"}[action]}
    if action == "accept":
        update["valid_until"] = doc["ocr_suggested_expiry"]
    elif action == "edit":
        if not body.valid_until:
            raise HTTPException(status_code=422, detail="valid_until is required to edit the date")
        update["valid_until"] = body.valid_until.isoformat()
    updated = _supabase.table("documents").update(update).eq("id", doc_id).execute().data[0]
    audit_service.record(
        actor=user, action=f"OCR_SUGGESTION_{update['ocr_status'].upper()}", entity_type="document", entity_id=doc_id,
        before={"valid_until": doc.get("valid_until"), "ocr_suggested_expiry": doc.get("ocr_suggested_expiry"),
                "ocr_confidence": doc.get("ocr_confidence")},
        after={"valid_until": updated.get("valid_until"), "ocr_status": updated["ocr_status"]},
        reason=body.reason or f"OCR suggestion {update['ocr_status']}",
    )
    return updated
