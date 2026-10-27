"""
Scheduler Service (Section 5.4).
Runs SLA monitoring, generates reminder/overdue/escalation alerts,
notifies target users, auto-resolves cleared alerts, and tracks execution runs.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from supabase import create_client
import logging
import json

from core.config import settings
from core import clock
from services import notifier

logger = logging.getLogger("aicte.scheduler")
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def _parse_dt(val: Any) -> Optional[datetime]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    try:
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def get_sla_rule(scope: str, stage_key: Optional[str] = None, region_id: Optional[str] = None) -> Dict[str, Any]:
    """Load matching SLA rule with fallback."""
    try:
        # 1. Region-specific
        if region_id and stage_key:
            res = _supabase.table("sla_rules").select("*") \
                .eq("scope", scope).eq("stage_key", stage_key).eq("region_id", region_id) \
                .eq("is_active", True).limit(1).execute()
            if res.data:
                return res.data[0]

        # 2. Stage-key wide
        if stage_key:
            res = _supabase.table("sla_rules").select("*") \
                .eq("scope", scope).eq("stage_key", stage_key) \
                .eq("is_active", True).limit(1).execute()
            if res.data:
                return res.data[0]

        # 3. Scope wide
        res = _supabase.table("sla_rules").select("*") \
            .eq("scope", scope).eq("is_active", True).limit(1).execute()
        if res.data:
            return res.data[0]
    except Exception as e:
        logger.warning(f"Error loading SLA rule for {scope}/{stage_key}: {e}")

    # Fallback defaults
    if scope == "document_expiry":
        return {"reminder_offsets_days": [90, 60, 30, 7]}
    return {"reminder_offsets_days": [7, 3, 1]}


def get_escalation_chain(scope: str, region_id: Optional[str] = None) -> Dict[str, Any]:
    """Load escalation chain for a given scope."""
    try:
        if region_id:
            res = _supabase.table("escalation_chains").select("*") \
                .eq("scope", scope).eq("region_id", region_id).limit(1).execute()
            if res.data:
                return res.data[0]

        res = _supabase.table("escalation_chains").select("*") \
            .eq("scope", scope).limit(1).execute()
        if res.data:
            return res.data[0]
    except Exception as e:
        logger.warning(f"Error loading escalation chain: {e}")

    # Default chain from spec §9
    return {
        "levels": [
            {"level": 1, "after_days_overdue": 0, "notify_role": "assigned_officer"},
            {"level": 2, "after_days_overdue": 3, "notify_role": "regional_officer"},
            {"level": 3, "after_days_overdue": 7, "notify_role": "bureau_officer"},
        ],
        "ack_timeout_hours": 48
    }


def resolve_targets(
    entity_type: str,
    entity_row: Dict[str, Any],
    kind: str,
    level: int
) -> List[str]:
    """Identify user_ids that should receive notification for this alert."""
    target_user_ids = []
    try:
        region_id = entity_row.get("region_id")

        if entity_type == "application_stage":
            assigned_to = entity_row.get("assigned_to")
            current_stage = entity_row.get("current_stage")

            if kind in ("upcoming", "overdue"):
                if current_stage == "institution_response":
                    inst_id = entity_row.get("institution_id")
                    if inst_id:
                        p = _supabase.table("profiles").select("user_id").eq("institution_id", inst_id).execute()
                        target_user_ids.extend([u["user_id"] for u in p.data])
                elif assigned_to:
                    target_user_ids.append(assigned_to)
                elif region_id:
                    # Notify scrutiny or regional officers in region
                    p = _supabase.table("profiles").select("user_id") \
                        .eq("region_id", region_id).in_("role", ["scrutiny_officer", "regional_officer"]).execute()
                    target_user_ids.extend([u["user_id"] for u in p.data])

            elif kind == "escalation":
                if level == 1:
                    if assigned_to:
                        target_user_ids.append(assigned_to)
                    elif region_id:
                        p = _supabase.table("profiles").select("user_id").eq("region_id", region_id).eq("role", "scrutiny_officer").execute()
                        target_user_ids.extend([u["user_id"] for u in p.data])
                elif level == 2:
                    if region_id:
                        p = _supabase.table("profiles").select("user_id").eq("region_id", region_id).eq("role", "regional_officer").execute()
                        target_user_ids.extend([u["user_id"] for u in p.data])
                elif level == 3:
                    p = _supabase.table("profiles").select("user_id").eq("role", "bureau_officer").execute()
                    target_user_ids.extend([u["user_id"] for u in p.data])

        elif entity_type in ("evc_scheduling", "evc_completion"):
            if region_id:
                p = _supabase.table("profiles").select("user_id").eq("region_id", region_id).eq("role", "regional_officer").execute()
                target_user_ids.extend([u["user_id"] for u in p.data])
            # If committee assigned
            committee = entity_row.get("committee_members") or []
            target_user_ids.extend([str(m) for m in committee])

        elif entity_type == "undertaking":
            inst_id = entity_row.get("institution_id")
            if inst_id:
                p = _supabase.table("profiles").select("user_id").eq("institution_id", inst_id).execute()
                target_user_ids.extend([u["user_id"] for u in p.data])
            if kind in ("overdue", "escalation"):
                if region_id:
                    p = _supabase.table("profiles").select("user_id").eq("region_id", region_id).eq("role", "regional_officer").execute()
                    target_user_ids.extend([u["user_id"] for u in p.data])

        elif entity_type == "document":
            inst_id = entity_row.get("institution_id")
            if inst_id:
                p = _supabase.table("profiles").select("user_id").eq("institution_id", inst_id).execute()
                target_user_ids.extend([u["user_id"] for u in p.data])

    except Exception as e:
        logger.error(f"Error resolving targets for {entity_type} {kind}: {e}")

    return list(set(target_user_ids))


def fire_alert(
    entity_type: str,
    entity_row: Dict[str, Any],
    kind: str,
    level: int,
    severity: str,
    message: str,
    target_role: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Insert an alert strictly once (unique constraint: entity_type, entity_id, kind, level).
    Returns the created alert dict if newly inserted, or None if already exists.
    """
    entity_id = entity_row["id"]
    try:
        # Check if already fired
        existing = _supabase.table("alerts").select("id") \
            .eq("entity_type", entity_type) \
            .eq("entity_id", entity_id) \
            .eq("kind", kind) \
            .eq("level", level).execute()

        if existing.data and len(existing.data) > 0:
            return None

        # Determine target user if single
        targets = resolve_targets(entity_type, entity_row, kind, level)
        target_uid = targets[0] if len(targets) == 1 else None

        now_iso = clock.now().isoformat()
        alert_payload = {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "kind": kind,
            "level": level,
            "severity": severity,
            "message": message,
            "status": "open",
            "target_role": target_role,
            "target_user_id": target_uid,
            "fired_at": now_iso
        }
        res = _supabase.table("alerts").insert(alert_payload).execute()
        if not res.data:
            return None
        created_alert = res.data[0]

        # Send in-app notifications to all target recipients
        title = f"[{severity.upper()}] {kind.title()} Alert"
        if targets:
            notifier.notify_users(
                user_ids=targets,
                title=title,
                body=message,
                alert_id=created_alert["id"],
                severity=severity
            )

        return created_alert
    except Exception as e:
        # Unique violation or database error
        logger.debug(f"fire_alert skipped/failed for {entity_type}/{entity_id}: {e}")
        return None


