"""
Scheduler Service (Section 5.4).
Runs SLA monitoring, generates reminder/overdue/escalation alerts,
notifies target users, auto-resolves cleared alerts, and tracks execution runs.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from supabase import create_client
import asyncio
import concurrent.futures
import logging
import math

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


_DEFAULT_CHAIN = {
    "levels": [
        {"level": 1, "after_days_overdue": 0, "notify_role": "assigned_officer", "channels": ["in_app", "email"]},
        {"level": 2, "after_days_overdue": 3, "notify_role": "regional_officer", "channels": ["in_app", "email", "sms"]},
        {"level": 3, "after_days_overdue": 7, "notify_role": "bureau_officer", "channels": ["in_app", "email", "sms", "whatsapp"]},
    ],
    "ack_timeout_hours": 48
}

# alerts.cycle (migration 0005) lets the same reminder fire again in a new stage or after a
# deadline is reset. Probed once so the scheduler still runs before that migration is applied.
_alert_cycle_supported: Optional[bool] = None


def _supports_alert_cycle() -> bool:
    global _alert_cycle_supported
    if _alert_cycle_supported is None:
        try:
            _supabase.table("alerts").select("cycle").limit(1).execute()
            _alert_cycle_supported = True
        except Exception:
            logger.warning("alerts.cycle column missing (apply migration 0005); stage-specific alert keys are disabled")
            _alert_cycle_supported = False
    return _alert_cycle_supported


def _alert_cycle(entity_type: str, entity_row: Dict[str, Any]) -> str:
    """The period an alert belongs to: a stage visit for applications, a deadline for undertakings."""
    field = {"application_stage": "stage_entered_at", "undertaking": "due_at"}.get(entity_type)
    dt = _parse_dt(entity_row.get(field)) if field else None
    return str(math.floor(dt.timestamp())) if dt else ""


def _load_rules(scope: str) -> List[Dict[str, Any]]:
    try:
        return _supabase.table("sla_rules").select("*").eq("scope", scope).eq("is_active", True).execute().data or []
    except Exception as e:
        logger.warning(f"Error loading SLA rules for {scope}: {e}")
        return []


def get_sla_rule(
    scope: str,
    stage_key: Optional[str] = None,
    region_id: Optional[str] = None,
    rules: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Most specific matching SLA rule: region-specific over national, stage-specific over scope-wide."""
    if rules is None:
        rules = _load_rules(scope)
    candidates = [
        r for r in rules
        if r.get("region_id") in (None, region_id)
        and (stage_key is None or r.get("stage_key") in (None, stage_key))
    ]
    if candidates:
        return max(candidates, key=lambda r: (r.get("region_id") is not None, r.get("stage_key") is not None))

    # Fallback defaults
    if scope == "document_expiry":
        return {"reminder_offsets_days": [90, 60, 30, 7]}
    return {"reminder_offsets_days": [7, 3, 1]}


