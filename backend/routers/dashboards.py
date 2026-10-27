from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from supabase import create_client
import logging

from core.config import settings
from core.security import AuthenticatedUser, require_role, get_current_user, require_case_access
from core import clock

logger = logging.getLogger("aicte.dashboards")
router = APIRouter(prefix="/dashboard", tags=["Dashboards"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


@router.get("/bureau")
async def get_bureau_dashboard(
    region_id: Optional[str] = Query(None),
    user: AuthenticatedUser = Depends(require_role(["bureau_officer"]))
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
    user: AuthenticatedUser = Depends(require_role(["regional_officer", "bureau_officer"]))
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

    # Workload Balancer (§10.5):
    # Analyze open cases per officer, find most loaded and least loaded, suggest moving oldest unstarted cases
    try:
        officers_prof = _supabase.table("profiles").select("user_id, full_name, role") \
            .eq("region_id", region_id) \
            .in_("role", ["regional_officer", "scrutiny_officer"]).execute()
        
        officer_stats = []
        for off in (officers_prof.data or []):
            u_id = off["user_id"]
            open_c = _supabase.table("applications").select("id, due_at, stage_entered_at, application_no") \
                .eq("assigned_to", u_id) \
                .eq("status", "in_progress") \
                .order("stage_entered_at", desc=False).execute()
            
            c_data = open_c.data or []
            overdue_c = 0
            for c in c_data:
                if c.get("due_at"):
                    try:
                        if datetime.fromisoformat(c["due_at"].replace("Z", "+00:00")) < sim_now:
                            overdue_c += 1
                    except Exception:
                        pass
            
            officer_stats.append({
                "user_id": u_id,
                "name": off.get("full_name") or "Officer",
                "role": off.get("role"),
                "open_count": len(c_data),
                "overdue_count": overdue_c,
                "oldest_case": c_data[0] if c_data else None
            })

        # Generate balancing suggestion if >= 2 officers
        workload_suggestion = None
        if len(officer_stats) >= 2:
            officer_stats.sort(key=lambda o: o["open_count"], reverse=True)
            most_loaded = officer_stats[0]
            least_loaded = officer_stats[-1]
            diff = most_loaded["open_count"] - least_loaded["open_count"]
            if diff >= 2 and most_loaded["oldest_case"]:
                workload_suggestion = {
                    "from_officer": most_loaded["name"],
                    "from_officer_id": most_loaded["user_id"],
                    "to_officer": least_loaded["name"],
                    "to_officer_id": least_loaded["user_id"],
                    "case_id": most_loaded["oldest_case"]["id"],
                    "case_number": most_loaded["oldest_case"]["application_no"],
                    "reason": f"High load disparity ({most_loaded['open_count']} vs {least_loaded['open_count']} open cases). Suggest reassigning oldest unstarted case.",
                    "advisory": "Advisory only, final decisions rest with the competent authority."
                }

        base_data["workload_balancer"] = {
            "officers": officer_stats,
            "suggestion": workload_suggestion
        }
    except Exception as we:
        logger.warning(f"Workload balancer calculation error: {we}")
        base_data["workload_balancer"] = {"officers": [], "suggestion": None}

    return base_data


@router.get("/officer")
async def get_officer_dashboard(
    user: AuthenticatedUser = Depends(require_role(["scrutiny_officer", "regional_officer", "evc_member", "sac_shc_member", "bureau_officer"]))
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
    user: AuthenticatedUser = Depends(require_case_access)
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


@router.get("/brief")
async def get_daily_brief(user: AuthenticatedUser = Depends(require_case_access)):
    """
    Daily brief for the signed-in officer or institution: today's facts, each with a link, and a
    short summary of them. Follows the simulated clock.
    """
    from services.brief import build_brief
    return build_brief(user)


@router.get("/admin")
async def get_admin_dashboard(user: AuthenticatedUser = Depends(require_role(["admin"]))):
    """
    Configuration and system health only. The administrator has no view of case data (§15.0),
    so nothing here names an application, institution or officer decision.
    """
    def count(table: str, **eq) -> int:
        q = _supabase.table(table).select("*", count="exact").limit(1)
        for k, v in eq.items():
            q = q.eq(k, v)
        return q.execute().count or 0

    roles: dict = {}
    for p in _supabase.table("profiles").select("role").execute().data or []:
        roles[p["role"]] = roles.get(p["role"], 0) + 1
    runs = _supabase.table("scheduler_runs").select("started_at, finished_at, clock_now, alerts_created, escalations_created, errors") \
        .order("started_at", desc=True).limit(5).execute().data or []

    names = {p["user_id"]: p["full_name"] for p in
             _supabase.table("profiles").select("user_id, full_name").in_("role", ["admin"]).execute().data or []}
    pending = _supabase.table("approval_requests").select("id, payload, requested_by, created_at") \
        .eq("kind", "rule_change").eq("status", "pending").order("created_at", desc=True).limit(5).execute().data or []
    pending_rows = [{"id": r["id"], "table": (r.get("payload") or {}).get("table"),
                     "requested_by_name": names.get(r.get("requested_by")), "created_at": r["created_at"]} for r in pending]

    # Default (national, all-stage) chain: the one most cases follow
    chains = _supabase.table("escalation_chains").select("scope, region_id, levels").execute().data or []
    default_chain = next((c for c in chains if not c.get("region_id")), chains[0] if chains else None)

    # Delivery totals per channel over the last 7 days. Counts only, no message content.
    since = (clock.now() - timedelta(days=7)).isoformat()
    deliveries: Dict[str, Dict[str, int]] = {}
    for n in _supabase.table("notifications").select("channel, delivery_status, provider_ref") \
            .gte("created_at", since).limit(5000).execute().data or []:
        ch = deliveries.setdefault(n["channel"], {"delivered": 0, "sent": 0, "failed": 0, "queued": 0, "read": 0, "simulated": 0})
        status_ = n.get("delivery_status") or "queued"
        ch[status_] = ch.get(status_, 0) + 1
        if (n.get("provider_ref") or "").startswith("simulated:"):
            ch["simulated"] += 1

    # The administrator's own configuration activity; case actions are excluded
    activity = _supabase.table("audit_log").select("seq, action, entity_type, actor_id, created_at, reason") \
        .eq("actor_role", "admin").order("seq", desc=True).limit(8).execute().data or []
    activity = [{**a, "actor_name": names.get(a.get("actor_id"))} for a in activity]

    from services import approvals as approvals_service
    return {
        "users_by_role": roles,
        "active_sla_rules": count("sla_rules", is_active=True),
        "escalation_chains": count("escalation_chains"),
        "workflow_templates": count("workflow_templates"),
        "pending_rule_changes": _supabase.table("approval_requests").select("id", count="exact")
            .eq("kind", "rule_change").eq("status", "pending").limit(1).execute().count or 0,
        "pending_rule_change_list": pending_rows,
        "maker_checker_for_overrides": approvals_service.overrides_need_approval(),
        "default_escalation_chain": default_chain.get("levels") if default_chain else [],
        "deliveries_7d": deliveries,
        "recent_admin_activity": activity,
        "recent_scheduler_runs": runs,
        "simulated_now": clock.now().isoformat(),
        "clock_offset_days": round(clock.get_offset_days(), 2),
    }
