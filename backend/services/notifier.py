"""
Notifier Service (Section 5.5, 15.5).

One `notifications` row per recipient per channel. In-app rows carry the full alert text, since
they are only readable inside the authenticated app. Email, SMS and WhatsApp carry only a
reference number, the alert type and a signed link (§15.0), rendered from `message_templates`
in the recipient's locale. Email goes through Resend and SMS/WhatsApp through Twilio; an
unconfigured provider is simulated (logged, `provider_ref` prefixed `simulated:`) so the demo works.
A failed delivery on a critical alert falls back to the next channel.
"""
from concurrent.futures import Future, ThreadPoolExecutor, wait
from typing import Optional, List, Dict, Any
import logging
import re
import time
import uuid

import httpx
from supabase import create_client

from core.config import settings
from core import clock

logger = logging.getLogger("aicte.notifier")
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

# Fallback order when a critical delivery fails
CHANNEL_ORDER = ["in_app", "email", "sms", "whatsapp"]
DEFAULT_CHANNELS = {"info": ["in_app"], "warning": ["in_app", "email"], "critical": ["in_app", "email"]}

# Alert kind to message template code (§15.7)
KIND_TEMPLATE = {
    "upcoming": "deadline_reminder",
    "overdue": "deadline_reminder",
    "escalation": "escalation_notice",
    "expiry": "renewal_request",
}

# Used when no message_templates row matches; same placeholders as the seeded rows
_FALLBACK_TEMPLATES = {
    "en": {
        "subject": "Nirikshan {{alert_type}}: {{reference_no}}",
        "body": "Nirikshan {{alert_type}} for reference {{reference_no}}. Sign in to view details: {{link}}",
    },
    "hi": {
        "subject": "Nirikshan {{alert_type}}: {{reference_no}}",
        "body": "Nirikshan: संदर्भ {{reference_no}} के लिए {{alert_type}}। विवरण देखने के लिए साइन इन करें: {{link}}",
    },
}

ALERT_TYPE_LABELS = {
    "en": {"upcoming": "deadline reminder", "overdue": "overdue notice", "escalation": "escalation notice", "expiry": "expiry notice"},
    "hi": {"upcoming": "समय-सीमा अनुस्मारक", "overdue": "विलंब सूचना", "escalation": "एस्केलेशन सूचना", "expiry": "समाप्ति सूचना"},
}


class DeliveryError(Exception):
    pass


_EMAIL_CACHE: Dict[str, str] = {}
_TEMPLATE_CACHE: Dict[tuple, tuple] = {}
TEMPLATE_CACHE_SECONDS = 300

# External channels are slow (one provider call each, and Resend allows about 2 requests a second),
# so they go out from a small worker pool and a scheduler run is not held up by them.
_delivery_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="delivery")


def _get_user_email(user_id: str) -> Optional[str]:
    if user_id in _EMAIL_CACHE:
        return _EMAIL_CACHE[user_id]
    try:
        res = with_retry(lambda: _supabase.auth.admin.get_user_by_id(user_id))
        email = res.user.email if res and res.user else None
    except Exception as e:
        logger.warning(f"Could not look up email for {user_id}: {e}")
        return None
    if email:
        _EMAIL_CACHE[user_id] = email
    return email


