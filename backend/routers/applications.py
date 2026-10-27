from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from typing import Optional, List
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, get_current_user, require_role, require_case_access
from schemas.applications import (
    ApplicationCreate, ApplicationAdvance, ApplicationReturn,
    ApplicationRevert, ApplicationReassign, ApplicationResponse
)
from services.workflow_engine import engine
from services import audit, approvals

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
    return {**app, "stage_owner_role": stage.get("owner_role"), "next_stage": stage.get("next"),
            "can_return": bool(stage.get("on_return"))}


# ─── Submit ──────────────────────────────────────────────────────────────────

@router.post("", response_model=ApplicationResponse, status_code=status.HTTP_201_CREATED)
async def submit_application(
    body: ApplicationCreate,
    actor: AuthenticatedUser = Depends(require_role(["institution"])),
):
    institution_id = body.institution_id or actor.institution_id
    if actor.role == "institution" and institution_id != actor.institution_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Institutions can only submit applications for themselves"
        )
    if not institution_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="institution_id is required"
        )

    # Get region from institution
    inst_res = _supabase.table("institutions").select("region_id").eq("id", institution_id).limit(1).execute()
    region_id = inst_res.data[0]["region_id"] if inst_res.data else actor.region_id

    try:
        app = engine.start(
            institution_id=institution_id,
            application_type=body.application_type,
            template_code=body.template_code,
            actor=actor,
            region_id=region_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
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
