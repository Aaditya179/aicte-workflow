"""
Compliance Health Score Calculator (Section 10.2).
Start at 100 and subtract:
- 10 per overdue undertaking
- 8 per expired document without a verified renewal
- 3 per document expiring within 30 days
- 5 per return for deficiency in the last 12 months (capped at 20)
- 5 per unacknowledged critical alert
Floor at 0. Tiers: 80+ Good, 50-79 Watch, <50 At risk.
"""
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
import logging
from supabase import create_client
from core.config import settings
from core import clock

logger = logging.getLogger("aicte.health_score")
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def compute_institution_health_score(institution_id: str, sim_now: datetime) -> Dict[str, Any]:
    """
    Compute real-time health score for an institution using sim_now.
    Returns score, tier, and explicit deduction breakdown.
    """
    now_iso = sim_now.isoformat()
    now_ts = sim_now.timestamp()
    thirty_days_later = (sim_now + timedelta(days=30)).isoformat()
    twelve_months_ago = (sim_now - timedelta(days=365)).isoformat()

    deductions: List[Dict[str, Any]] = []
    total_deduction = 0

    # 1. Overdue undertakings (-10 each)
    uts_res = _supabase.table("undertakings").select("id, title, due_at, status") \
        .eq("institution_id", institution_id) \
        .in_("status", ["pending", "submitted"]) \
        .lt("due_at", now_iso).execute()
    overdue_uts = uts_res.data or []
    if overdue_uts:
        pts = len(overdue_uts) * 10
        total_deduction += pts
        deductions.append({
            "factor": "overdue_undertakings",
            "count": len(overdue_uts),
            "penalty": pts,
            "description": f"{len(overdue_uts)} overdue undertaking(s) (-{pts} pts)"
        })

    # 2. Expired documents without a verified renewal (-8 each)
    docs_res = _supabase.table("documents").select("id, doc_type, valid_until, status") \
        .eq("institution_id", institution_id).execute()
    docs = docs_res.data or []
    
    expired_unrenewed = []
    expiring_soon = []
    
    for doc in docs:
        if not doc.get("valid_until"):
            continue
        try:
            vu = datetime.fromisoformat(doc["valid_until"].replace("Z", "+00:00"))
            if vu < sim_now and doc.get("status") not in ("renewed", "verified"):
                expired_unrenewed.append(doc)
            elif sim_now <= vu <= (sim_now + timedelta(days=30)):
                expiring_soon.append(doc)
        except Exception:
            continue

    if expired_unrenewed:
        pts = len(expired_unrenewed) * 8
        total_deduction += pts
        deductions.append({
            "factor": "expired_documents",
            "count": len(expired_unrenewed),
            "penalty": pts,
            "description": f"{len(expired_unrenewed)} expired unrenewed document(s) (-{pts} pts)"
        })

    # 3. Documents expiring within 30 days (-3 each)
    if expiring_soon:
        pts = len(expiring_soon) * 3
        total_deduction += pts
        deductions.append({
            "factor": "expiring_soon_documents",
            "count": len(expiring_soon),
            "penalty": pts,
            "description": f"{len(expiring_soon)} document(s) expiring within 30 days (-{pts} pts)"
        })

    # 4. Returns for deficiency in the last 12 months (-5 each, capped at 20)
    # Check applications belonging to institution
    apps_res = _supabase.table("applications").select("id").eq("institution_id", institution_id).execute()
    app_ids = [a["id"] for a in (apps_res.data or [])]
    deficiency_count = 0
    if app_ids:
        # Check stage_history with action='return' or returned status
        hist_res = _supabase.table("stage_history").select("id, action, entered_at") \
            .in_("application_id", app_ids) \
            .eq("action", "return") \
            .gte("entered_at", twelve_months_ago).execute()
        deficiency_count = len(hist_res.data or [])

    if deficiency_count > 0:
        pts = min(deficiency_count * 5, 20)
        total_deduction += pts
        deductions.append({
            "factor": "deficiency_returns",
            "count": deficiency_count,
            "penalty": pts,
            "description": f"{deficiency_count} deficiency return(s) in past 12 months (-{pts} pts, capped at 20)"
        })

    # 5. Unacknowledged critical alerts (-5 each)
    # Alerts linked to institution or its applications
    alert_query = _supabase.table("alerts").select("id, severity, status") \
        .eq("severity", "critical") \
        .eq("status", "open")
    
    # Check alerts where entity_id in app_ids or entity_id == institution_id
    crit_alerts = []
    if app_ids:
        app_alerts = _supabase.table("alerts").select("id") \
            .eq("severity", "critical") \
            .eq("status", "open") \
            .in_("entity_id", app_ids).execute()
        crit_alerts.extend(app_alerts.data or [])

    inst_alerts = _supabase.table("alerts").select("id") \
        .eq("severity", "critical") \
        .eq("status", "open") \
        .eq("entity_id", institution_id).execute()
    crit_alerts.extend(inst_alerts.data or [])
    
    # Deduplicate
    unique_crit_alert_ids = set(a["id"] for a in crit_alerts)
    if unique_crit_alert_ids:
        pts = len(unique_crit_alert_ids) * 5
        total_deduction += pts
        deductions.append({
            "factor": "unacknowledged_critical_alerts",
            "count": len(unique_crit_alert_ids),
            "penalty": pts,
            "description": f"{len(unique_crit_alert_ids)} unacknowledged critical alert(s) (-{pts} pts)"
        })

    # Compute final score
    score = max(0, 100 - total_deduction)
    if score >= 80:
        tier = "Good"
        color = "emerald"
    elif score >= 50:
        tier = "Watch"
        color = "amber"
    else:
        tier = "At risk"
        color = "rose"

    return {
        "institution_id": institution_id,
        "health_score": score,
        "tier": tier,
        "color": color,
        "total_deduction": total_deduction,
        "deductions": deductions,
        "evaluated_at": now_iso
    }


def recompute_all_health_scores(sim_now: datetime) -> int:
    """Recomputes and stores health_score on institutions table."""
    try:
        inst_res = _supabase.table("institutions").select("id").execute()
        institutions = inst_res.data or []
        updated = 0
        for inst in institutions:
            calc = compute_institution_health_score(inst["id"], sim_now)
            _supabase.table("institutions").update({
                "health_score": calc["health_score"]
            }).eq("id", inst["id"]).execute()
            updated += 1
        return updated
    except Exception as e:
        logger.error(f"Error in recompute_all_health_scores: {e}")
        return 0
