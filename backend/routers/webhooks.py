"""
Provider delivery webhooks (§15.5).

Resend and Twilio report delivery outcomes here. Each update moves the matching
`notifications` row (found by `provider_ref`) forward; a failure on a critical alert
triggers the fallback to the next channel. Signatures are verified when the provider
secret is configured.
"""
import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from supabase import create_client

from core import clock
from core.config import settings
from services import notifier

logger = logging.getLogger("aicte.webhooks")
router = APIRouter(prefix="/webhooks", tags=["Webhooks"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

# Delivery states only move forward; a late "sent" never overwrites "delivered"
_RANK = {"queued": 0, "sent": 1, "delivered": 2, "read": 3, "failed": 4}

RESEND_EVENTS = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.opened": "read",
    "email.clicked": "read",
    "email.bounced": "failed",
    "email.complained": "failed",
    "email.failed": "failed",
}
TWILIO_STATUSES = {
    "queued": "queued", "accepted": "queued", "sending": "sent", "sent": "sent",
    "delivered": "delivered", "read": "read", "undelivered": "failed", "failed": "failed",
}


def apply_delivery_update(provider_ref: str, new_status: str) -> Optional[Dict[str, Any]]:
    res = _supabase.table("notifications").select("*").eq("provider_ref", provider_ref).limit(1).execute()
    if not res.data:
        return None
    row = res.data[0]
    current = row.get("delivery_status") or "queued"
    if current in ("failed", "read") or _RANK.get(new_status, 0) <= _RANK.get(current, 0):
        return row
    now_iso = clock.now().isoformat()
    update: Dict[str, Any] = {"delivery_status": new_status}
    if new_status == "delivered":
        update["delivered_at"] = now_iso
    elif new_status == "read":
        update.update({"status": "read", "read_at": now_iso})
    elif new_status == "failed":
        update["status"] = "failed"
    updated = _supabase.table("notifications").update(update).eq("id", row["id"]).execute().data[0]
    if new_status == "failed":
        notifier.fallback_after_failure(updated)
    return updated


def _verify_svix(secret: str, headers, body: bytes) -> bool:
    msg_id, ts, sigs = headers.get("svix-id"), headers.get("svix-timestamp"), headers.get("svix-signature")
    if not (msg_id and ts and sigs):
        return False
    try:
        if abs(time.time() - int(ts)) > 300:
            return False
    except ValueError:
        return False
    key = base64.b64decode(secret.split("_", 1)[1] if secret.startswith("whsec_") else secret)
    expected = base64.b64encode(hmac.new(key, f"{msg_id}.{ts}.".encode() + body, hashlib.sha256).digest()).decode()
    return any(hmac.compare_digest(expected, s.split(",", 1)[-1]) for s in sigs.split())


def _verify_twilio(token: str, url: str, params: Dict[str, str], signature: Optional[str]) -> bool:
    if not signature:
        return False
    payload = url + "".join(k + params[k] for k in sorted(params))
    expected = base64.b64encode(hmac.new(token.encode(), payload.encode(), hashlib.sha1).digest()).decode()
    return hmac.compare_digest(expected, signature)


@router.post("/resend")
async def resend_webhook(request: Request):
    body = await request.body()
    if settings.RESEND_WEBHOOK_SECRET and not _verify_svix(settings.RESEND_WEBHOOK_SECRET, request.headers, body):
        raise HTTPException(status_code=401, detail="Invalid signature")
    try:
        event = json.loads(body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    status = RESEND_EVENTS.get(event.get("type"))
    email_id = (event.get("data") or {}).get("email_id")
    if not status or not email_id:
        return {"ok": True, "ignored": True}
    row = apply_delivery_update(email_id, status)
    return {"ok": True, "matched": row is not None}


@router.post("/twilio")
async def twilio_webhook(request: Request):
    form = await request.form()
    params = {k: str(v) for k, v in form.items()}
    if settings.TWILIO_AUTH_TOKEN:
        url = f"{settings.API_PUBLIC_URL}/api/v1/webhooks/twilio"
        if not _verify_twilio(settings.TWILIO_AUTH_TOKEN, url, params, request.headers.get("x-twilio-signature")):
            raise HTTPException(status_code=401, detail="Invalid signature")
    status = TWILIO_STATUSES.get(params.get("MessageStatus", ""))
    sid = params.get("MessageSid")
    if not status or not sid:
        return {"ok": True, "ignored": True}
    row = apply_delivery_update(sid, status)
    return {"ok": True, "matched": row is not None}
