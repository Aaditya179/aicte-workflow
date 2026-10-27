import hashlib
import json
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from typing import Optional, List
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, get_current_user, require_role, require_case_access
from schemas.applications import (
    ApplicationCreate, RoutePreview, ApplicationAdvance, ApplicationReturn,
    ApplicationRevert, ApplicationReassign, ApplicationResponse
)
from services.workflow_engine import engine
from services import audit, approvals, routing

router = APIRouter(prefix="/applications", tags=["Applications"])

_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

OFFICER_ROLES = ["scrutiny_officer", "regional_officer", "evc_member", "sac_shc_member", "bureau_officer"]


def _raise_if_not_found(app: Optional[dict]) -> dict:
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return app


def _scoped_query(actor: AuthenticatedUser):
    q = _supabase.table("applications").select("*")
    if actor.role == "bureau_officer":
        pass  # Read everything
    elif actor.role in ("scrutiny_officer", "regional_officer"):
        if actor.region_id:
            q = q.eq("region_id", actor.region_id)
    elif actor.role == "evc_member":
        if actor.region_id:
            q = q.eq("region_id", actor.region_id)
    elif actor.role == "sac_shc_member":
        q = q.eq("assigned_to", actor.id)  # only the cases assigned to them
    elif actor.role == "institution" and actor.institution_id:
        q = q.eq("institution_id", actor.institution_id)
    else:
        # Unknown roles, or an institution user without an institution, see nothing
        q = q.eq("id", "00000000-0000-0000-0000-000000000000")
    return q


def _get_scoped_app(app_id: str, actor: AuthenticatedUser) -> dict:
    """Fetch one application, as not found when it lies outside the actor's scope."""
    res = _scoped_query(actor).eq("id", app_id).limit(1).execute()
    return _raise_if_not_found(res.data[0] if res.data else None)


# ─── List ────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[ApplicationResponse])
async def list_applications(
    region_id: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    officer_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    actor: AuthenticatedUser = Depends(require_case_access),
):
    q = _scoped_query(actor)

    if region_id:
        q = q.eq("region_id", region_id)
    if stage:
        q = q.eq("current_stage", stage)
    if status_filter:
        q = q.eq("status", status_filter)
    if officer_id:
        q = q.eq("assigned_to", officer_id)
    if search:
        q = q.ilike("application_no", f"%{search}%")

    res = q.order("created_at", desc=True).execute()
    return res.data or []


# ─── Detail ──────────────────────────────────────────────────────────────────

@router.get("/{app_id}", response_model=ApplicationResponse)
async def get_application(
    app_id: str,
    actor: AuthenticatedUser = Depends(require_case_access),
):
    app = _get_scoped_app(app_id, actor)
    tmpl = _supabase.table("workflow_templates").select("definition").eq("id", app["template_id"]).limit(1).execute().data
    stage = ((tmpl[0]["definition"] if tmpl else {}).get("stages") or {}).get(app["current_stage"]) or {}
    form = _supabase.table("documents").select("id, metadata").eq("application_id", app_id) \
        .eq("doc_type", "application_form").order("created_at").limit(1).execute().data
    return {**app, "stage_owner_role": stage.get("owner_role"), "next_stage": stage.get("next"),
            "can_return": bool(stage.get("on_return")),
            "form": {**form[0]["metadata"], "document_id": form[0]["id"]} if form and form[0].get("metadata") else None}


# ─── Submit ──────────────────────────────────────────────────────────────────

def _institution_for(actor: AuthenticatedUser, institution_id: Optional[str]) -> dict:
    institution_id = institution_id or actor.institution_id
    if institution_id != actor.institution_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Institutions can only submit applications for themselves"
        )
    if not institution_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="institution_id is required"
        )
    res = _supabase.table("institutions").select("id, name, aicte_id, region_id").eq("id", institution_id).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Institution not found")
    return res.data[0]