def run_once() -> Dict[str, Any]:
    """
    Execute full scheduler pass.
    1. Scan applications for upcoming / overdue / escalations.
    2. Scan EVC scheduling & completion.
    3. Scan undertakings.
    4. Scan document expiries.
    5. Resolve cleared alerts.
    6. Re-escalate unacknowledged alerts.
    7. Record execution summary in scheduler_runs.
    """
    sim_now = clock.now()
    started_at = datetime.now(timezone.utc)
    alerts_created = 0
    escalations_created = 0
    errors = []

    try:
        # ---------------------------------------------------------
        # 1. APPLICATION STAGE MONITORING
        # ---------------------------------------------------------
        apps_res = _supabase.table("applications").select("*") \
            .eq("status", "in_progress").not_.is_("due_at", "null").execute()
        apps = apps_res.data or []

        for app in apps:
            due_at = _parse_dt(app.get("due_at"))
            if not due_at:
                continue

            app_no = app.get("application_no", "Application")
            stage = app.get("current_stage", "scrutiny")
            rule = get_sla_rule("stage", stage_key=stage, region_id=app.get("region_id"))
            offsets = rule.get("reminder_offsets_days") or [7, 3, 1]

            days_left = (due_at - sim_now).total_seconds() / 86400.0

            if days_left > 0:
                # Upcoming deadline check
                reached = [o for o in offsets if days_left <= o]
                if reached:
                    target_offset = min(reached)
                    sev = "info" if target_offset > 3 else "warning"
                    msg = f"{app_no} in stage '{stage}' is due in {int(days_left) + 1} day(s)."
                    created = fire_alert(
                        entity_type="application_stage",
                        entity_row=app,
                        kind="upcoming",
                        level=target_offset,
                        severity=sev,
                        message=msg,
                        target_role=app.get("current_stage_owner_role")
                    )
                    if created:
                        alerts_created += 1
            else:
                # Overdue & Escalation
                days_overdue = -days_left
                # Level 0 Overdue alert
                msg = f"{app_no} in stage '{stage}' is OVERDUE by {int(days_overdue)} day(s)!"
                created_overdue = fire_alert(
                    entity_type="application_stage",
                    entity_row=app,
                    kind="overdue",
                    level=0,
                    severity="warning",
                    message=msg,
                    target_role=app.get("current_stage_owner_role")
                )
                if created_overdue:
                    alerts_created += 1

                # Escalation levels
                chain = get_escalation_chain("application_stage", region_id=app.get("region_id"))
                levels = chain.get("levels") or []
                for lvl_def in levels:
                    lvl_num = lvl_def.get("level", 1)
                    after_days = lvl_def.get("after_days_overdue", 0)
                    notify_role = lvl_def.get("notify_role", "officer")

                    if days_overdue >= after_days:
                        esc_msg = (
                            f"[ESCALATION LEVEL {lvl_num}] {app_no} in stage '{stage}' "
                            f"is overdue by {int(days_overdue)} days. Escalated to {notify_role}."
                        )
                        created_esc = fire_alert(
                            entity_type="application_stage",
                            entity_row=app,
                            kind="escalation",
                            level=lvl_num,
                            severity="critical",
                            message=esc_msg,
                            target_role=notify_role
                        )
                        if created_esc:
                            alerts_created += 1
                            escalations_created += 1

        # ---------------------------------------------------------
        # 2. EVC SCHEDULING & COMPLETION
        # ---------------------------------------------------------
        evcs_res = _supabase.table("evc_visits").select("*, applications(region_id, application_no)").execute()
        evcs = evcs_res.data or []

        for evc in evcs:
            app_meta = evc.get("applications") or {}
            evc["region_id"] = app_meta.get("region_id")
            app_label = app_meta.get("application_no", "EVC Case")

            # EVC Scheduling
            if evc.get("status") == "queued" and evc.get("scheduling_due_at"):
                due = _parse_dt(evc["scheduling_due_at"])
                if due:
                    left = (due - sim_now).total_seconds() / 86400.0
                    if left > 0:
                        if left <= 10:
                            created = fire_alert("evc_scheduling", evc, "upcoming", int(left) or 1, "info",
                                                 f"EVC Visit for {app_label} must be scheduled within {int(left)+1} days.")
                            if created: alerts_created += 1
                    else:
                        created = fire_alert("evc_scheduling", evc, "overdue", 0, "warning",
                                             f"EVC scheduling for {app_label} is OVERDUE!")
                        if created: alerts_created += 1

            # EVC Completion
            if evc.get("status") in ("queued", "scheduled") and evc.get("completion_due_at"):
                due = _parse_dt(evc["completion_due_at"])
                if due:
                    left = (due - sim_now).total_seconds() / 86400.0
                    if left <= 0:
                        created = fire_alert("evc_completion", evc, "overdue", 0, "warning",
                                             f"EVC visit/report for {app_label} is OVERDUE.")
                        if created: alerts_created += 1

        # ---------------------------------------------------------
        # 3. UNDERTAKINGS
        # ---------------------------------------------------------
        uts_res = _supabase.table("undertakings").select("*, institutions(region_id, name)").in_("status", ["pending", "rejected"]).execute()
        for ut in (uts_res.data or []):
            inst_meta = ut.get("institutions") or {}
            ut["region_id"] = inst_meta.get("region_id")
            due = _parse_dt(ut.get("due_at"))
            if due:
                left = (due - sim_now).total_seconds() / 86400.0
                if left > 0:
                    if left <= 5:
                        created = fire_alert("undertaking", ut, "upcoming", int(left) or 1, "warning",
                                             f"Undertaking '{ut['title']}' for {inst_meta.get('name', 'College')} due in {int(left)+1} days.")
                        if created: alerts_created += 1
                else:
                    created = fire_alert("undertaking", ut, "overdue", 0, "critical",
                                         f"Undertaking '{ut['title']}' is OVERDUE!")
                    if created: alerts_created += 1

        # ---------------------------------------------------------
        # 4. DOCUMENTS EXPIRY
        # ---------------------------------------------------------
        docs_res = _supabase.table("documents").select("*, institutions(region_id, name)").not_.is_("valid_until", "null").execute()
        for doc in (docs_res.data or []):
            inst_meta = doc.get("institutions") or {}
            doc["region_id"] = inst_meta.get("region_id")
            valid_until = _parse_dt(doc.get("valid_until"))
            if valid_until:
                left = (valid_until - sim_now).total_seconds() / 86400.0
                if left > 0:
                    doc_offsets = [90, 60, 30, 7]
                    reached = [o for o in doc_offsets if left <= o]
                    if reached:
                        min_offset = min(reached)
                        created = fire_alert("document", doc, "expiry", min_offset,
                                             "info" if min_offset > 30 else "warning",
                                             f"Document '{doc['doc_type']}' expires in {int(left)+1} days.")
                        if created: alerts_created += 1
                else:
                    created = fire_alert("document", doc, "overdue", 0, "critical",
                                         f"Document '{doc['doc_type']}' for {inst_meta.get('name', 'College')} has EXPIRED.")
                    if created: alerts_created += 1

        # ---------------------------------------------------------
        # 5. AUTO-RESOLVE CLEARED ALERTS
        # ---------------------------------------------------------
        resolve_cleared_alerts(sim_now)

        # ---------------------------------------------------------
        # 6. RE-ESCALATE UNACKNOWLEDGED CRITICAL ALERTS (§5.4, §10)
        # ---------------------------------------------------------
        reescalate_unacknowledged(sim_now)

        # ---------------------------------------------------------
        # 7. RECOMPUTE COMPLIANCE HEALTH SCORES (§10.2)
        # ---------------------------------------------------------
        try:
            from services import health_score
            health_score.recompute_all_health_scores(sim_now)
        except Exception as he:
            logger.warning(f"Health score recompute warning: {he}")

        # ---------------------------------------------------------
        # 8. POST-DECISION ASSURANCE RECHECK (§15.2)
        # ---------------------------------------------------------
        try:
            import asyncio
            from services.assurance import assurance_service
            # Run async recheck in synchronous scheduler context
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(assurance_service.run_daily_post_decision_recheck())
            else:
                loop.run_until_complete(assurance_service.run_daily_post_decision_recheck())
        except Exception as ae:
            logger.warning(f"Assurance recheck warning: {ae}")

    except Exception as e:
        logger.exception(f"Scheduler execution error: {e}")
        errors.append(str(e))

    finished_at = datetime.now(timezone.utc)

    # ---------------------------------------------------------
    # 6. RECORD SCHEDULER RUN
    # ---------------------------------------------------------
    run_record = {
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "clock_now": sim_now.isoformat(),
        "alerts_created": alerts_created,
        "escalations_created": escalations_created,
        "errors": "; ".join(errors) if errors else None
    }
    try:
        res = _supabase.table("scheduler_runs").insert(run_record).execute()
        if res.data:
            run_record["id"] = res.data[0]["id"]
    except Exception as e:
        logger.error(f"Failed to record scheduler run: {e}")

    return run_record


