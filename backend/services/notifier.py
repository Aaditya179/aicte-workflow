"""
Notification stub for Phase 2.
Full implementation (Resend email, Realtime) comes in Phase 3.
"""
from typing import Optional
from supabase import create_client
from core.config import settings
from datetime import datetime, timezone

_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def send_in_app(user_id: str, title: str, body: Optional[str] = None, alert_id: Optional[str] = None) -> None:
    """Insert an in-app notification. Realtime will push to the user's bell in Phase 3."""
    try:
        _supabase.table("notifications").insert({
            "user_id": user_id,
            "alert_id": alert_id,
            "channel": "in_app",
            "title": title,
            "body": body,
            "status": "sent",
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception:
        pass  # Non-blocking; full retry logic in Phase 3


def notify_user(user_id: str, title: str, body: Optional[str] = None) -> None:
    send_in_app(user_id, title, body)
