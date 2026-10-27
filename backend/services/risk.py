"""
Delay-Risk Score Calculator (Section 10.1).
Score from 0 to 100 as the sum of four capped parts, returned with top three reasons:
- Stage age: 40 * min(1, time in stage / stage SLA)
- Officer load: 20 * min(1, officer open cases / (2 * regional average))
- Returns: 20 * min(1, returns count / 3)
- Institution history: 20 * (1 - health score / 100)

Labels: <35 Low, 35-65 Medium, >65 High.
"""
from datetime import datetime
from typing import Dict, Any, List
import logging
from supabase import create_client
from core.config import settings
from core import clock

logger = logging.getLogger("aicte.risk")
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def compute_application_risk(application_id: str, sim_now: datetime) -> Dict[str, Any]:
    """
    Computes delay-risk score and top 3 reasons for an application.
    """
    now_iso = sim_now.isoformat()
    app_res = _supabase.table("applications").select("*, institutions(health_score, region_id)").eq("id", application_id).limit(1).execute()
    if not app_res.data:
        return {"risk_score": 0, "tier": "Low", "reasons": []}
    
    app = app_res.data[0]
    inst = app.get("institutions") or {}
    region_id = inst.get("region_id") or app.get("region_id")
    health_score = inst.get("health_score")
    if health_score is None:
        health_score = 100

    reasons: List[Dict[str, Any]] = []

    # 1. Stage age (40 * min(1, time in stage / stage SLA))
    entered_at_str = app.get("stage_entered_at")
    due_at_str = app.get("due_at")
    stage_age_score = 0.0

    if entered_at_str and due_at_str:
        try:
            entered_at = datetime.fromisoformat(entered_at_str.replace("Z", "+00:00"))
            due_at = datetime.fromisoformat(due_at_str.replace("Z", "+00:00"))
            total_sla_seconds = max(1.0, (due_at - entered_at).total_seconds())
            elapsed_seconds = max(0.0, (sim_now - entered_at).total_seconds())
            ratio = min(1.0, elapsed_seconds / total_sla_seconds)
            stage_age_score = 40.0 * ratio
            
            days_elapsed = round(elapsed_seconds / 86400, 1)
            days_sla = round(total_sla_seconds / 86400, 1)
            reasons.append({
                "factor": "Stage Age",
                "score": round(stage_age_score, 1),
                "text": f"Current stage age ({days_elapsed}d) is {int(ratio*100)}% of the {days_sla}d SLA window."
            })
        except Exception as e:
            logger.warning(f"Error computing stage age risk: {e}")

    # 2. Officer load (20 * min(1, officer open cases / (2 * regional average)))
    officer_load_score = 0.0
    assigned_to = app.get("assigned_to")
    if assigned_to and region_id:
        try:
            # Peers: officers in the region with the same role as the assigned officer
            owner_res = _supabase.table("profiles").select("role").eq("user_id", assigned_to).limit(1).execute()
            owner_role = owner_res.data[0]["role"] if owner_res.data else None
            officer_ids = []
            if owner_role:
                officers_res = _supabase.table("profiles").select("user_id").eq("region_id", region_id).eq("role", owner_role).execute()
                officer_ids = [o["user_id"] for o in (officers_res.data or [])]
            if officer_ids:
                # Open cases held by those officers
                open_apps = _supabase.table("applications").select("assigned_to").in_("assigned_to", officer_ids).eq("status", "in_progress").execute()
                total_open = len(open_apps.data or [])
                avg_load = total_open / max(1, len(officer_ids))

                officer_cases = sum(1 for a in (open_apps.data or []) if a.get("assigned_to") == assigned_to)
                denom = max(1.0, 2.0 * avg_load)
                load_ratio = min(1.0, officer_cases / denom)
                officer_load_score = 20.0 * load_ratio

                reasons.append({
                    "factor": "Officer Workload",
                    "score": round(officer_load_score, 1),
                    "text": f"Assigned officer handles {officer_cases} open cases (Regional avg: {round(avg_load, 1)})."
                })
        except Exception as e:
            logger.warning(f"Error computing officer load risk: {e}")

    # 3. Returns count (20 * min(1, returns count / 3))
    returns_score = 0.0
    try:
        hist_res = _supabase.table("stage_history").select("id").eq("application_id", application_id).eq("action", "return").execute()
        return_count = len(hist_res.data or [])
        ret_ratio = min(1.0, return_count / 3.0)
        returns_score = 20.0 * ret_ratio
        if return_count > 0:
            reasons.append({
                "factor": "Deficiency Returns",
                "score": round(returns_score, 1),
                "text": f"Application has been returned for deficiencies {return_count} time(s)."
            })
    except Exception as e:
        logger.warning(f"Error computing returns risk: {e}")

    # 4. Institution history (20 * (1 - health_score / 100))
    inst_history_score = 20.0 * (1.0 - (float(health_score) / 100.0))
    if health_score < 80:
        reasons.append({
            "factor": "Institution Health",
            "score": round(inst_history_score, 1),
            "text": f"Institution compliance health score is {health_score}/100."
        })

    # Total score capped 0-100
    raw_total = stage_age_score + officer_load_score + returns_score + inst_history_score
    risk_score = round(min(100.0, max(0.0, raw_total)), 1)

    if risk_score > 65.0:
        tier = "High"
        badge_color = "red"
    elif risk_score >= 35.0:
        tier = "Medium"
        badge_color = "amber"
    else:
        tier = "Low"
        badge_color = "green"

    # Sort reasons by weight descending, pick top 3
    reasons.sort(key=lambda r: r["score"], reverse=True)
    top_reasons = [r["text"] for r in reasons[:3]]
    if not top_reasons:
        top_reasons = ["Application progressing within standard parameters."]

    return {
        "risk_score": risk_score,
        "tier": tier,
        "badge_color": badge_color,
        "reasons": top_reasons,
        "components": {
            "stage_age": round(stage_age_score, 1),
            "officer_load": round(officer_load_score, 1),
            "returns": round(returns_score, 1),
            "institution_history": round(inst_history_score, 1)
        },
        "advisory": "Advisory only, final decisions rest with the competent authority."
    }