def resolve_cleared_alerts(sim_now: datetime) -> None:
    """Auto-resolve open alerts when conditions are cleared."""
    now_iso = sim_now.isoformat()
    try:
        # 1. Closed or approved applications -> resolve open alerts
        closed_apps = _supabase.table("applications").select("id").in_("status", ["approved", "rejected", "closed"]).execute()
        closed_ids = [a["id"] for a in (closed_apps.data or [])]
        if closed_ids:
            _supabase.table("alerts").update({"status": "resolved", "resolved_at": now_iso}) \
                .eq("entity_type", "application_stage") \
                .eq("status", "open") \
                .in_("entity_id", closed_ids).execute()

        # 2. Verified undertakings
        ver_uts = _supabase.table("undertakings").select("id").eq("status", "verified").execute()
        ver_ids = [u["id"] for u in (ver_uts.data or [])]
        if ver_ids:
            _supabase.table("alerts").update({"status": "resolved", "resolved_at": now_iso}) \
                .eq("entity_type", "undertaking") \
                .eq("status", "open") \
                .in_("entity_id", ver_ids).execute()

        # 3. Renewed / verified documents
        ver_docs = _supabase.table("documents").select("id").in_("status", ["verified", "renewed"]).execute()
        vdoc_ids = [d["id"] for d in (ver_docs.data or [])]
        if vdoc_ids:
            _supabase.table("alerts").update({"status": "resolved", "resolved_at": now_iso}) \
                .eq("entity_type", "document") \
                .eq("status", "open") \
                .in_("entity_id", vdoc_ids).execute()

    except Exception as e:
        logger.error(f"Error in resolve_cleared_alerts: {e}")


