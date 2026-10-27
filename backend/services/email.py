"""
Email Service using Resend with Signed 1-Click Acknowledge Links and Daily Digests (Section 5.5, Phase 6).
"""
import hmac
import html as html_lib
import hashlib
import uuid
import logging
from typing import Optional, Dict, Any, List
import httpx

from core.config import settings
from core import clock

logger = logging.getLogger("aicte.email")


def generate_signed_ack_url(alert_id: str, user_id: str, expires_in_days: int = 7) -> str:
    """
    Generate an HMAC-SHA256 signed one-click acknowledge link (Section 5.5, 677).
    """
    exp = int(clock.now().timestamp()) + (expires_in_days * 86400)
    sig_payload = f"{alert_id}:{user_id}:{exp}"
    secret = settings.SUPABASE_JWT_SECRET or "aicte-secret-key-for-hmac-signatures"
    sig = hmac.new(secret.encode(), sig_payload.encode(), hashlib.sha256).hexdigest()

    # Link directs to the frontend acknowledge handler
    return f"{settings.FRONTEND_ORIGIN}/alerts/ack?alert_id={alert_id}&user_id={user_id}&exp={exp}&sig={sig}"


def verify_ack_signature(alert_id: str, user_id: str, exp: int, sig: str) -> bool:
    """Verify validity and expiration of HMAC-SHA256 signed acknowledge token."""
    now_ts = int(clock.now().timestamp())
    if exp < now_ts:
        logger.warning(f"Acknowledge signature expired: exp={exp}, now={now_ts}")
        return False

    sig_payload = f"{alert_id}:{user_id}:{exp}"
    secret = settings.SUPABASE_JWT_SECRET or "aicte-secret-key-for-hmac-signatures"
    expected_sig = hmac.new(secret.encode(), sig_payload.encode(), hashlib.sha256).hexdigest()

    return hmac.compare_digest(expected_sig, sig)


def is_configured() -> bool:
    key = settings.RESEND_API_KEY or ""
    return bool(key) and not key.startswith(("mock_", "dummy_", "re_dummy", "re_test"))


def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None
) -> Dict[str, Any]:
    """
    Send email via Resend, or a logged mock when the key is not configured.
    """
    if not is_configured():
        msg_id = f"mock-msg-{uuid.uuid4().hex[:12]}"
        logger.info(f"[MOCK RESEND] Sent to: {to_email} | Subject: {subject} | ID: {msg_id}")
        return {"id": msg_id, "status": "sent", "mode": "mock"}

    if settings.DEMO_EMAIL_REDIRECT and to_email.lower() != settings.DEMO_EMAIL_REDIRECT.lower():
        subject = f"[for {to_email}] {subject}"
        to_email = settings.DEMO_EMAIL_REDIRECT

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "from": "Nirikshan <onboarding@resend.dev>",
                "to": [to_email],
                "subject": subject,
                "html": html_content,
                "text": text_content or subject
            },
            timeout=10.0
        )
        if response.status_code in (200, 201):
            return response.json()
        else:
            logger.error(f"Resend API error {response.status_code}: {response.text}")
            return {"error": response.text, "status": "failed"}
    except Exception as e:
        logger.error(f"Failed to send email via Resend: {e}")
        return {"error": str(e), "status": "error"}


