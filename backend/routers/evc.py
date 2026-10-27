from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import date, datetime, timedelta, timezone
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, require_role, require_case_access
from core import clock
from services import audit as audit_service
from services import notifier

router = APIRouter(prefix="/evc", tags=["EVC Visits"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


class EVCScheduleRequest(BaseModel):
    scheduled_for: datetime
    committee_members: List[str] = Field(default_factory=list)
    location: Optional[str] = Field(None, max_length=300)


class AvailabilityDay(BaseModel):
    day: date
    available: bool


class AvailabilityUpdate(BaseModel):
    days: List[AvailabilityDay] = Field(..., max_length=120)


SUGGESTION_WINDOW_DAYS = 30
COMMITTEE_SIZE = 2
BUSY_MONTH_VISITS = 3


def _visit_visible(visit: Dict[str, Any], user: AuthenticatedUser) -> bool:
    app = visit.get("applications") or {}
    if user.role == "bureau_officer":
        return True
    if user.role in ("regional_officer", "scrutiny_officer"):
        return not user.region_id or app.get("region_id") == user.region_id
    if user.role == "evc_member":
        return str(user.id) in (visit.get("committee_members") or [])
    if user.role == "institution":
        return bool(user.institution_id) and app.get("institution_id") == user.institution_id
    return False


def _get_scoped_visit(evc_id: str, user: AuthenticatedUser, select: str = "*, applications(*, institutions(*))") -> Dict[str, Any]:
    res = _supabase.table("evc_visits").select(select).eq("id", evc_id).limit(1).execute()
    if not res.data or not _visit_visible(res.data[0], user):
        raise HTTPException(status_code=404, detail="EVC visit not found")
    return res.data[0]


class EVCReportRequest(BaseModel):
    title: str = "EVC Expert Committee Inspection Report"
    storage_path: str = "documents/evc_reports/inspection_report.pdf"
    remarks: Optional[str] = None


@router.get("")
async def list_evc_visits(
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
    user: AuthenticatedUser = Depends(require_case_access)
):
    """
    List EVC visits queue and calendar data (Section 6, 7.1).
    Scoped by role and region:
    - admin, bureau_officer: all visits
    - regional_officer: visits in their region
    - evc_member: visits where user is assigned or in committee
    """
    query = _supabase.table("evc_visits").select("*, applications(application_no, current_stage, region_id, institution_id, institutions(name, city))")

    if status_filter:
        query = query.eq("status", status_filter)

    query = query.order("queued_at", desc=True).limit(limit)
    res = query.execute()
    visits = res.data or []

    return [v for v in visits if _visit_visible(v, user)]


# -------------------------------------------------------------
# Availability (§15.4). Members edit their own days; regional officers read their region's.
# -------------------------------------------------------------
@router.get("/availability")
async def get_availability(
    member_id: Optional[str] = None,
    start: Optional[date] = None,
    days: int = Query(SUGGESTION_WINDOW_DAYS, ge=1, le=90),
    user: AuthenticatedUser = Depends(require_role(["evc_member", "regional_officer", "bureau_officer"])),
):
    start = start or clock.now().date()
    members_q = _supabase.table("profiles").select("user_id, full_name, base_city, region_id").eq("role", "evc_member")
    if user.role == "evc_member":
        members_q = members_q.eq("user_id", user.id)
    elif member_id:
        members_q = members_q.eq("user_id", member_id)
    if user.role == "regional_officer" and user.region_id:
        members_q = members_q.eq("region_id", user.region_id)
    members = members_q.execute().data or []
    ids = [m["user_id"] for m in members]
    rows = _supabase.table("evc_availability").select("member_id, day, available").in_("member_id", ids) \
        .gte("day", start.isoformat()).lte("day", (start + timedelta(days=days - 1)).isoformat()).execute().data if ids else []
    by_member: Dict[str, Dict[str, bool]] = {}
    for r in rows or []:
        by_member.setdefault(r["member_id"], {})[r["day"]] = r["available"]
    return {
        "start": start.isoformat(),
        "days": [(start + timedelta(days=i)).isoformat() for i in range(days)],
        "members": [{**m, "days": by_member.get(m["user_id"], {})} for m in members],
    }


@router.put("/availability")
async def update_availability(body: AvailabilityUpdate, user: AuthenticatedUser = Depends(require_role(["evc_member"]))):
    today = clock.now().date()
    if any(d.day < today for d in body.days):
        raise HTTPException(status_code=422, detail="Past days cannot be changed")
    rows = [{"member_id": user.id, "day": d.day.isoformat(), "available": d.available} for d in body.days]
    if rows:
        _supabase.table("evc_availability").upsert(rows, on_conflict="member_id,day").execute()
    return {"ok": True, "updated": len(rows)}


def _member_load(member_ids: List[str], start: date, end: date) -> Dict[str, Dict[str, Any]]:
    """Per member: the days they already have a visit, and visit counts per month."""
    visits = _supabase.table("evc_visits").select("id, scheduled_for, committee_members") \
        .in_("status", ["scheduled", "completed"]).overlaps("committee_members", member_ids) \
        .gte("scheduled_for", date(start.year, start.month, 1).isoformat()) \
        .lte("scheduled_for", (end + timedelta(days=31)).isoformat()).execute().data or []
    load: Dict[str, Dict[str, Any]] = {m: {"days": set(), "months": {}} for m in member_ids}
    for v in visits:
        day = str(v.get("scheduled_for") or "")[:10]
        if not day:
            continue
        for m in v.get("committee_members") or []:
            if m in load:
                load[m]["days"].add(day)
                load[m]["months"][day[:7]] = load[m]["months"].get(day[:7], 0) + 1
    return load


@router.get("/{evc_id}/suggest-dates")
async def suggest_dates(
    evc_id: str,
    members: Optional[str] = Query(None, description="Comma-separated member ids to keep fixed"),
    user: AuthenticatedUser = Depends(require_role(["regional_officer"])),
):
    """
    Top 3 weekday dates in the next 30 days for the visit (§15.4). A date is kept only if every
    committee member is available and has no other visit that day. Score: +2 per member based in
    the institution's city, up to +1 for earlier dates, -1 per member with more than 3 visits that
    month. Advisory only: the regional officer chooses.
    """
    visit = _get_scoped_visit(evc_id, user)
    app = visit.get("applications") or {}
    inst = app.get("institutions") or {}
    city = (inst.get("city") or "").strip().lower()
    due = datetime.fromisoformat(str(visit["scheduling_due_at"]).replace("Z", "+00:00")).date()

    pool_q = _supabase.table("profiles").select("user_id, full_name, base_city, region_id").eq("role", "evc_member")
    pool = pool_q.execute().data or []
    fixed = [m.strip() for m in (members or "").split(",") if m.strip()]
    if fixed:
        pool = [p for p in pool if p["user_id"] in fixed]
        if len(pool) != len(fixed):
            raise HTTPException(status_code=422, detail="Unknown EVC member in members")
    size = len(fixed) if fixed else COMMITTEE_SIZE
    if len(pool) < size:
        return {"suggestions": [], "message": "Not enough EVC members to form a committee"}

    today = clock.now().date()
    days = [today + timedelta(days=i) for i in range(1, SUGGESTION_WINDOW_DAYS + 1)]
    days = [d for d in days if d.weekday() < 5]
    ids = [p["user_id"] for p in pool]
    avail_rows = _supabase.table("evc_availability").select("member_id, day, available").in_("member_id", ids) \
        .gte("day", days[0].isoformat()).lte("day", days[-1].isoformat()).eq("available", True).execute().data or []
    available = {(r["member_id"], r["day"]) for r in avail_rows}
    load = _member_load(ids, days[0], days[-1])

    candidates = []
    for idx, d in enumerate(days):
        iso = d.isoformat()
        free = [p for p in pool if (p["user_id"], iso) in available and iso not in load[p["user_id"]]["days"]]
        if fixed and len(free) < len(fixed):
            continue
        if len(free) < size:
            continue

        def member_score(p):
            local = (p.get("base_city") or "").strip().lower() == city and bool(city)
            busy = load[p["user_id"]]["months"].get(iso[:7], 0) > BUSY_MONTH_VISITS
            return (2 if local else 0) - (1 if busy else 0), local, busy

        ranked = sorted(free, key=lambda p: -member_score(p)[0])[:size]
        scored = [(p, *member_score(p)) for p in ranked]
        earliness = round(1 - idx / max(len(days), 1), 2)
        score = sum(s for _, s, _, _ in scored) + earliness
        locals_ = [p["full_name"] for p, _, local, _ in scored if local]
        travellers = [f"{p['full_name']} from {p.get('base_city') or 'unknown city'}" for p, _, local, _ in scored if not local]
        busy = [p["full_name"] for p, _, _, b in scored if b]
        reasons = [f"All {size} members are available and free that day"]
        if locals_:
            reasons.append(f"{len(locals_)} member(s) based in {inst.get('city')}")
        if busy:
            reasons.append(f"{', '.join(busy)} already has more than {BUSY_MONTH_VISITS} visits this month")
        if d > due:
            reasons.append(f"after the scheduling deadline of {due.isoformat()}")
        travel = "No travel needed, all members are local" if not travellers else "Travel: " + "; ".join(travellers)
        candidates.append({
            "date": iso,
            "score": round(score, 2),
            "before_due": d <= due,
            "members": [{"user_id": p["user_id"], "full_name": p["full_name"], "base_city": p.get("base_city"),
                         "local": local, "busy_month": b} for p, _, local, b in scored],
            "reason": "; ".join(reasons),
            "travel_note": travel,
            "location": ", ".join(x for x in (inst.get("name"), inst.get("city")) if x),
        })

    # Dates before the scheduling deadline come first; within each group, the highest score
    candidates.sort(key=lambda c: (not c["before_due"], -c["score"], c["date"]))
    return {
        "visit_id": evc_id,
        "scheduling_due_at": visit["scheduling_due_at"],
        "suggestions": candidates[:3],
        "message": None if candidates else "No date in the next 30 days has a full committee available",
        "advisory": "Suggestions only. The regional officer picks the date.",
    }


@router.get("/{evc_id}")
async def get_evc_visit(
    evc_id: str,
    user: AuthenticatedUser = Depends(require_case_access)
):
    """Get single EVC visit details with linked documents."""
    return _get_scoped_visit(evc_id, user, "*, applications(*, institutions(*)), documents(*)")


@router.post("/{evc_id}/schedule")
async def schedule_evc_visit(
    evc_id: str,
    req: EVCScheduleRequest,
    user: AuthenticatedUser = Depends(require_role(["regional_officer"]))
):
    """
    Schedule an EVC visit date and assign committee members (Section 6).
    Checks conflicts and auto-resolves evc_scheduling alerts.
    """
    evc_res = _supabase.table("evc_visits").select("*, applications(region_id, application_no)").eq("id", evc_id).limit(1).execute()
    if not evc_res.data:
        raise HTTPException(status_code=404, detail="EVC visit not found")
    evc = evc_res.data[0]
    if evc.get("status") not in ("queued", "scheduled", "overdue"):
        raise HTTPException(status_code=400, detail=f"Cannot schedule a visit that is '{evc.get('status')}'")
    if user.role == "regional_officer" and (evc.get("applications") or {}).get("region_id") != user.region_id:
        raise HTTPException(status_code=403, detail="Visit is outside your region")

    scheduled_dt = req.scheduled_for if req.scheduled_for.tzinfo else req.scheduled_for.replace(tzinfo=timezone.utc)
    if scheduled_dt < clock.now() - timedelta(days=1):
        raise HTTPException(status_code=400, detail="Visit date cannot be in the past")

    # Conflict check: no committee member may have another visit on the same day
    if req.committee_members:
        others = _supabase.table("evc_visits").select("id, scheduled_for, committee_members") \
            .eq("status", "scheduled").neq("id", evc_id) \
            .overlaps("committee_members", req.committee_members).execute().data or []
        clashes = [o for o in others
                   if o.get("scheduled_for") and str(o["scheduled_for"])[:10] == scheduled_dt.date().isoformat()]
        if clashes:
            busy = sorted({m for o in clashes for m in (o.get("committee_members") or []) if m in req.committee_members})
            raise HTTPException(
                status_code=409,
                detail=f"{len(busy)} committee member(s) already have a visit on {scheduled_dt.date()}: {', '.join(busy)}"
            )

    # Completion deadline from the evc_completion SLA rule (region-specific first)
    rules = _supabase.table("sla_rules").select("*").eq("scope", "evc_completion").eq("is_active", True).execute().data or []
    region_id = (evc.get("applications") or {}).get("region_id")
    matching = [r for r in rules if r.get("region_id") in (None, region_id)]
    completion_days = max(matching, key=lambda r: r.get("region_id") is not None)["duration_days"] if matching else 15
    completion_due = scheduled_dt + timedelta(days=completion_days)

    update_payload = {
        "status": "scheduled",
        "scheduled_for": scheduled_dt.isoformat(),
        "completion_due_at": completion_due.isoformat(),
        "committee_members": req.committee_members,
        "location": req.location,
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
    user: AuthenticatedUser = Depends(require_role(["evc_member", "regional_officer"]))
):
    """Attach the official EVC inspection report (Section 6)."""
    evc_res = _supabase.table("evc_visits").select("*, applications(institution_id, application_no)").eq("id", evc_id).limit(1).execute()
    if not evc_res.data:
        raise HTTPException(status_code=404, detail="EVC visit not found")
    evc = evc_res.data[0]
    app_meta = evc.get("applications") or {}
    if user.role == "evc_member" and str(user.id) not in [str(m) for m in (evc.get("committee_members") or [])]:
        raise HTTPException(status_code=403, detail="You are not on this visit's committee")

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
    user: AuthenticatedUser = Depends(require_role(["evc_member", "regional_officer"]))
):
    """Mark EVC inspection visit complete (Section 6). Auto-resolves completion alerts."""
    evc_res = _supabase.table("evc_visits").select("*").eq("id", evc_id).limit(1).execute()
    if not evc_res.data:
        raise HTTPException(status_code=404, detail="EVC visit not found")
    evc = evc_res.data[0]
    if evc.get("status") != "scheduled":
        raise HTTPException(status_code=400, detail=f"Only a scheduled visit can be completed (status is '{evc.get('status')}')")
    if user.role == "evc_member" and str(user.id) not in [str(m) for m in (evc.get("committee_members") or [])]:
        raise HTTPException(status_code=403, detail="You are not on this visit's committee")

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
