"""
Institution compliance calendar (§15.6).

Merges the institution's undertaking due dates, document expiries and returned applications
awaiting a response into one dated list. Each item names the action the institution can take.
"""
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import create_client

from core import clock
from core.config import settings
from core.security import AuthenticatedUser, require_role

router = APIRouter(prefix="/institution", tags=["Institution"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

EXPIRING_WITHIN_DAYS = 30
DUE_SOON_DAYS = 7


def _as_date(value: Any) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _urgency(due: date, today: date, soon_days: int) -> str:
    days = (due - today).days
    if days < 0:
        return "overdue"
    if days <= soon_days:
        return "due_soon"
    return "upcoming"


@router.get("/calendar")
async def compliance_calendar(
    limit: int = Query(200, ge=1, le=500),
    user: AuthenticatedUser = Depends(require_role(["institution"])),
):
    if not user.institution_id:
        raise HTTPException(status_code=403, detail="Account is not linked to an institution")
    inst_id = user.institution_id
    today = clock.now().date()
    items: List[Dict[str, Any]] = []

    undertakings = _supabase.table("undertakings").select("id, application_id, title, due_at, status") \
        .eq("institution_id", inst_id).in_("status", ["pending", "overdue", "rejected", "submitted"]).execute().data or []
    for u in undertakings:
        due = _as_date(u["due_at"])
        if not due:
            continue
        waiting = u["status"] == "submitted"
        items.append({
            "id": f"undertaking:{u['id']}",
            "type": "undertaking",
            "entity_id": u["id"],
            "application_id": u.get("application_id"),
            "title": u["title"],
            "date": due.isoformat(),
            "days_left": (due - today).days,
            "status": "waiting" if waiting else _urgency(due, today, DUE_SOON_DAYS),
            "detail": "Submitted, waiting for verification" if waiting else
                      ("Resubmit evidence" if u["status"] == "rejected" else "Evidence due"),
            "action": None if waiting else "submit",
        })

    docs = _supabase.table("documents").select("id, application_id, doc_type, title, valid_until, status, supersedes_document_id") \
        .eq("institution_id", inst_id).execute().data or []
    # A document with a renewal already uploaded needs no further action from the institution
    pending_renewals = {d["supersedes_document_id"] for d in docs
                        if d.get("supersedes_document_id") and d["status"] in ("under_verification", "verified", "active")}
    for d in docs:
        due = _as_date(d.get("valid_until"))
        if not due or d["status"] in ("renewed", "under_verification"):
            continue
        days_left = (due - today).days
        if days_left > 90:
            continue
        renewing = d["id"] in pending_renewals
        items.append({
            "id": f"document:{d['id']}",
            "type": "document",
            "entity_id": d["id"],
            "application_id": d.get("application_id"),
            "doc_type": d["doc_type"],
            "title": d["title"],
            "date": due.isoformat(),
            "days_left": days_left,
            "status": "waiting" if renewing else _urgency(due, today, EXPIRING_WITHIN_DAYS),
            "detail": "Renewal uploaded, waiting for verification" if renewing else
                      ("Expired" if days_left < 0 else f"Expires in {days_left} day(s)"),
            "action": None if renewing else "renew",
        })

    returned = _supabase.table("applications").select("id, application_no, current_stage, due_at, stage_entered_at") \
        .eq("institution_id", inst_id).eq("status", "returned").execute().data or []
    for a in returned:
        due = _as_date(a.get("due_at")) or _as_date(a.get("stage_entered_at")) or today
        items.append({
            "id": f"application:{a['id']}",
            "type": "application",
            "entity_id": a["id"],
            "application_id": a["id"],
            "title": f"Respond to deficiency on {a['application_no']}",
            "date": due.isoformat(),
            "days_left": (due - today).days,
            "status": _urgency(due, today, DUE_SOON_DAYS),
            "detail": f"Returned at stage {a['current_stage']}",
            "action": "respond",
        })

    items.sort(key=lambda i: (i["date"], i["type"]))
    return {
        "today": today.isoformat(),
        "items": items[:limit],
        # Overdue items sort first, so the next three are the most pressing
        "next": [i for i in items if i["action"]][:3],
    }