def notice_html(subject: str, body: str, link: str) -> str:
    """
    Alert email body. It carries only what the template rendered (reference number, alert type,
    signed link), never case details (§15.0).
    """
    subject = html_lib.escape(subject)
    body = html_lib.escape(body)
    link = html_lib.escape(link, quote=True)
    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; background:#FAF7F2; margin:0; padding:24px; color:#1C1917;">
      <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #E8E2D8; border-radius:12px; overflow:hidden;">
        <div style="background:#1C1917; color:#ffffff; padding:18px 24px; font-weight:700; letter-spacing:0.5px;">Nirikshan • AICTE Approval Workflow</div>
        <div style="padding:24px;">
          <h2 style="font-size:17px; margin:0 0 12px;">{subject}</h2>
          <p style="font-size:14px; line-height:1.6; margin:0 0 24px;">{body}</p>
          <a href="{link}" style="display:inline-block; padding:12px 22px; background:#0f766e; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; font-size:14px;">Acknowledge and open</a>
          <p style="font-size:12px; color:#5b6b82; margin:20px 0 0;">Details are visible only after you sign in. This link expires in 7 days.</p>
        </div>
        <div style="padding:14px 24px; border-top:1px solid #dfe5ee; font-size:11px; color:#5b6b82;">
          Advisory only. Decisions rest with the competent authority.
        </div>
      </div>
    </body>
    </html>
    """


def send_daily_digest(
    user_email: str,
    user_name: str,
    open_count: int,
    overdue_count: int,
    top_items: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Send daily governance digest summary email (Section 677).
    """
    subject = f"AICTE Daily SLA Digest: {open_count} Active Cases ({overdue_count} Overdue)"
    dashboard_url = f"{settings.FRONTEND_ORIGIN}/dashboard"

    items_html = ""
    for item in top_items[:5]:
        items_html += f"""
        <li style="margin-bottom: 8px; font-size: 13px;">
          <strong>{item.get('title') or item.get('application_no') or 'Case'}</strong>: {item.get('stage') or item.get('status') or ''}
          <span style="color: #ef4444; font-weight: 600;">{item.get('urgency') or ''}</span>
        </li>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 24px; color: #1e293b; }}
        .card {{ max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }}
        .header {{ background: #1e3a8a; padding: 20px; color: #ffffff; text-align: center; }}
        .content {{ padding: 24px; }}
        .kpi-row {{ display: flex; gap: 12px; margin: 20px 0; }}
        .kpi {{ flex: 1; padding: 12px; border-radius: 10px; background: #f1f5f9; text-align: center; }}
        .kpi-val {{ font-size: 24px; font-weight: 800; }}
        .btn {{ display: inline-block; padding: 12px 24px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 13px; }}
        .footer {{ padding: 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; text-align: center; color: #64748b; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h2 style="margin: 0; font-size: 18px;">AICTE Daily SLA Digest</h2>
          <p style="margin: 4px 0 0; font-size: 12px;">Good morning, {user_name}</p>
        </div>
        <div class="content">
          <p style="font-size: 14px; margin: 0;">Here is your morning overview of SLA governance and pending application queues.</p>
          
          <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
            <tr>
              <td style="width: 50%; padding: 12px; background: #eff6ff; border-radius: 10px 0 0 10px; text-align: center;">
                <div style="font-size: 26px; font-weight: 800; color: #1d4ed8;">{open_count}</div>
                <div style="font-size: 11px; color: #1e40af; font-weight: 600;">ACTIVE CASES</div>
              </td>
              <td style="width: 50%; padding: 12px; background: #fef2f2; border-radius: 0 10px 10px 0; text-align: center;">
                <div style="font-size: 26px; font-weight: 800; color: #dc2626;">{overdue_count}</div>
                <div style="font-size: 11px; color: #b91c1c; font-weight: 600;">OVERDUE SLA</div>
              </td>
            </tr>
          </table>

          <h4 style="font-size: 13px; margin: 16px 0 8px;">Priority Items Requiring Action:</h4>
          <ul style="padding-left: 20px; margin: 0 0 24px;">
            {items_html or '<li>No critical SLA breaches currently active.</li>'}
          </ul>

          <div style="text-align: center;">
            <a href="{dashboard_url}" class="btn">Open Portal Dashboard</a>
          </div>
        </div>
        <div class="footer">
          Advisory only, final decisions rest with the competent authority.
        </div>
      </div>
    </body>
    </html>
    """

    return send_email(to_email=user_email, subject=subject, html_content=html)