@router.post("/route-preview")
async def preview_route(
    body: RoutePreview,
    actor: AuthenticatedUser = Depends(require_role(["institution"])),
):
    """How an application would be processed, decided by the routing rules, before it is submitted."""
    inst = _institution_for(actor, None)
    try:
        return routing.route(body.application_type, body.details, inst["id"], inst.get("region_id"))
    except routing.RoutingError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@router.post("", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
async def submit_application(
    body: ApplicationCreate,
    actor: AuthenticatedUser = Depends(require_role(["institution"])),
):
    inst = _institution_for(actor, body.institution_id)
    if not body.declaration:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="The declaration must be accepted to submit")
    if not re.fullmatch(r"20\d\d-\d\d", body.academic_year or ""):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Academic year must look like 2027-28")
    try:
        route = routing.route(body.application_type, body.details, inst["id"], inst.get("region_id"))
    except routing.RoutingError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    reason = f"Routed to {route['workflow_name']}: " + " ".join(route["reasons"])
    try:
        app = engine.start(
            institution_id=inst["id"],
            application_type=body.application_type,
            template_code=route["template_code"],
            actor=actor,
            region_id=inst.get("region_id"),
            reason=reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # The submitted form becomes the first document in the case file
    form = {
        "application_type": body.application_type, "academic_year": body.academic_year,
        "details": route["details"], "institution_name": inst["name"], "aicte_id": inst.get("aicte_id"),
        "routing": {k: route[k] for k in ("template_code", "workflow_name", "reasons")},
    }
    _supabase.table("documents").insert({
        "institution_id": inst["id"], "application_id": app["id"], "doc_type": "application_form",
        "title": f"Application form ({app['application_no']})", "uploaded_by": actor.id, "version": 1,
        "sha256": hashlib.sha256(json.dumps(form, sort_keys=True).encode()).hexdigest(), "metadata": form,
    }).execute()
    return app


# ─── Timeline ────────────────────────────────────────────────────────────────

@router.get("/{app_id}/timeline")
async def get_timeline(
    app_id: str,
    actor: AuthenticatedUser = Depends(require_case_access),
):
    _get_scoped_app(app_id, actor)
    history_res = _supabase.table("stage_history").select("*").eq("application_id", app_id).order("entered_at").execute()
    audit_res = _supabase.table("audit_log").select("*").eq("entity_type", "application").eq("entity_id", app_id).order("seq").execute()
    return {
        "stage_history": history_res.data or [],
        "audit_entries": audit_res.data or [],
    }


# ─── Advance ─────────────────────────────────────────────────────────────────

@router.post("/{app_id}/advance", response_model=ApplicationResponse)
async def advance_application(
    app_id: str,
    body: ApplicationAdvance,
    actor: AuthenticatedUser = Depends(require_case_access),
):
    _get_scoped_app(app_id, actor)
    try:
        updated = engine.advance(app_id=app_id, actor=actor, remarks=body.remarks)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    return updated


# ─── Return for deficiency ───────────────────────────────────────────────────

@router.post("/{app_id}/return", response_model=ApplicationResponse)
async def return_application(
    app_id: str,
    body: ApplicationReturn,
    actor: AuthenticatedUser = Depends(require_role(OFFICER_ROLES)),
):
    _get_scoped_app(app_id, actor)
    try:
        updated = engine.return_for_deficiency(app_id=app_id, actor=actor, reason=body.reason)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    return updated


# ─── Revert ──────────────────────────────────────────────────────────────────

@router.post("/{app_id}/revert", response_model=ApplicationResponse)
async def revert_application(
    app_id: str,
    body: ApplicationRevert,
    actor: AuthenticatedUser = Depends(require_role(["regional_officer", "bureau_officer"])),
):
    _get_scoped_app(app_id, actor)
    if approvals.overrides_need_approval():
        if not body.reason or not body.reason.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A reason is required for reverting an application")
        request = approvals.create_request(
            "revert", "application", app_id,
            {"target_stage": body.target_stage, "reason": body.reason}, actor, reason=body.reason,
        )
        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={"message": "Revert sent for approval", "approval_request_id": request["id"]},
        )
    try:
        updated = engine.revert(
            app_id=app_id,
            actor=actor,
            target_stage=body.target_stage,
            reason=body.reason
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    return updated


# ─── Reassign ────────────────────────────────────────────────────────────────

@router.post("/{app_id}/reassign", response_model=ApplicationResponse)
async def reassign_application(
    app_id: str,
    body: ApplicationReassign,
    actor: AuthenticatedUser = Depends(require_role(["regional_officer", "bureau_officer"])),
):
    _get_scoped_app(app_id, actor)
    try:
        updated = engine.reassign(
            app_id=app_id,
            actor=actor,
            new_assignee_id=body.new_assignee_id,
            reason=body.reason
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    return updated
