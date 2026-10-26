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
    alert_id: Optional[str] = None
) -> List[dict]:
    """Batch send in-app notifications to multiple users."""
    if not user_ids:
        return []
    results = []
    now_iso = clock.now().isoformat()
    rows = [
        {
            "user_id": uid,
            "alert_id": alert_id,
            "channel": "in_app",
            "title": title,
            "body": body,
            "status": "sent",
            "sent_at": now_iso,
        }
        for uid in set(user_ids)
    ]
    try:
        res = _supabase.table("notifications").insert(rows).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Batch notification failure: {e}")
        # Fall back to single sends
        for row in rows:
            try:
                r = _supabase.table("notifications").insert(row).execute()
                if r.data:
                    results.append(r.data[0])
            except Exception:
                pass
        return results
