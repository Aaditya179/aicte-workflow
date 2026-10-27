import hashlib
import json
from typing import Any, Optional
from datetime import datetime, timezone
from supabase import create_client
from core.config import settings
from core.security import AuthenticatedUser

_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def canonical(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _get_prev_hash() -> str:
    res = _supabase.table("audit_log").select("hash").order("seq", desc=True).limit(1).execute()
    if res.data and len(res.data) > 0:
        return res.data[0]["hash"]
    return "GENESIS"


def record(
    actor: AuthenticatedUser,
    action: str,
    entity_type: str,
    entity_id: str,
    before: Optional[Any],
    after: Optional[Any],
    reason: Optional[str] = None,
    ip: Optional[str] = None,
) -> dict:
    """
    Append an entry to the cryptographically chained audit log.
    Each entry's hash is SHA-256 of (prev_hash || canonical(payload)).
    """
    prev_hash = _get_prev_hash()

    payload = canonical({
        "actor": str(actor.id),
        "role": actor.role,
        "action": action,
        "entity": [entity_type, str(entity_id)],
        "before": before,
        "after": after,
        "reason": reason,
    })

    h = hashlib.sha256((prev_hash + payload).encode()).hexdigest()

    entry = {
        "actor_id": actor.id,
        "actor_role": actor.role,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "before": json.dumps(before, default=str) if before is not None else None,
        "after": json.dumps(after, default=str) if after is not None else None,
        "reason": reason,
        "ip": ip,
        "prev_hash": prev_hash,
        "hash": h,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    res = _supabase.table("audit_log").insert(entry).execute()
    if res.data:
        return res.data[0]
    return entry


def verify_chain() -> dict:
    """
    Walk the audit log in sequence order and recompute each hash.
    Returns {ok: True} or {ok: False, broken_at_seq: N, expected: ..., found: ...}
    """
    res = _supabase.table("audit_log").select("*").order("seq", desc=False).execute()
    rows = res.data or []

    if not rows:
        return {"ok": True, "entries_verified": 0}

    prev_hash = "GENESIS"
    for row in rows:
        # Recompute hash (handling entity_id None serialization)
        raw_ent_id = row.get("entity_id")
        ent_id = str(raw_ent_id) if raw_ent_id is not None else None

        before_obj = json.loads(row["before"]) if isinstance(row.get("before"), str) else row.get("before")
        after_obj = json.loads(row["after"]) if isinstance(row.get("after"), str) else row.get("after")

        payload = canonical({
            "actor": row.get("actor_id"),
            "role": row.get("actor_role"),
            "action": row.get("action"),
            "entity": [row.get("entity_type"), ent_id],
            "before": before_obj,
            "after": after_obj,
            "reason": row.get("reason"),
        })
        expected = hashlib.sha256((prev_hash + payload).encode()).hexdigest()
        found = row["hash"]

        if expected != found and ent_id is None:
            # Fallback for rows where str(None) -> "None" was hashed
            alt_payload = canonical({
                "actor": row.get("actor_id"),
                "role": row.get("actor_role"),
                "action": row.get("action"),
                "entity": [row.get("entity_type"), "None"],
                "before": before_obj,
                "after": after_obj,
                "reason": row.get("reason"),
            })
            alt_expected = hashlib.sha256((prev_hash + alt_payload).encode()).hexdigest()
            if alt_expected == found:
                expected = found

        if expected != found:
            return {
                "ok": False,
                "broken_at_seq": row["seq"],
                "expected": expected,
                "found": found,
                "message": f"Hash mismatch at seq {row['seq']}"
            }
        prev_hash = found

    return {"ok": True, "entries_verified": len(rows)}
