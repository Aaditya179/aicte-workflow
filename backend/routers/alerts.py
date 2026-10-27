from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, get_current_user, require_case_access
from core import clock
from core.ratelimit import rate_limit
from services import audit as audit_service

router = APIRouter(prefix="/alerts", tags=["Alerts"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def _visible_entity_ids(user: AuthenticatedUser) -> Optional[set]:
    """
    Ids of the entities whose alerts the user may see, or None for national roles.
    Institutions see their own items; regional staff see items in their region plus
    anything they were personally notified about (for example a decision they took).
    """
    if user.role == "bureau_officer":
        return None
    ids: set = set()
    if user.role == "institution":
        if not user.institution_id:
            return ids
        inst_filter = ("institution_id", user.institution_id)
    elif user.region_id:
        inst_ids = [i["id"] for i in (_supabase.table("institutions").select("id").eq("region_id", user.region_id).execute().data or [])]
        apps = _supabase.table("applications").select("id").eq("region_id", user.region_id).execute().data or []
        app_ids = [a["id"] for a in apps]
        ids.update(app_ids)
        for i in range(0, len(app_ids), 100):
            evcs = _supabase.table("evc_visits").select("id").in_("application_id", app_ids[i:i + 100]).execute().data or []
            ids.update(e["id"] for e in evcs)
        for table in ("undertakings", "documents"):
            for i in range(0, len(inst_ids), 100):
                rows = _supabase.table(table).select("id").in_("institution_id", inst_ids[i:i + 100]).execute().data or []
                ids.update(r["id"] for r in rows)
        inst_filter = None
    else:
        inst_filter = None

    if inst_filter:
        for table in ("applications", "undertakings", "documents"):
            rows = _supabase.table(table).select("id").eq(*inst_filter).execute().data or []
            ids.update(r["id"] for r in rows)

    notified = _supabase.table("notifications").select("alert_id").eq("user_id", user.id).not_.is_("alert_id", "null").execute().data or []
    ids.update(f"alert:{n['alert_id']}" for n in notified)
    return ids


def _can_see(alert: Dict[str, Any], visible: Optional[set]) -> bool:
    return visible is None or alert["entity_id"] in visible or f"alert:{alert['id']}" in visible


def _mark_read(alert_id: str, user_id: str, now_iso: str) -> None:
    """Opening the alert link counts as reading it on every channel (§15.5)."""
    _supabase.table("notifications").update({"status": "read", "delivery_status": "read", "read_at": now_iso}) \
        .eq("alert_id", alert_id).eq("user_id", user_id).is_("read_at", "null").execute()


class AlertAcknowledgeRequest(BaseModel):
    notes: Optional[str] = None


@router.get("")
async def list_alerts(
    status_filter: Optional[str] = Query(None, alias="status"),
    severity_filter: Optional[str] = Query(None, alias="severity"),
    kind_filter: Optional[str] = Query(None, alias="kind"),
    limit: int = Query(50, ge=1, le=200),
    user: AuthenticatedUser = Depends(require_case_access)
):
    """
    Alert inbox (Section 6, 7.1).
    Scoped by role and region:
    - admin, bureau_officer: all alerts.
    - regional_officer, scrutiny_officer, evc_member: alerts on items in their region.
    - institution: alerts on their own applications, undertakings and documents.
    - everyone: alerts they were notified about.
    """
    query = _supabase.table("alerts").select("*")

    if status_filter:
        query = query.eq("status", status_filter)
    if severity_filter:
        query = query.eq("severity", severity_filter)
    if kind_filter:
        query = query.eq("kind", kind_filter)

    visible = _visible_entity_ids(user)
    if visible is None:
        return query.order("fired_at", desc=True).limit(limit).execute().data or []

    # Scope in Python: the visible id set is too large for a URL filter
    rows = query.order("fired_at", desc=True).limit(1000).execute().data or []
    return [a for a in rows if _can_see(a, visible)][:limit]


@router.get("/counts")
async def get_alert_counts(user: AuthenticatedUser = Depends(require_case_access)):
    """Summary counts for badges."""
    open_alerts = _supabase.table("alerts").select("id, severity, entity_id").eq("status", "open").execute()
    visible = _visible_entity_ids(user)
    items = [a for a in (open_alerts.data or []) if _can_see(a, visible)]
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
    user: AuthenticatedUser = Depends(require_case_access)
):
    """Acknowledge an alert and record in audit chain."""
    alert_res = _supabase.table("alerts").select("*").eq("id", alert_id).limit(1).execute()
    if not alert_res.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert = alert_res.data[0]
    if not _can_see(alert, _visible_entity_ids(user)):
        raise HTTPException(status_code=404, detail="Alert not found")

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


@router.post("/ack-by-token", dependencies=[Depends(rate_limit("20/minute", "ack-token"))])
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
    _mark_read(req.alert_id, req.user_id, now_iso)

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


@router.get("/{alert_id}/deliveries")
async def alert_deliveries(alert_id: str, user: AuthenticatedUser = Depends(require_case_access)):
    """Delivery timeline per recipient and channel (§15.5). Contact details are not included."""
    alert_res = _supabase.table("alerts").select("*").eq("id", alert_id).limit(1).execute()
    if not alert_res.data or not _can_see(alert_res.data[0], _visible_entity_ids(user)):
        raise HTTPException(status_code=404, detail="Alert not found")
    rows = _supabase.table("notifications") \
        .select("id, user_id, channel, status, delivery_status, provider_ref, created_at, sent_at, delivered_at, read_at") \
        .eq("alert_id", alert_id).order("created_at").execute().data or []
    uids = list({r["user_id"] for r in rows})
    names = {p["user_id"]: p for p in (_supabase.table("profiles").select("user_id, full_name, role").in_("user_id", uids).execute().data or [])} if uids else {}
    recipients: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        prof = names.get(r["user_id"], {})
        entry = recipients.setdefault(r["user_id"], {
            "user_id": r["user_id"], "full_name": prof.get("full_name"), "role": prof.get("role"), "channels": [],
        })
        ref = r.get("provider_ref") or ""
        entry["channels"].append({**r, "simulated": ref.startswith("simulated:")})
    return {"alert": alert_res.data[0], "recipients": list(recipients.values())}