def _profiles(user_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not user_ids:
        return {}
    rows = with_retry(lambda: _supabase.table("profiles").select("user_id, phone, locale")
                      .in_("user_id", user_ids).execute()).data or []
    return {r["user_id"]: r for r in rows}


def render(template: str, values: Dict[str, Any]) -> str:
    """Fill {{placeholders}}; unknown placeholders are left empty."""
    return re.sub(r"\{\{\s*(\w+)\s*\}\}", lambda m: str(values.get(m.group(1), "")), template or "")


def get_template(code: str, channel: str, locale: str) -> Dict[str, str]:
    """The template for this code, channel and locale, falling back to email, then English."""
    key = (code, channel, locale)
    cached = _TEMPLATE_CACHE.get(key)
    if cached and time.monotonic() - cached[0] < TEMPLATE_CACHE_SECONDS:
        return cached[1]
    result = _FALLBACK_TEMPLATES.get(locale, _FALLBACK_TEMPLATES["en"])
    for ch, loc in ((channel, locale), ("email", locale), (channel, "en"), ("email", "en")):
        try:
            res = with_retry(lambda: _supabase.table("message_templates").select("subject, body")
                             .eq("code", code).eq("channel", ch).eq("locale", loc).limit(1).execute())
            if res.data:
                result = res.data[0]
                break
        except Exception as e:
            logger.warning(f"message_templates lookup failed: {e}")
            break
    _TEMPLATE_CACHE[key] = (time.monotonic(), result)
    return result


def _simulated(channel: str, to: str, subject: Optional[str], body: str) -> Dict[str, Any]:
    ref = f"simulated:{uuid.uuid4().hex[:12]}"
    logger.info(f"[SIMULATED {channel.upper()}] to={to} subject={subject!r} ref={ref} body={body!r}")
    return {"provider_ref": ref, "delivery_status": "delivered"}


def _twilio_configured(channel: str) -> bool:
    sender = settings.TWILIO_WHATSAPP_FROM if channel == "whatsapp" else settings.TWILIO_SMS_FROM
    return bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and sender)


def _send_twilio(channel: str, phone: str, body: str) -> Dict[str, Any]:
    if channel == "whatsapp":
        sender, to = f"whatsapp:{settings.TWILIO_WHATSAPP_FROM}", f"whatsapp:{phone}"
    else:
        sender, to = settings.TWILIO_SMS_FROM, phone
    resp = httpx.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json",
        auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
        data={"From": sender, "To": to, "Body": body,
              "StatusCallback": f"{settings.API_PUBLIC_URL}/api/v1/webhooks/twilio"},
        timeout=10.0,
    )
    if resp.status_code not in (200, 201):
        raise DeliveryError(f"Twilio {resp.status_code}: {resp.text[:200]}")
    return {"provider_ref": resp.json().get("sid"), "delivery_status": "sent"}


def send_channel(channel: str, recipient: Dict[str, Any], subject: Optional[str], body: str, link: str) -> Dict[str, Any]:
    """Deliver one message on one external channel. Raises DeliveryError on failure."""
    if channel == "email":
        if not recipient.get("email"):
            raise DeliveryError("Recipient has no email address")
        from services import email as email_service
        if not email_service.is_configured():
            return _simulated(channel, recipient["email"], subject, body)
        result = email_service.send_email(
            to_email=recipient["email"], subject=subject or "Nirikshan notice",
            html_content=email_service.notice_html(subject or "", body, link), text_content=body,
        )
        if result.get("status") in ("failed", "error") or not result.get("id"):
            raise DeliveryError(str(result.get("error") or "Resend rejected the message"))
        return {"provider_ref": result["id"], "delivery_status": "sent"}
    if channel in ("sms", "whatsapp"):
        if not recipient.get("phone"):
            raise DeliveryError("Recipient has no phone number")
        if not _twilio_configured(channel):
            return _simulated(channel, recipient["phone"], None, body)
        return _send_twilio(channel, recipient["phone"], body)
    raise DeliveryError(f"Unknown channel {channel}")


def with_retry(fn, attempts: int = 3):
    """Run a Supabase call, retrying dropped connections (seen when the scheduler runs checks in parallel)."""
    for i in range(attempts):
        try:
            return fn()
        except httpx.TransportError:
            if i == attempts - 1:
                raise
            time.sleep(0.2 * (i + 1))


