from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, get_current_user, get_verified_user
from core import clock

router = APIRouter(prefix="/notifications", tags=["Notifications"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


@router.get("")
async def list_notifications(
    limit: int = Query(30, ge=1, le=100),
    user: AuthenticatedUser = Depends(get_verified_user)
):
    """List in-app notifications for the logged-in user, along with unread count."""
    res = _supabase.table("notifications").select("*") \
        .eq("user_id", str(user.id)) \
        .eq("channel", "in_app") \
        .order("created_at", desc=True) \
        .limit(limit).execute()

    items = res.data or []
    unread_count = len([n for n in items if n.get("status") != "read"])

    return {
        "items": items,
        "unread_count": unread_count
    }


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    user: AuthenticatedUser = Depends(get_verified_user)
):
    """Mark a notification as read."""
    now_iso = clock.now().isoformat()
    res = _supabase.table("notifications").update({
        "status": "read",
        "delivery_status": "read",
        "read_at": now_iso
    }).eq("id", notification_id).eq("user_id", str(user.id)).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Notification not found")
    return res.data[0]


@router.post("/read-all")
async def mark_all_as_read(user: AuthenticatedUser = Depends(get_verified_user)):
    """Mark all notifications as read for current user."""
    now_iso = clock.now().isoformat()
    res = _supabase.table("notifications").update({
        "status": "read",
        "delivery_status": "read",
        "read_at": now_iso
    }).eq("user_id", str(user.id)).eq("channel", "in_app").neq("status", "read").execute()

    return {"ok": True, "updated": len(res.data or [])}
