"""
Maker-checker (§15.2).

Changes to templates, SLA rules and escalation chains are requests that a second administrator
applies. When the `maker_checker_for_overrides` setting is on, case reverts and assurance-flag
overrides are routed the same way, approved by a bureau officer. The requester can never approve
their own request.
"""
from typing import Any, Dict, Optional
import json
import logging

from supabase import create_client

from core import clock
from core.config import settings
from core.security import AuthenticatedUser
from services import audit

logger = logging.getLogger("aicte.approvals")
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

RULE_TABLES = {"sla_rules", "escalation_chains", "workflow_templates"}
# Who may approve each kind of request
APPROVER_ROLES = {
    "rule_change": {"admin"},
    "revert": {"bureau_officer"},
    "assurance_override": {"bureau_officer"},
}


class ApprovalError(ValueError):
    pass


def get_setting(key: str, default: Any = None) -> Any:
    res = _supabase.table("system_settings").select("value").eq("key", key).limit(1).execute()
    return res.data[0]["value"] if res.data else default


def set_setting(key: str, value: Any) -> None:
    _supabase.table("system_settings").upsert({"key": key, "value": value}).execute()


def overrides_need_approval() -> bool:
    return bool(get_setting("maker_checker_for_overrides", False))


def create_request(
    kind: str,
    entity_type: Optional[str],
    entity_id: Optional[str],
    payload: Dict[str, Any],
    requester: AuthenticatedUser,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    row = _supabase.table("approval_requests").insert({
        "kind": kind,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "payload": json.loads(json.dumps(payload, default=str)),
        "requested_by": requester.id,
        "status": "pending",
        "reason": reason,
        "created_at": clock.now().isoformat(),
    }).execute().data[0]
    audit.record(
        actor=requester,
        action="APPROVAL_REQUESTED",
        entity_type="approval_request",
        entity_id=row["id"],
        before=None,
        after={"kind": kind, "entity_type": entity_type, "entity_id": entity_id, "payload": payload},
        reason=reason,
    )
    return row


def _requester(user_id: str) -> AuthenticatedUser:
    prof = _supabase.table("profiles").select("*").eq("user_id", user_id).limit(1).execute().data
    p = prof[0] if prof else {}
    return AuthenticatedUser(
        id=user_id, role=p.get("role") or "unknown", region_id=p.get("region_id"),
        institution_id=p.get("institution_id"), full_name=p.get("full_name"),
    )


def save_config_row(table: str, row: Dict[str, Any], actor: AuthenticatedUser, reason: str) -> Dict[str, Any]:
    """Apply an approved configuration change: update the row when it has an id, otherwise insert."""
    if table not in RULE_TABLES:
        raise ApprovalError(f"{table} is not a rule table")
    row = dict(row)
    row_id = row.pop("id", None)
    before = None
    if row_id:
        existing = _supabase.table(table).select("*").eq("id", row_id).limit(1).execute().data
        if not existing:
            raise ApprovalError(f"{table} row {row_id} no longer exists")
        before = existing[0]
        if table == "workflow_templates":
            row["version"] = (before.get("version") or 1) + 1
        saved = _supabase.table(table).update(row).eq("id", row_id).execute().data
    else:
        saved = _supabase.table(table).insert(row).execute().data
    if not saved:
        raise ApprovalError(f"Failed to save {table} row")
    audit.record(
        actor=actor,
        action="RULE_CHANGE_APPLIED",
        entity_type=table,
        entity_id=saved[0]["id"],
        before=before,
        after=saved[0],
        reason=reason,
    )
    return saved[0]


async def _apply(request: Dict[str, Any], approver: AuthenticatedUser) -> Any:
    payload = request.get("payload") or {}
    reason = f"Approved request {request['id']} by {approver.full_name or approver.id}"
    if request["kind"] == "rule_change":
        return save_config_row(payload["table"], payload["row"], approver, reason)
    requester = _requester(request["requested_by"])
    if request["kind"] == "revert":
        from services.workflow_engine import engine
        return engine.revert(request["entity_id"], requester, payload["target_stage"], payload["reason"])
    if request["kind"] == "assurance_override":
        from services.assurance import assurance_service
        return await assurance_service.override_flag(
            request["entity_id"], requester.id, payload["reason"], actor=requester, approved=True
        )
    raise ApprovalError(f"Unknown request kind {request['kind']}")


async def decide(request_id: str, approver: AuthenticatedUser, approve: bool, reason: Optional[str]) -> Dict[str, Any]:
    res = _supabase.table("approval_requests").select("*").eq("id", request_id).limit(1).execute().data
    if not res:
        raise ApprovalError("Approval request not found")
    request = res[0]
    if request["status"] != "pending":
        raise ApprovalError(f"Request is already {request['status']}")
    if str(request["requested_by"]) == str(approver.id):
        raise PermissionError("A request must be approved by someone other than the person who made it")
    if approver.role not in APPROVER_ROLES.get(request["kind"], set()):
        raise PermissionError(f"Role {approver.role} cannot decide {request['kind']} requests")
    if not approve and not (reason or "").strip():
        raise ApprovalError("A reason is required to reject a request")

    applied = None
    if approve:
        applied = await _apply(request, approver)
    elif request["kind"] == "assurance_override":
        # The flag goes back to the officer for a fresh response
        _supabase.table("assurance_flags").update({"status": "open"}).eq("id", request["entity_id"]).execute()

    updated = _supabase.table("approval_requests").update({
        "status": "approved" if approve else "rejected",
        "approved_by": approver.id,
        "decided_at": clock.now().isoformat(),
        "reason": reason or request.get("reason"),
    }).eq("id", request_id).execute().data[0]
    audit.record(
        actor=approver,
        action="APPROVAL_APPROVED" if approve else "APPROVAL_REJECTED",
        entity_type="approval_request",
        entity_id=request_id,
        before={"status": "pending"},
        after={"status": updated["status"], "kind": request["kind"]},
        reason=reason,
    )
    return {"request": updated, "applied": applied}