def reescalate_unacknowledged(sim_now: datetime) -> int:
    """
    Re-escalate critical alerts that remain unacknowledged beyond ack_timeout_hours (§5.4, §10).
    Default timeout: 48 hours. Fires higher level notification to higher authorities.
    """
    now_iso = sim_now.isoformat()
    reescalated_count = 0
    try:
        # Fetch escalation chain default ack timeout
        chain_res = _supabase.table("escalation_chains").select("ack_timeout_hours").limit(1).execute()
        ack_timeout_hours = 48
        if chain_res.data and chain_res.data[0].get("ack_timeout_hours"):
            ack_timeout_hours = chain_res.data[0]["ack_timeout_hours"]

        timeout_cutoff = (sim_now - timedelta(hours=ack_timeout_hours)).isoformat()

        # Find open, unacknowledged critical alerts fired before cutoff that haven't been re-escalated
        stale_alerts = _supabase.table("alerts").select("*") \
            .eq("severity", "critical") \
            .eq("status", "open") \
            .is_("acknowledged_at", "null") \
            .lt("fired_at", timeout_cutoff).execute()

        for alert in (stale_alerts.data or []):
            curr_level = alert.get("level", 1)
            next_level = curr_level + 1
            # Check if higher escalation alert already exists
            existing = _supabase.table("alerts").select("id") \
                .eq("entity_type", alert["entity_type"]) \
                .eq("entity_id", alert["entity_id"]) \
                .eq("kind", "re_escalation") \
                .eq("level", next_level).execute()

            if not existing.data:
                # Fire re-escalation alert
                new_alert = {
                    "entity_type": alert["entity_type"],
                    "entity_id": alert["entity_id"],
                    "kind": "re_escalation",
                    "level": next_level,
                    "severity": "critical",
                    "title": f"URGENT RE-ESCALATION (L{next_level}): Unacknowledged breach on {alert['entity_type']} {alert['entity_id']}",
                    "message": f"Previous Level {curr_level} alert was NOT acknowledged within {ack_timeout_hours} hours. Immediate senior intervention required.",
                    "status": "open",
                    "region_id": alert.get("region_id"),
                    "fired_at": now_iso
                }
                res = _supabase.table("alerts").insert(new_alert).execute()
                if res.data:
                    reescalated_count += 1
                    logger.warning(f"Re-escalated unacknowledged alert {alert['id']} to level {next_level}")
    except Exception as e:
        logger.error(f"Error in reescalate_unacknowledged: {e}")

    return reescalated_count


# -------------------------------------------------------------
# Background Scheduler Setup (APScheduler)
# -------------------------------------------------------------
_scheduler = None

def start_background_scheduler():
    global _scheduler
    if not settings.SCHEDULER_ENABLED:
        logger.info("Scheduler is disabled by config (SCHEDULER_ENABLED=False).")
        return

    if _scheduler is not None and _scheduler.running:
        return

    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        _scheduler = BackgroundScheduler(daemon=True)
        _scheduler.add_job(run_once, "interval", minutes=1, id="sla_monitor", replace_existing=True)
        _scheduler.start()
        logger.info("APScheduler started: running every 1 minute.")
    except Exception as e:
        logger.error(f"Failed to start APScheduler: {e}")
