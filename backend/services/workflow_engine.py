"""
Workflow Engine — the heart of SIH26262.

Rules (from spec §5.3):
- advance() requires actor.role == stage.owner_role. The administrator never acts on cases (§15.0).
- On advance: close current stage_history, open next, compute due_at, auto-assign
  (same region, fewest open cases), write audit entry, notify new owner.
- If next stage has creates=evc_visit, insert evc_visits row.
- return_for_deficiency and revert require non-empty reason.
- compute_due: region-specific SLA rule first, then template-wide, fallback to sla_days.
- Final decision is always manual — nothing auto-approves.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional, Any
import uuid

from supabase import create_client
from core.config import settings
from core.security import AuthenticatedUser
from core import clock
from services import audit, notifier

_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

OFFICER_ROLES = {"scrutiny_officer", "regional_officer", "evc_member", "sac_shc_member", "bureau_officer"}
FINAL_STAGES = {"final_decision"}


# ─── Helpers ────────────────────────────────────────────────────────────────

def _fetch(table: str, **filters) -> Optional[dict]:
    q = _supabase.table(table).select("*")
    for k, v in filters.items():
        q = q.eq(k, v)
    res = q.limit(1).execute()
    return res.data[0] if res.data else None


def _fetch_all(table: str, **filters) -> list[dict]:
    q = _supabase.table(table).select("*")
    for k, v in filters.items():
        q = q.eq(k, v)
    return q.execute().data or []


def _now() -> datetime:
    return clock.now()


def _generate_app_no() -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m")
    uid = str(uuid.uuid4()).replace("-", "")[:6].upper()
    return f"AICTE/{ts}/{uid}"


def _get_template(template_id: str) -> dict:
    res = _supabase.table("workflow_templates").select("*").eq("id", template_id).limit(1).execute()
    if not res.data:
        raise ValueError(f"Workflow template {template_id} not found")
    return res.data[0]


def _get_template_by_code(code: str) -> dict:
    res = _supabase.table("workflow_templates").select("*").eq("code", code).eq("is_active", True).limit(1).execute()
    if not res.data:
        raise ValueError(f"Workflow template '{code}' not found or inactive")
    return res.data[0]


def _pick_rule(rules: list[dict], region_id: Optional[str], template_code: Optional[str]) -> Optional[dict]:
    """
    Most specific active rule wins: region + template, region only, template only, then the
    national default. Rules for another region or another template never apply.
    """
    candidates = [
        r for r in rules
        if r.get("region_id") in (None, region_id) and r.get("template_code") in (None, template_code)
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda r: (r.get("region_id") is not None, r.get("template_code") is not None))


def _compute_due(stage_def: dict, template_code: str, region_id: Optional[str], entered_at: datetime) -> datetime:
    """
    SLA lookup priority: region-specific stage rule → template-wide stage rule → stage sla_days.
    """
    stage_key = stage_def.get("key", "")
    sla_days = stage_def.get("sla_days", 15)

    sla_res = _supabase.table("sla_rules").select("*").eq("scope", "stage").eq("stage_key", stage_key).eq("is_active", True).execute()
    best_rule = _pick_rule(sla_res.data or [], region_id, template_code)
    if best_rule:
        sla_days = best_rule["duration_days"]

    return entered_at + timedelta(days=sla_days)


def _auto_assign(region_id: Optional[str], owner_role: str, exclude_user: Optional[str] = None) -> Optional[str]:
    """
    Pick the officer in the region with fewest open cases.
    Excludes institution role (they self-assign).
    """
    if owner_role == "institution" or owner_role not in OFFICER_ROLES:
        return None

    # Get officers of matching role and region
    prof_q = _supabase.table("profiles").select("user_id").eq("role", owner_role)
    if region_id:
        prof_q = prof_q.eq("region_id", region_id)
    profiles_res = prof_q.execute()

    if not profiles_res.data:
        return None

    officer_ids = [p["user_id"] for p in profiles_res.data if p["user_id"] != exclude_user]
    if not officer_ids:
        officer_ids = [p["user_id"] for p in profiles_res.data]

    # Count open cases per officer
    open_counts: dict[str, int] = {oid: 0 for oid in officer_ids}
    apps_res = _supabase.table("applications").select("assigned_to").eq("status", "in_progress").execute()
    for app in apps_res.data or []:
        if app["assigned_to"] in open_counts:
            open_counts[app["assigned_to"]] += 1

    return min(open_counts, key=open_counts.get)


def _close_current_stage_history(application_id: str, exited_at: datetime) -> None:
    res = _supabase.table("stage_history").select("id").eq("application_id", application_id).is_("exited_at", "null").execute()
    for row in res.data or []:
        _supabase.table("stage_history").update({"exited_at": exited_at.isoformat()}).eq("id", row["id"]).execute()


def _open_stage_history(application_id: str, from_stage: Optional[str], to_stage: str, action: str, actor_id: str, reason: Optional[str], entered_at: datetime) -> None:
    _supabase.table("stage_history").insert({
        "application_id": application_id,
        "from_stage": from_stage,
        "to_stage": to_stage,
        "action": action,
        "actor_id": actor_id,
        "reason": reason,
        "entered_at": entered_at.isoformat(),
    }).execute()


def _create_evc_visit(application_id: str, region_id: Optional[str], template_code: Optional[str], queued_at: datetime) -> None:
    """Create the evc_visits row when a stage with creates=evc_visit is entered."""
    # Find EVC scheduling SLA
    sla_res = _supabase.table("sla_rules").select("*").eq("scope", "evc_scheduling").eq("is_active", True).execute()
    rule = _pick_rule(sla_res.data or [], region_id, template_code)
    sched_days = rule["duration_days"] if rule else 30

    scheduling_due_at = queued_at + timedelta(days=sched_days)

    _supabase.table("evc_visits").insert({
        "application_id": application_id,
        "status": "queued",
        "queued_at": queued_at.isoformat(),
        "scheduling_due_at": scheduling_due_at.isoformat(),
    }).execute()


# ─── Engine ─────────────────────────────────────────────────────────────────

class WorkflowEngine:

    def start(
        self,
        institution_id: str,
        application_type: str,
        template_code: str,
        actor: AuthenticatedUser,
        region_id: Optional[str] = None,
    ) -> dict:
        """Submit a new application and place it at the first stage."""
        tmpl = _get_template_by_code(template_code)
        definition = tmpl["definition"]
        start_stage_key = definition["start"]
        stages = definition["stages"]
        stage_def = {**stages[start_stage_key], "key": start_stage_key}

        entered_at = _now()
        owner_role = stage_def.get("owner_role", "scrutiny_officer")
        assigned_to = _auto_assign(region_id, owner_role)

        due_at = _compute_due(stage_def, tmpl["code"], region_id, entered_at)

        app = {
            "application_no": _generate_app_no(),
            "institution_id": institution_id,
            "application_type": application_type,
            "template_id": tmpl["id"],
            "current_stage": start_stage_key,
            "status": "in_progress",
            "assigned_to": assigned_to,
            "region_id": region_id,
            "submitted_at": entered_at.isoformat(),
            "stage_entered_at": entered_at.isoformat(),
            "due_at": due_at.isoformat(),
        }
        res = _supabase.table("applications").insert(app).execute()
        if not res.data:
            raise RuntimeError("Failed to create application")
        created = res.data[0]

        _open_stage_history(
            application_id=created["id"],
            from_stage=None,
            to_stage=start_stage_key,
            action="start",
            actor_id=actor.id,
            reason=None,
            entered_at=entered_at,
        )

        audit.record(
            actor=actor,
            action="application.start",
            entity_type="application",
            entity_id=created["id"],
            before=None,
            after=created,
        )

        if assigned_to:
            notifier.notify_user(
                assigned_to,
                f"New application {created['application_no']} assigned to you",
                f"Stage: {stage_def.get('label', start_stage_key)}"
            )

        return created

    def advance(self, app_id: str, actor: AuthenticatedUser, remarks: Optional[str] = None) -> dict:
        """Move the application to the next stage."""
        app = _fetch("applications", id=app_id)
        if not app:
            raise ValueError("Application not found")
        if app["status"] not in ("in_progress", "returned"):
            raise ValueError(f"Cannot advance application in status '{app['status']}'")

        tmpl = _get_template(app["template_id"])
        definition = tmpl["definition"]
        stages = definition["stages"]
        current_stage_key = app["current_stage"]
        stage_def = {**stages[current_stage_key], "key": current_stage_key}

        owner_role = stage_def.get("owner_role", "")
        if actor.role != owner_role:
            raise PermissionError(
                f"Role '{actor.role}' cannot advance from stage '{current_stage_key}' (requires '{owner_role}')"
            )

        next_stage_key = stage_def.get("next")
        if not next_stage_key:
            raise ValueError(f"Stage '{current_stage_key}' has no next stage (it is terminal)")

        next_stage_def = {**stages[next_stage_key], "key": next_stage_key}
        now = _now()

        _close_current_stage_history(app_id, now)

        next_owner_role = next_stage_def.get("owner_role", "")
        assigned_to = _auto_assign(app.get("region_id"), next_owner_role)

        due_at = _compute_due(next_stage_def, tmpl["code"], app.get("region_id"), now)

        updates = {
            "current_stage": next_stage_key,
            "status": "in_progress",
            "stage_entered_at": now.isoformat(),
            "due_at": due_at.isoformat(),
            "assigned_to": assigned_to,
        }
        upd_res = _supabase.table("applications").update(updates).eq("id", app_id).execute()
        updated = upd_res.data[0] if upd_res.data else {**app, **updates}

        _open_stage_history(
            application_id=app_id,
            from_stage=current_stage_key,
            to_stage=next_stage_key,
            action="advance",
            actor_id=actor.id,
            reason=remarks,
            entered_at=now,
        )

        # Create EVC visit if next stage calls for it
        if next_stage_def.get("creates") == "evc_visit":
            _create_evc_visit(app_id, app.get("region_id"), tmpl["code"], now)

        audit.record(
            actor=actor,
            action="application.advance",
            entity_type="application",
            entity_id=app_id,
            before={"current_stage": current_stage_key, "status": app["status"]},
            after={"current_stage": next_stage_key, "status": "in_progress"},
            reason=remarks,
        )

        if assigned_to:
            notifier.notify_user(
                assigned_to,
                f"Application {app['application_no']} advanced to {next_stage_def.get('label', next_stage_key)}",
                f"Please review and take action."
            )

        return updated

    def return_for_deficiency(self, app_id: str, actor: AuthenticatedUser, reason: str) -> dict:
        """Return the application to institution for deficiency response."""
        if not reason or not reason.strip():
            raise ValueError("A reason is required for returning an application")

        app = _fetch("applications", id=app_id)
        if not app:
            raise ValueError("Application not found")
        if actor.role not in OFFICER_ROLES:
            raise PermissionError("Only officers can return applications for deficiency")

        tmpl = _get_template(app["template_id"])
        definition = tmpl["definition"]
        stages = definition["stages"]
        current_stage_def = stages.get(app["current_stage"], {})
        return_stage_key = current_stage_def.get("on_return", "institution_response")

        if return_stage_key not in stages:
            raise ValueError(f"Return stage '{return_stage_key}' not found in template")

        return_stage_def = {**stages[return_stage_key], "key": return_stage_key}
        now = _now()

        _close_current_stage_history(app_id, now)

        due_at = _compute_due(return_stage_def, tmpl["code"], app.get("region_id"), now)

        updates = {
            "current_stage": return_stage_key,
            "status": "returned",
            "stage_entered_at": now.isoformat(),
            "due_at": due_at.isoformat(),
            "assigned_to": None,
        }
        upd_res = _supabase.table("applications").update(updates).eq("id", app_id).execute()
        updated = upd_res.data[0] if upd_res.data else {**app, **updates}

        _open_stage_history(
            application_id=app_id,
            from_stage=app["current_stage"],
            to_stage=return_stage_key,
            action="return",
            actor_id=actor.id,
            reason=reason,
            entered_at=now,
        )

        audit.record(
            actor=actor,
            action="application.return",
            entity_type="application",
            entity_id=app_id,
            before={"current_stage": app["current_stage"], "status": app["status"]},
            after={"current_stage": return_stage_key, "status": "returned"},
            reason=reason,
        )

        # Notify the institution
        inst_prof = _fetch("profiles", institution_id=app.get("institution_id"))
        if inst_prof:
            notifier.notify_user(
                inst_prof["user_id"],
                f"Application {app['application_no']} returned for deficiency",
                f"Reason: {reason}"
            )

        return updated

    def revert(self, app_id: str, actor: AuthenticatedUser, target_stage: str, reason: str) -> dict:
        """Revert to an earlier stage (regional_officer or bureau_officer only)."""
        if not reason or not reason.strip():
            raise ValueError("A reason is required for reverting an application")

        if actor.role not in ("regional_officer", "bureau_officer"):
            raise PermissionError("Only regional or bureau officers can revert applications")

        app = _fetch("applications", id=app_id)
        if not app:
            raise ValueError("Application not found")

        tmpl = _get_template(app["template_id"])
        definition = tmpl["definition"]
        stages = definition["stages"]

        if target_stage not in stages:
            raise ValueError(f"Target stage '{target_stage}' does not exist in this template")

        target_stage_def = {**stages[target_stage], "key": target_stage}
        now = _now()

        _close_current_stage_history(app_id, now)

        due_at = _compute_due(target_stage_def, tmpl["code"], app.get("region_id"), now)
        assigned_to = _auto_assign(app.get("region_id"), target_stage_def.get("owner_role", ""))

        updates = {
            "current_stage": target_stage,
            "status": "in_progress",
            "stage_entered_at": now.isoformat(),
            "due_at": due_at.isoformat(),
            "assigned_to": assigned_to,
        }
        upd_res = _supabase.table("applications").update(updates).eq("id", app_id).execute()
        updated = upd_res.data[0] if upd_res.data else {**app, **updates}

        _open_stage_history(
            application_id=app_id,
            from_stage=app["current_stage"],
            to_stage=target_stage,
            action="revert",
            actor_id=actor.id,
            reason=reason,
            entered_at=now,
        )

        audit.record(
            actor=actor,
            action="application.revert",
            entity_type="application",
            entity_id=app_id,
            before={"current_stage": app["current_stage"]},
            after={"current_stage": target_stage},
            reason=reason,
        )

        # Notify institution
        inst_prof = _fetch("profiles", institution_id=app.get("institution_id"))
        if inst_prof:
            notifier.notify_user(
                inst_prof["user_id"],
                f"Application {app['application_no']} reverted to {target_stage_def.get('label', target_stage)}",
                f"Reason: {reason}"
            )

        return updated

    def reassign(self, app_id: str, actor: AuthenticatedUser, new_assignee_id: str, reason: str) -> dict:
        """Change the officer assigned to the current stage."""
        if actor.role not in ("regional_officer", "bureau_officer"):
            raise PermissionError("Only regional or bureau officers can reassign applications")

        app = _fetch("applications", id=app_id)
        if not app:
            raise ValueError("Application not found")

        old_assignee = app.get("assigned_to")
        upd_res = _supabase.table("applications").update({"assigned_to": new_assignee_id}).eq("id", app_id).execute()
        updated = upd_res.data[0] if upd_res.data else {**app, "assigned_to": new_assignee_id}

        _open_stage_history(
            application_id=app_id,
            from_stage=app["current_stage"],
            to_stage=app["current_stage"],
            action="reassign",
            actor_id=actor.id,
            reason=reason,
            entered_at=_now(),
        )

        audit.record(
            actor=actor,
            action="application.reassign",
            entity_type="application",
            entity_id=app_id,
            before={"assigned_to": old_assignee},
            after={"assigned_to": new_assignee_id},
            reason=reason,
        )

        notifier.notify_user(
            new_assignee_id,
            f"Application {app['application_no']} has been assigned to you",
            f"Stage: {app['current_stage']}"
        )

        return updated


engine = WorkflowEngine()
