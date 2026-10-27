from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, require_role, get_current_user
from core import clock

router = APIRouter(prefix="/dashboard", tags=["Dashboards"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


@router.get("/bureau")
async def get_bureau_dashboard(
    region_id: Optional[str] = Query(None),
    user: AuthenticatedUser = Depends(require_role(["bureau_officer", "admin"]))
):
    """
    National Bureau Dashboard (Section 7.2):
    - KPI cards: open, overdue, EVCs due, expiring documents, compliance rate
    - Region-wise summary from v_overdue_summary
    - Stage funnel / distribution
    - Top bottlenecks
    - Officer workload table from v_officer_workload
    - Critical escalation alerts
    """
    now = clock.now()
    now_iso = now.isoformat()

    # 1. Region-wise overdue summary
    reg_summary_q = _supabase.table("v_overdue_summary").select("*")
    if region_id:
        reg_summary_q = reg_summary_q.eq("region_id", region_id)
    reg_summary = reg_summary_q.execute().data or []

    # 2. Officer workload
    workload_q = _supabase.table("v_officer_workload").select("*")
    if region_id:
        workload_q = workload_q.eq("region_id", region_id)
    officer_workload = workload_q.order("overdue_cases", desc=True).limit(20).execute().data or []

    # 3. Stage pendency & bottleneck analysis
    pendency_q = _supabase.table("v_pendency_by_stage_region").select("*")
    if region_id:
        pendency_q = pendency_q.eq("region_id", region_id)
    pendency_rows = pendency_q.execute().data or []

    # Aggregate stage counts
    stages_map: Dict[str, Dict[str, Any]] = {}
    for r in pendency_rows:
        st = r["current_stage"]
        if st not in stages_map:
            stages_map[st] = {"stage": st, "total_cases": 0, "open_cases": 0, "overdue_cases": 0, "total_age": 0.0, "count": 0}
        stages_map[st]["total_cases"] += r.get("total_cases", 0)
        stages_map[st]["open_cases"] += r.get("open_cases", 0)
        stages_map[st]["overdue_cases"] += r.get("overdue_cases", 0)
        stages_map[st]["total_age"] += float(r.get("avg_stage_age_days", 0))
        stages_map[st]["count"] += 1

    stage_funnel = []
    for st, data in stages_map.items():
        avg_age = round(data["total_age"] / data["count"], 1) if data["count"] else 0.0
        stage_funnel.append({
            "stage": st,
            "open_cases": data["open_cases"],
            "overdue_cases": data["overdue_cases"],
            "avg_age_days": avg_age
        })
    stage_funnel.sort(key=lambda x: x["open_cases"], reverse=True)

    # 4. KPI cards calculation
    total_open = sum(r.get("open_cases", 0) for r in pendency_rows)
    total_overdue = sum(r.get("overdue_cases", 0) for r in reg_summary)
    total_evcs_due = sum(r.get("overdue_evcs", 0) for r in reg_summary)
    total_expiring_docs = sum(r.get("expired_documents", 0) for r in reg_summary)

    # Compliance rate: (total_open - total_overdue) / total_open if total_open > 0
    compliance_rate = round(max(0.0, min(100.0, ((total_open - total_overdue) / total_open * 100))) if total_open > 0 else 100.0, 1)

    # 5. Escalations Inbox (Critical or escalation alerts)
    esc_q = _supabase.table("alerts").select("*") \
        .in_("kind", ["escalation", "overdue"]) \
        .eq("status", "open") \
        .order("fired_at", desc=True).limit(10)
    escalations = esc_q.execute().data or []

    return {
        "kpis": {
            "open_applications": total_open,
            "overdue_applications": total_overdue,
            "evcs_due": total_evcs_due,
            "expiring_documents": total_expiring_docs,
            "sla_compliance_rate": compliance_rate,
            "simulated_time": now_iso
        },
        "region_summary": reg_summary,
        "stage_funnel": stage_funnel,
        "officer_workload": officer_workload,
        "escalations": escalations
    }


@router.get("/regional")
async def get_regional_dashboard(
    user: AuthenticatedUser = Depends(require_role(["regional_officer", "bureau_officer", "admin"]))
):
    """
    Regional Dashboard (Section 7.2):
    Scoped to user's region (or Western demo default).
    Includes Urgent Case Queue sorted by due_at.
    """
    region_id = user.region_id
    if not region_id:
        # Default fallback to first region
        reg = _supabase.table("regions").select("id").limit(1).execute()
        region_id = reg.data[0]["id"] if reg.data else None

    # Load bureau data filtered to this region
    base_data = await get_bureau_dashboard(region_id=region_id, user=user)

    # Urgent Case Queue sorted by due_at ASC
    cases_q = _supabase.table("applications").select("*, institutions(name, city)") \
        .eq("region_id", region_id) \
        .eq("status", "in_progress") \
        .order("due_at", desc=False) \
        .limit(25)
    urgent_queue = cases_q.execute().data or []

    # Calculate days left relative to clock.now()
    sim_now = clock.now()
    for c in urgent_queue:
        if c.get("due_at"):
            try:
                due_dt = datetime.fromisoformat(c["due_at"].replace("Z", "+00:00"))
                diff = (due_dt - sim_now).total_seconds() / 86400.0
                c["days_left"] = round(diff, 1)
                c["is_overdue"] = diff < 0
            except Exception:
                c["days_left"] = None
                c["is_overdue"] = False

    base_data["urgent_case_queue"] = urgent_queue
    return base_data


@router.get("/officer")
async def get_officer_dashboard(
    user: AuthenticatedUser = Depends(require_role(["scrutiny_officer", "regional_officer", "evc_member", "bureau_officer", "admin"]))
):
    """
    Officer Dashboard (Section 7.2):
    My cases, due today, due this week, overdue cases.
    """
    now = clock.now()
    uid = str(user.id)

    # Applications assigned to this officer
    res = _supabase.table("applications").select("*, institutions(name, city)") \
        .eq("assigned_to", uid) \
        .eq("status", "in_progress") \
        .order("due_at", desc=False).execute()
    cases = res.data or []

    due_today = []
    due_this_week = []
    overdue = []
    upcoming = []

    for c in cases:
        if c.get("due_at"):
            try:
                due_dt = datetime.fromisoformat(c["due_at"].replace("Z", "+00:00"))
                diff_days = (due_dt - now).total_seconds() / 86400.0
                c["days_remaining"] = round(diff_days, 1)

                if diff_days < 0:
                    overdue.append(c)
                elif diff_days <= 1:
                    due_today.append(c)
                elif diff_days <= 7:
                    due_this_week.append(c)
                else:
                    upcoming.append(c)
            except Exception:
                upcoming.append(c)
        else:
            upcoming.append(c)

    return {
        "kpis": {
            "total_assigned": len(cases),
            "due_today": len(due_today),
            "due_this_week": len(due_this_week),
            "overdue": len(overdue)
        },
        "cases": {
            "overdue": overdue,
            "due_today": due_today,
            "due_this_week": due_this_week,
            "upcoming": upcoming
        }
    }


@router.get("/institution")
async def get_institution_dashboard(
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Institution Dashboard (Section 7.2):
    My applications with stage tracker, upcoming deadlines, undertakings,
    document validity, and health score gauge.
    """
    inst_id = user.institution_id
    if not inst_id:
        inst = _supabase.table("institutions").select("id").limit(1).execute()
        inst_id = inst.data[0]["id"] if inst.data else None

    # Institution details & health score
    inst_res = _supabase.table("institutions").select("*, regions(name)").eq("id", inst_id).limit(1).execute()
    institution = inst_res.data[0] if inst_res.data else {}

    # Applications
    apps_res = _supabase.table("applications").select("*, workflow_templates(name, code)") \
        .eq("institution_id", inst_id).order("submitted_at", desc=True).execute()
    applications = apps_res.data or []

    # Undertakings
    ut_res = _supabase.table("undertakings").select("*, documents(title, storage_path)") \
        .eq("institution_id", inst_id).order("due_at", desc=False).execute()
    undertakings = ut_res.data or []

    # Documents
    doc_res = _supabase.table("documents").select("*") \
        .eq("institution_id", inst_id).order("valid_until", desc=False).execute()
    documents = doc_res.data or []

    # Compute live validity relative to simulated clock
    sim_now = clock.now().date()
    for d in documents:
        if d.get("valid_until"):
            try:
                vu = datetime.fromisoformat(str(d["valid_until"])).date()
                left = (vu - sim_now).days
                d["days_remaining"] = left
                d["live_status"] = "expired" if left < 0 else "expiring" if left <= 30 else "active"
            except Exception:
                d["live_status"] = d.get("status", "active")
        else:
            d["live_status"] = d.get("status", "active")

    return {
        "institution": institution,
        "health_score": institution.get("health_score", 85),
        "applications": applications,
        "undertakings": undertakings,
        "documents": documents
    }
