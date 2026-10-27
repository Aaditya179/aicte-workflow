"""
Notifier Service (Section 5.5).
Inserts in-app notifications and manages multi-channel dispatch.
Realtime pushes in-app notifications directly to the frontend AlertBell.
"""
from typing import Optional, List, Union
from supabase import create_client
from core.config import settings
from core import clock
import logging

logger = logging.getLogger("aicte.notifier")
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def send_in_app(
    user_id: str,
    title: str,
    body: Optional[str] = None,
    alert_id: Optional[str] = None
) -> Optional[dict]:
    """Insert an in-app notification for a specific user."""
    try:
        now_iso = clock.now().isoformat()
        payload = {
            "user_id": user_id,
            "alert_id": alert_id,
            "channel": "in_app",
            "title": title,
            "body": body,
            "status": "sent",
            "sent_at": now_iso,
        }
        res = _supabase.table("notifications").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Failed to send in-app notification to {user_id}: {e}")
        return None


def notify_user(
    user_id: str,
    title: str,
    body: Optional[str] = None,
    alert_id: Optional[str] = None
) -> Optional[dict]:
    """Convenience alias for sending notifications."""
    return send_in_app(user_id, title, body, alert_id)


def notify_users(
    user_ids: List[str],
    title: str,
    body: Optional[str] = None,
    alert_id: Optional[str] = None,
    severity: Optional[str] = None
) -> List[dict]:
    """
    Batch send notifications to multiple users.
    1. Inserts in-app notification for each user.
    2. Sends email via Resend with signed 1-click acknowledge link for warning & critical alerts (Section 5.5).
    """
    if not user_ids:
        return []
    results = []
    now_iso = clock.now().isoformat()
    unique_uids = list(set(user_ids))

    # In-app rows
    in_app_rows = [
        {
            "user_id": uid,
            "alert_id": alert_id,
            "channel": "in_app",
            "title": title,
            "body": body,
            "status": "sent",
            "sent_at": now_iso,
        }
        for uid in unique_uids
    ]
    try:
        res = _supabase.table("notifications").insert(in_app_rows).execute()
        results.extend(res.data or [])
    except Exception as e:
        logger.error(f"Batch in-app notification failure: {e}")
        for row in in_app_rows:
            try:
                r = _supabase.table("notifications").insert(row).execute()
                if r.data:
                    results.append(r.data[0])
            except Exception:
                pass

    # Email dispatch for warning and critical alerts (Section 5.5, Phase 6)
    if alert_id and severity in ("warning", "critical"):
        try:
            from services import email as email_service
            # Fetch profile emails
            prof_res = _supabase.table("profiles").select("user_id, email, full_name").in_("user_id", unique_uids).execute()
            for prof in (prof_res.data or []):
                user_email = prof.get("email")
                uid = prof.get("user_id")
                if user_email and uid:
                    email_service.send_alert_email(
                        user_email=user_email,
                        user_id=uid,
                        alert_id=alert_id,
                        severity=severity,
                        title=title,
                        message=body or title
                    )
                    # Record email notification entry
                    _supabase.table("notifications").insert({
                        "user_id": uid,
                        "alert_id": alert_id,
                        "channel": "email",
                        "title": title,
                        "body": body,
                        "status": "sent",
                        "sent_at": now_iso
                    }).execute()
        except Exception as e:
            logger.error(f"Failed to dispatch alert emails: {e}")

    return results
