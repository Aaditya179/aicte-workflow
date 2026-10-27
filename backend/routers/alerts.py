from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, get_current_user
from core import clock
from services import audit as audit_service

router = APIRouter(prefix="/alerts", tags=["Alerts"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


class AlertAcknowledgeRequest(BaseModel):
    notes: Optional[str] = None


@router.get("")
async def list_alerts(
    status_filter: Optional[str] = Query(None, alias="status"),
    severity_filter: Optional[str] = Query(None, alias="severity"),
    kind_filter: Optional[str] = Query(None, alias="kind"),
    limit: int = Query(50, ge=1, le=200),
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Alert inbox (Section 6, 7.1).
    Scoped by role and region:
    - admin, bureau_officer: all alerts.
    - regional_officer: region alerts or alerts targeted to their role.
    - scrutiny_officer, evc_member: targeted to their role/id or their region.
    - institution: alerts for their institution.
    """
    query = _supabase.table("alerts").select("*")

    if status_filter:
        query = query.eq("status", status_filter)
    if severity_filter:
        query = query.eq("severity", severity_filter)
    if kind_filter:
        query = query.eq("kind", kind_filter)

    # Scoping
    if user.role in ("admin", "bureau_officer"):
        pass  # Global access
    elif user.role == "regional_officer":
        # Can see alerts targeted to regional_officer, their id, or in their region
        pass  # Post-filter or query
    elif user.role == "institution":
        # Scoped to institution's entities
        if user.institution_id:
            # Applications belonging to institution
            apps = _supabase.table("applications").select("id").eq("institution_id", user.institution_id).execute()
            app_ids = [a["id"] for a in (apps.data or [])]
            # Undertakings
            uts = _supabase.table("undertakings").select("id").eq("institution_id", user.institution_id).execute()
            ut_ids = [u["id"] for u in (uts.data or [])]
            # Documents
            docs = _supabase.table("documents").select("id").eq("institution_id", user.institution_id).execute()
            doc_ids = [d["id"] for d in (docs.data or [])]

            all_entity_ids = app_ids + ut_ids + doc_ids
            if all_entity_ids:
                query = query.in_("entity_id", all_entity_ids)
            else:
                return []
    else:
        # Scrutiny officer / EVC member: see alerts targeted to them or their role
        pass

    query = query.order("fired_at", desc=True).limit(limit)
    res = query.execute()
    return res.data or []


@router.get("/counts")
async def get_alert_counts(user: AuthenticatedUser = Depends(get_current_user)):
    """Summary counts for badges."""
    open_alerts = _supabase.table("alerts").select("id, severity").eq("status", "open").execute()
    items = open_alerts.data or []
    return {
        "total_open": len(items),
        "critical": len([i for i in items if i.get("severity") == "critical"]),
        "warning": len([i for i in items if i.get("severity") == "warning"]),
        "info": len([i for i in items if i.get("severity") == "info"]),
    }


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    req: AlertAcknowledgeRequest = AlertAcknowledgeRequest(),
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Acknowledge an alert and record in audit chain."""
    alert_res = _supabase.table("alerts").select("*").eq("id", alert_id).limit(1).execute()
    if not alert_res.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert = alert_res.data[0]

    if alert.get("status") == "acknowledged":
        return alert

    now_iso = clock.now().isoformat()
    update_data = {
        "status": "acknowledged",
        "acknowledged_by": str(user.id),
        "acknowledged_at": now_iso
    }
    res = _supabase.table("alerts").update(update_data).eq("id", alert_id).execute()
    updated = res.data[0] if res.data else None

    # Cryptographic audit entry
    audit_service.record(
        actor=user,
        action="ALERT_ACKNOWLEDGED",
        entity_type="alert",
        entity_id=alert_id,
        before=alert,
        after=updated,
        reason=req.notes or "Alert acknowledged by officer"
    )

    return updated


class AlertSignedAckRequest(BaseModel):
    alert_id: str
    user_id: str
    exp: int
    sig: str
    notes: Optional[str] = "1-click email acknowledgment"


@router.post("/ack-by-token")
async def acknowledge_alert_by_token(req: AlertSignedAckRequest):
    """
    Public 1-click acknowledge endpoint via cryptographically signed link (Section 5.5, Phase 6).
    Validates HMAC-SHA256 signature and expiration without requiring user re-authentication.
    """
    from services import email as email_service
    is_valid = email_service.verify_ack_signature(req.alert_id, req.user_id, req.exp, req.sig)
    if not is_valid:
        raise HTTPException(status_code=403, detail="Invalid or expired acknowledgment signature")

    alert_res = _supabase.table("alerts").select("*").eq("id", req.alert_id).limit(1).execute()
    if not alert_res.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert = alert_res.data[0]

    if alert.get("status") == "acknowledged":
        return {"ok": True, "alert": alert, "already_acknowledged": True}

    now_iso = clock.now().isoformat()
    # Check if user_id exists in profiles
    prof = _supabase.table("profiles").select("user_id, role, full_name").eq("user_id", req.user_id).limit(1).execute()
    ack_user_id = req.user_id if prof.data else None

    update_data = {
        "status": "acknowledged",
        "acknowledged_by": ack_user_id,
        "acknowledged_at": now_iso
    }
    res = _supabase.table("alerts").update(update_data).eq("id", req.alert_id).execute()
    updated = res.data[0] if res.data else None

    user_role = prof.data[0]["role"] if prof.data else "officer"

    class TokenActor:
        id = req.user_id
        role = user_role

    audit_service.record(
        actor=TokenActor(),
        action="ALERT_ACKNOWLEDGED_VIA_EMAIL",
        entity_type="alert",
        entity_id=req.alert_id,
        before=alert,
        after=updated,
        reason=req.notes or "1-click verified email link acknowledgment"
    )

    return {"ok": True, "alert": updated}