def _insert(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        res = with_retry(lambda: _supabase.table("notifications").insert(row).execute())
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Failed to insert notification: {e}")
        return None


def _deliver_external(
    notification: Dict[str, Any],
    recipient: Dict[str, Any],
    subject: Optional[str],
    body: str,
    link: str,
) -> Dict[str, Any]:
    """Send a queued external notification and record the provider outcome on its row."""
    now_iso = clock.now().isoformat()
    try:
        outcome = send_channel(notification["channel"], recipient, subject, body, link)
        update = {
            "status": "sent",
            "sent_at": now_iso,
            "delivery_status": outcome["delivery_status"],
            "provider_ref": outcome.get("provider_ref"),
        }
        if outcome["delivery_status"] == "delivered":
            update["delivered_at"] = now_iso
    except Exception as e:
        logger.warning(f"{notification['channel']} delivery to {recipient['user_id']} failed: {e}")
        update = {"status": "failed", "delivery_status": "failed", "provider_ref": f"error:{str(e)[:120]}"}
    res = with_retry(lambda: _supabase.table("notifications").update(update).eq("id", notification["id"]).execute())
    return res.data[0] if res.data else {**notification, **update}


def _external_message(kind: Optional[str], channel: str, locale: str, reference_no: str, link: str, due_date: str) -> Dict[str, str]:
    code = KIND_TEMPLATE.get(kind or "", "deadline_reminder")
    tmpl = get_template(code, channel, locale)
    labels = ALERT_TYPE_LABELS.get(locale, ALERT_TYPE_LABELS["en"])
    values = {
        "reference_no": reference_no,
        "alert_type": labels.get(kind or "", labels["overdue"]),
        "link": link,
        "due_date": due_date,
    }
    return {"subject": render(tmpl.get("subject") or "", values), "body": render(tmpl["body"], values)}


def fallback_channel(failed: str, used: List[str]) -> Optional[str]:
    """The next channel after `failed` in CHANNEL_ORDER that this alert has not used yet."""
    if failed not in CHANNEL_ORDER:
        return None
    for ch in CHANNEL_ORDER[CHANNEL_ORDER.index(failed) + 1:]:
        if ch not in used:
            return ch
    return None


def dispatch_alert(
    user_ids: List[str],
    title: str,
    body: Optional[str],
    alert_id: str,
    severity: str,
    channels: Optional[List[str]] = None,
    kind: Optional[str] = None,
    reference_no: Optional[str] = None,
    due_date: Optional[str] = None,
    wait: bool = True,
) -> List[Dict[str, Any]]:
    """
    Notify each recipient on every channel of the escalation level (§15.5). External channels
    send only safe content. A failed delivery on a critical alert moves to the next channel.

    In-app rows are written straight away, so the bell and realtime update at once. With
    wait=False (the scheduler), email, SMS and WhatsApp go out from the delivery pool and only
    the in-app rows are returned; the delivery page shows the rest as they complete.
    """
    from services import email as email_service

    channels = [c for c in (channels or DEFAULT_CHANNELS.get(severity, ["in_app"])) if c in CHANNEL_ORDER]
    if "in_app" not in channels:
        channels.insert(0, "in_app")
    external = [c for c in channels if c != "in_app"]
    unique_uids = list(dict.fromkeys(user_ids))
    profiles = _profiles(unique_uids)
    now_iso = clock.now().isoformat()
    reference_no = reference_no or f"ALR-{alert_id[:8].upper()}"
    results: List[Dict[str, Any]] = []

    for uid in unique_uids:
        prof = profiles.get(uid, {})
        row = _insert({
            "user_id": uid, "alert_id": alert_id, "channel": "in_app", "title": title, "body": body,
            "status": "sent", "sent_at": now_iso, "delivery_status": "delivered", "delivered_at": now_iso,
        })
        if not row:
            continue  # unknown recipient: no profile, so no external delivery either
        results.append(row)
        if not external:
            continue
        job = dict(uid=uid, prof=prof, channels=external, title=title, alert_id=alert_id, severity=severity,
                   kind=kind, reference_no=reference_no, due_date=due_date or "",
                   link=email_service.generate_signed_ack_url(alert_id, uid))
        if wait:
            results.extend(_deliver_externals(**job))
        else:
            _pending.append(_delivery_pool.submit(_deliver_externals, **job))
    return results


_pending: List[Future] = []


def drain(timeout: Optional[float] = None) -> None:
    """Wait for queued external deliveries (tests, and graceful shutdown)."""
    futures, _pending[:] = list(_pending), []
    wait(futures, timeout=timeout)


def _deliver_externals(
    uid: str, prof: Dict[str, Any], channels: List[str], title: str, alert_id: str, severity: str,
    kind: Optional[str], reference_no: str, due_date: str, link: str,
) -> List[Dict[str, Any]]:
    """External channels for one recipient, with fallback to the next channel on a critical failure."""
    locale = prof.get("locale") or "en"
    recipient = {"user_id": uid, "phone": prof.get("phone"), "email": None}
    results: List[Dict[str, Any]] = []
    used: List[str] = ["in_app"]
    queue = list(channels)
    try:
        while queue:
            channel = queue.pop(0)
            if channel in used:
                continue
            used.append(channel)
            if channel == "email" and recipient["email"] is None:
                recipient["email"] = _get_user_email(uid) or ""
            msg = _external_message(kind, channel, locale, reference_no, link, due_date)
            row = _insert({
                "user_id": uid, "alert_id": alert_id, "channel": channel, "title": msg["subject"] or title,
                "body": msg["body"], "status": "queued", "delivery_status": "queued",
            })
            if not row:
                continue
            row = _deliver_external(row, recipient, msg["subject"], msg["body"], link)
            results.append(row)
            if row.get("delivery_status") == "failed" and severity == "critical":
                nxt = fallback_channel(channel, used + queue)
                if nxt:
                    logger.info(f"Critical alert {alert_id}: {channel} failed for {uid}, falling back to {nxt}")
                    queue.insert(0, nxt)
    except Exception as e:
        logger.error(f"External delivery for alert {alert_id} to {uid} failed: {e}")
    return results


def fallback_after_failure(notification: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    A provider webhook reported a failure after sending. For a critical alert, deliver on the next
    channel not yet used for that recipient.
    """
    alert_id = notification.get("alert_id")
    if not alert_id:
        return None
    alert = _supabase.table("alerts").select("*").eq("id", alert_id).limit(1).execute().data
    if not alert or alert[0].get("severity") != "critical":
        return None
    used = [n["channel"] for n in (_supabase.table("notifications").select("channel")
            .eq("alert_id", alert_id).eq("user_id", notification["user_id"]).execute().data or [])]
    nxt = fallback_channel(notification["channel"], used)
    if not nxt:
        return None
    rows = dispatch_alert(
        [notification["user_id"]], notification.get("title") or "Alert", alert[0].get("message"), alert_id,
        "critical", channels=[nxt], kind=alert[0].get("kind"),
    )
    # dispatch_alert always adds in_app; drop the duplicate in-app row it made
    for r in rows:
        if r["channel"] == "in_app" and "in_app" in used:
            _supabase.table("notifications").delete().eq("id", r["id"]).execute()
    return next((r for r in rows if r["channel"] == nxt), None)


def send_in_app(
    user_id: str,
    title: str,
    body: Optional[str] = None,
    alert_id: Optional[str] = None
) -> Optional[dict]:
    """Insert an in-app notification for a specific user."""
    now_iso = clock.now().isoformat()
    return _insert({
        "user_id": user_id,
        "alert_id": alert_id,
        "channel": "in_app",
        "title": title,
        "body": body,
        "status": "sent",
        "sent_at": now_iso,
        "delivery_status": "delivered",
        "delivered_at": now_iso,
    })


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
    severity: Optional[str] = None,
    channels: Optional[List[str]] = None,
    kind: Optional[str] = None,
    reference_no: Optional[str] = None,
    due_date: Optional[str] = None,
    wait: bool = True,
) -> List[dict]:
    """
    Notify several users. Alerts go out on their channels through dispatch_alert; plain
    notifications (workflow events) are in-app only.
    """
    if not user_ids:
        return []
    if alert_id:
        return dispatch_alert(
            user_ids, title, body, alert_id, severity or "info",
            channels=channels, kind=kind, reference_no=reference_no, due_date=due_date, wait=wait,
        )
    results = []
    for uid in dict.fromkeys(user_ids):
        row = send_in_app(uid, title, body)
        if row:
            results.append(row)
    return results