def get_escalation_chain(scope: str, region_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Escalation chain for a scope. Region-specific rows override the national row; scopes without
    their own chain use the application_stage chain, which is the national default.
    """
    try:
        rows = _supabase.table("escalation_chains").select("*").in_("scope", [scope, "application_stage"]).execute().data or []
        for want_scope in (scope, "application_stage"):
            for want_region in (region_id, None):
                for row in rows:
                    if row.get("scope") == want_scope and row.get("region_id") == want_region:
                        return row
    except Exception as e:
        logger.warning(f"Error loading escalation chain: {e}")
    return _DEFAULT_CHAIN


def _profile_ids(**filters) -> List[str]:
    q = _supabase.table("profiles").select("user_id")
    for k, v in filters.items():
        q = q.eq(k, v)
    return [u["user_id"] for u in (q.execute().data or [])]


def _institution_users(entity_row: Dict[str, Any]) -> List[str]:
    inst_id = entity_row.get("institution_id")
    return _profile_ids(institution_id=inst_id) if inst_id else []


def _responsible_users(entity_type: str, entity_row: Dict[str, Any]) -> List[str]:
    """Who owns the item day to day: the first recipients of reminders and of escalation level 1."""
    region_id = entity_row.get("region_id")
    if entity_type == "application_stage":
        if entity_row.get("current_stage") == "institution_response":
            return _institution_users(entity_row)
        if entity_row.get("assigned_to"):
            return [entity_row["assigned_to"]]
        if region_id:
            p = _supabase.table("profiles").select("user_id") \
                .eq("region_id", region_id).in_("role", ["scrutiny_officer", "regional_officer"]).execute()
            return [u["user_id"] for u in (p.data or [])]
        return []
    if entity_type in ("evc_scheduling", "evc_completion"):
        targets = [str(m) for m in (entity_row.get("committee_members") or [])] if entity_type == "evc_completion" else []
        if region_id:
            targets += _profile_ids(region_id=region_id, role="regional_officer")
        return targets
    if entity_type in ("undertaking", "document"):
        return _institution_users(entity_row)
    return []


def resolve_targets(
    entity_type: str,
    entity_row: Dict[str, Any],
    kind: str,
    level: int,
    notify_role: Optional[str] = None
) -> List[str]:
    """Identify user_ids that should receive notification for this alert."""
    target_user_ids: List[str] = []
    try:
        region_id = entity_row.get("region_id")
        if kind != "escalation":
            target_user_ids = _responsible_users(entity_type, entity_row)
            # Late undertakings concern the regional office as well as the institution
            if kind == "overdue" and entity_type == "undertaking" and region_id:
                target_user_ids += _profile_ids(region_id=region_id, role="regional_officer")
        else:
            role = notify_role or {1: "assigned_officer", 2: "regional_officer", 3: "bureau_officer"}.get(level, "bureau_officer")
            if role == "assigned_officer":
                target_user_ids = _responsible_users(entity_type, entity_row)
            elif role == "bureau_officer":
                target_user_ids = _profile_ids(role="bureau_officer")
            elif region_id:
                target_user_ids = _profile_ids(region_id=region_id, role=role)
    except Exception as e:
        logger.error(f"Error resolving targets for {entity_type} {kind}: {e}")

    return list(set(target_user_ids))


def _reference_no(entity_type: str, entity_row: Dict[str, Any]) -> str:
    """A reference safe to put in an email or SMS: the application number, or a short id."""
    if entity_row.get("application_no"):
        return entity_row["application_no"]
    prefix = {"evc_visit": "EVC", "undertaking": "UND", "document": "DOC", "decision": "DEC"}.get(entity_type, "REF")
    return f"{prefix}-{str(entity_row['id'])[:8].upper()}"


def fire_alert(
    entity_type: str,
    entity_row: Dict[str, Any],
    kind: str,
    level: int,
    severity: str,
    message: str,
    target_role: Optional[str] = None,
    channels: Optional[List[str]] = None,
    due: Optional[datetime] = None,
) -> Optional[Dict[str, Any]]:
    """
    Insert an alert strictly once (unique constraint: entity_type, entity_id, kind, level, cycle).
    Returns the created alert dict if newly inserted, or None if already exists.
    """
    entity_id = entity_row["id"]
    use_cycle = _supports_alert_cycle()
    cycle = _alert_cycle(entity_type, entity_row)
    try:
        # Check if already fired
        q = _supabase.table("alerts").select("id") \
            .eq("entity_type", entity_type) \
            .eq("entity_id", entity_id) \
            .eq("kind", kind) \
            .eq("level", level)
        if use_cycle:
            q = q.eq("cycle", cycle)
        existing = q.execute()

        if existing.data and len(existing.data) > 0:
            return None

        targets = resolve_targets(entity_type, entity_row, kind, level, notify_role=target_role)
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
        if use_cycle:
            alert_payload["cycle"] = cycle
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
                severity=severity,
                channels=channels,
                kind=kind,
                reference_no=_reference_no(entity_type, entity_row),
                due_date=due.date().isoformat() if due else None,
            )

        return created_alert
    except Exception as e:
        # Unique violation or database error
        logger.debug(f"fire_alert skipped/failed for {entity_type}/{entity_id}: {e}")
        return None


def _check_deadline(
    entity_type: str,
    row: Dict[str, Any],
    due: datetime,
    sim_now: datetime,
    offsets: List[int],
    upcoming_kind: str,
    label: str,
    chain_scope: str,
) -> Tuple[int, int]:
    """
    Fire the reminder for the smallest offset reached, or the overdue alert plus every
    escalation level whose threshold has passed. Returns (alerts_created, escalations_created).
    """
    created = escalated = 0
    days_left = (due - sim_now).total_seconds() / 86400.0

    if days_left > 0:
        reached = [o for o in offsets if days_left <= o]
        if reached:
            offset = min(reached)
            if entity_type == "document":
                sev = "info" if offset > 30 else "warning"
            else:
                sev = "info" if offset > 3 else "warning"
            msg = f"{label} is due in {math.ceil(days_left)} day(s)."
            if fire_alert(entity_type, row, upcoming_kind, offset, sev, msg, due=due):
                created += 1
        return created, escalated

    days_overdue = -days_left
    if fire_alert(entity_type, row, "overdue", 0, "warning", f"{label} is OVERDUE by {int(days_overdue)} day(s).", due=due):
        created += 1

    chain = get_escalation_chain(chain_scope, region_id=row.get("region_id"))
    for lvl_def in chain.get("levels") or []:
        lvl_num = lvl_def.get("level", 1)
        notify_role = lvl_def.get("notify_role", "assigned_officer")
        if days_overdue >= lvl_def.get("after_days_overdue", 0):
            esc_msg = (
                f"[ESCALATION LEVEL {lvl_num}] {label} is overdue by {int(days_overdue)} days. "
                f"Escalated to {notify_role}."
            )
            if fire_alert(entity_type, row, "escalation", lvl_num, "critical", esc_msg, target_role=notify_role,
                          channels=lvl_def.get("channels"), due=due):
                created += 1
                escalated += 1
    return created, escalated


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

    def tally(result: Tuple[int, int]) -> None:
        nonlocal alerts_created, escalations_created
        alerts_created += result[0]
        escalations_created += result[1]

    try:
        # ---------------------------------------------------------
        # 1. APPLICATION STAGE MONITORING
        # Returned applications are monitored too: the institution's response has its own SLA.
        # ---------------------------------------------------------
        stage_rules = _load_rules("stage")
        apps_res = _supabase.table("applications").select("*") \
            .in_("status", ["in_progress", "returned"]).not_.is_("due_at", "null").execute()
        for app in apps_res.data or []:
            due_at = _parse_dt(app.get("due_at"))
            if not due_at:
                continue
            stage = app.get("current_stage", "scrutiny")
            rule = get_sla_rule("stage", stage_key=stage, region_id=app.get("region_id"), rules=stage_rules)
            label = f"{app.get('application_no', 'Application')} in stage '{stage}'"
            tally(_check_deadline("application_stage", app, due_at, sim_now,
                                  rule.get("reminder_offsets_days") or [7, 3, 1], "upcoming", label, "application_stage"))

        # ---------------------------------------------------------
        # 2. EVC SCHEDULING & COMPLETION
        # ---------------------------------------------------------
        sched_rules = _load_rules("evc_scheduling")
        compl_rules = _load_rules("evc_completion")
        evcs_res = _supabase.table("evc_visits").select("*, applications(region_id, application_no, institution_id)") \
            .in_("status", ["queued", "scheduled", "overdue"]).execute()
        for evc in evcs_res.data or []:
            app_meta = evc.get("applications") or {}
            evc["region_id"] = app_meta.get("region_id")
            evc["institution_id"] = app_meta.get("institution_id")
            app_label = app_meta.get("application_no", "EVC case")

            if evc.get("status") == "queued":
                due = _parse_dt(evc.get("scheduling_due_at"))
                if due:
                    rule = get_sla_rule("evc_scheduling", region_id=evc["region_id"], rules=sched_rules)
                    tally(_check_deadline("evc_scheduling", evc, due, sim_now,
                                          rule.get("reminder_offsets_days") or [7, 3, 1], "upcoming",
                                          f"EVC scheduling for {app_label}", "evc_scheduling"))
            else:
                due = _parse_dt(evc.get("completion_due_at"))
                if due:
                    rule = get_sla_rule("evc_completion", region_id=evc["region_id"], rules=compl_rules)
                    tally(_check_deadline("evc_completion", evc, due, sim_now,
                                          rule.get("reminder_offsets_days") or [7, 3, 1], "upcoming",
                                          f"EVC visit and report for {app_label}", "evc_completion"))

        # ---------------------------------------------------------
        # 3. UNDERTAKINGS
        # ---------------------------------------------------------
        ut_rules = _load_rules("undertaking")
        uts_res = _supabase.table("undertakings").select("*, institutions(region_id, name)") \
            .in_("status", ["pending", "rejected", "overdue"]).execute()
        for ut in uts_res.data or []:
            inst_meta = ut.get("institutions") or {}
            ut["region_id"] = inst_meta.get("region_id")
            due = _parse_dt(ut.get("due_at"))
            if due:
                rule = get_sla_rule("undertaking", region_id=ut["region_id"], rules=ut_rules)
                tally(_check_deadline("undertaking", ut, due, sim_now,
                                      rule.get("reminder_offsets_days") or [7, 3, 1], "upcoming",
                                      f"Undertaking '{ut['title']}'", "undertaking"))

        # ---------------------------------------------------------
        # 4. DOCUMENTS EXPIRY (superseded documents are no longer monitored)
        # ---------------------------------------------------------
        doc_rules = _load_rules("document_expiry")
        docs_res = _supabase.table("documents").select("*, institutions(region_id, name)") \
            .not_.is_("valid_until", "null").neq("status", "renewed").execute()
        for doc in docs_res.data or []:
            inst_meta = doc.get("institutions") or {}
            doc["region_id"] = inst_meta.get("region_id")
            # A date-only validity runs to the end of that day
            valid_until = _parse_dt(doc.get("valid_until"))
            if valid_until:
                valid_until += timedelta(days=1)
                rule = get_sla_rule("document_expiry", region_id=doc["region_id"], rules=doc_rules)
                tally(_check_deadline("document", doc, valid_until, sim_now,
                                      rule.get("reminder_offsets_days") or [90, 60, 30, 7], "expiry",
                                      f"Document '{doc['doc_type']}' ({doc.get('title', '')})", "document"))

        # ---------------------------------------------------------
        # 5. AUTO-RESOLVE CLEARED ALERTS
        # ---------------------------------------------------------
        resolve_cleared_alerts(sim_now)

        # ---------------------------------------------------------
        # 6. RE-ESCALATE UNACKNOWLEDGED CRITICAL ALERTS (§5.4, §10)
        # ---------------------------------------------------------
        reescalated = reescalate_unacknowledged(sim_now)
        alerts_created += reescalated
        escalations_created += reescalated

        # ---------------------------------------------------------
        # 7. RECOMPUTE COMPLIANCE HEALTH SCORES (§10.2)
        # ---------------------------------------------------------
        try:
            from services import health_score
            health_score.recompute_all_health_scores(sim_now)
        except Exception as he:
            logger.warning(f"Health score recompute warning: {he}")

        # ---------------------------------------------------------
        # 8. POST-DECISION ASSURANCE RECHECK (§15.2), once per simulated day
        # ---------------------------------------------------------
        global _last_recheck_day
        if _last_recheck_day != sim_now.date():
            try:
                from services.assurance import assurance_service
                _run_coroutine(assurance_service.run_daily_post_decision_recheck())
                _last_recheck_day = sim_now.date()
            except Exception as ae:
                logger.warning(f"Assurance recheck warning: {ae}")

    except Exception as e:
        logger.exception(f"Scheduler execution error: {e}")
        errors.append(str(e))

    finished_at = datetime.now(timezone.utc)

    # ---------------------------------------------------------
    # RECORD SCHEDULER RUN
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


_last_recheck_day = None


def _run_coroutine(coro):
    """Run a coroutine to completion from sync code, whether or not an event loop is running."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    # Called from inside an async endpoint: run on a separate thread with its own loop
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


def _resolve(alert_ids: List[str], now_iso: str) -> None:
    for i in range(0, len(alert_ids), 100):
        _supabase.table("alerts").update({"status": "resolved", "resolved_at": now_iso}) \
            .in_("id", alert_ids[i:i + 100]).execute()


def resolve_cleared_alerts(sim_now: datetime) -> None:
    """
    Auto-resolve open alerts whose cause has cleared: the application left the stage the alert
    was raised for, the EVC was scheduled or completed, the undertaking was verified, or the
    document was superseded by a verified renewal.
    """
    now_iso = sim_now.isoformat()
    try:
        open_alerts = _supabase.table("alerts").select("id, entity_type, entity_id, fired_at") \
            .in_("status", ["open", "acknowledged"]).execute().data or []
        by_type: Dict[str, List[Dict[str, Any]]] = {}
        for a in open_alerts:
            by_type.setdefault(a["entity_type"], []).append(a)

        def rows(table: str, ids: List[str], fields: str) -> Dict[str, Dict[str, Any]]:
            out: Dict[str, Dict[str, Any]] = {}
            for i in range(0, len(ids), 100):
                res = _supabase.table(table).select(fields).in_("id", ids[i:i + 100]).execute()
                out.update({r["id"]: r for r in (res.data or [])})
            return out

        to_resolve: List[str] = []

        app_alerts = by_type.get("application_stage", [])
        apps = rows("applications", list({a["entity_id"] for a in app_alerts}), "id, status, stage_entered_at")
        for a in app_alerts:
            app = apps.get(a["entity_id"])
            if not app or app["status"] not in ("in_progress", "returned"):
                to_resolve.append(a["id"])
                continue
            fired, entered = _parse_dt(a.get("fired_at")), _parse_dt(app.get("stage_entered_at"))
            if fired and entered and fired < entered:
                to_resolve.append(a["id"])  # raised for a stage the application has since left

        evc_alerts = by_type.get("evc_scheduling", []) + by_type.get("evc_completion", [])
        evcs = rows("evc_visits", list({a["entity_id"] for a in evc_alerts}), "id, status")
        for a in evc_alerts:
            status = (evcs.get(a["entity_id"]) or {}).get("status")
            if a["entity_type"] == "evc_scheduling" and status != "queued":
                to_resolve.append(a["id"])
            elif a["entity_type"] == "evc_completion" and status in ("completed", "cancelled", None):
                to_resolve.append(a["id"])

        ut_alerts = by_type.get("undertaking", [])
        uts = rows("undertakings", list({a["entity_id"] for a in ut_alerts}), "id, status")
        for a in ut_alerts:
            if (uts.get(a["entity_id"]) or {}).get("status") in ("verified", None):
                to_resolve.append(a["id"])

        doc_alerts = by_type.get("document", [])
        docs = rows("documents", list({a["entity_id"] for a in doc_alerts}), "id, status")
        for a in doc_alerts:
            if (docs.get(a["entity_id"]) or {}).get("status") in ("renewed", None):
                to_resolve.append(a["id"])

        if to_resolve:
            _resolve(to_resolve, now_iso)

    except Exception as e:
        logger.error(f"Error in resolve_cleared_alerts: {e}")


def _load_entity(entity_type: str, entity_id: str) -> Optional[Dict[str, Any]]:
    """Load the monitored row behind an alert, with region_id and institution_id filled in."""
    if entity_type == "application_stage":
        res = _supabase.table("applications").select("*").eq("id", entity_id).limit(1).execute()
        return res.data[0] if res.data else None
    if entity_type in ("evc_scheduling", "evc_completion"):
        res = _supabase.table("evc_visits").select("*, applications(region_id, institution_id)").eq("id", entity_id).limit(1).execute()
        if not res.data:
            return None
        row = res.data[0]
        meta = row.get("applications") or {}
        row["region_id"], row["institution_id"] = meta.get("region_id"), meta.get("institution_id")
        return row
    table = {"undertaking": "undertakings", "document": "documents"}.get(entity_type)
    if not table:
        return None
    res = _supabase.table(table).select("*, institutions(region_id)").eq("id", entity_id).limit(1).execute()
    if not res.data:
        return None
    row = res.data[0]
    row["region_id"] = (row.get("institutions") or {}).get("region_id")
    return row


def reescalate_unacknowledged(sim_now: datetime) -> int:
    """
    Escalation alerts left unacknowledged beyond ack_timeout_hours move to the next level of
    the chain straight away instead of waiting for its days-overdue threshold (§5.4, §10).
    """
    reescalated_count = 0
    try:
        stale_alerts = _supabase.table("alerts").select("*") \
            .eq("kind", "escalation") \
            .eq("status", "open") \
            .is_("acknowledged_at", "null").execute().data or []

        for alert in stale_alerts:
            row = _load_entity(alert["entity_type"], alert["entity_id"])
            if not row:
                continue
            chain = get_escalation_chain(alert["entity_type"], region_id=row.get("region_id"))
            fired_at = _parse_dt(alert.get("fired_at"))
            timeout = timedelta(hours=chain.get("ack_timeout_hours") or 48)
            if not fired_at or sim_now - fired_at < timeout:
                continue

            next_level = (alert.get("level") or 0) + 1
            next_def = next((l for l in chain.get("levels") or [] if l.get("level") == next_level), None)
            if not next_def:
                continue  # already at the top of the chain

            notify_role = next_def.get("notify_role", "bureau_officer")
            msg = (
                f"[RE-ESCALATION LEVEL {next_level}] Level {alert.get('level')} alert was not acknowledged within "
                f"{chain.get('ack_timeout_hours') or 48} hours. Escalated to {notify_role}."
            )
            if fire_alert(alert["entity_type"], row, "escalation", next_level, "critical", msg, target_role=notify_role,
                          channels=next_def.get("channels")):
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
