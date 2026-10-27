"""
Email Service using Resend with Signed 1-Click Acknowledge Links and Daily Digests (Section 5.5, Phase 6).
"""
import hmac
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


def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None
) -> Dict[str, Any]:
    """
    Send email via Resend API or mock fallback when key is not configured.
    """
    api_key = settings.RESEND_API_KEY

    # If no key configured or running in test/mock mode
    if not api_key or api_key.startswith("mock_") or api_key.startswith("dummy_") or api_key.startswith("re_dummy") or api_key.startswith("re_test"):
        msg_id = f"mock-msg-{uuid.uuid4().hex[:12]}"
        logger.info(f"[MOCK RESEND] Sent to: {to_email} | Subject: {subject} | ID: {msg_id}")
        return {"id": msg_id, "status": "sent", "mode": "mock"}

    try:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "from": "AICTE SLA Monitor <onboarding@resend.dev>",
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


def send_alert_email(
    user_email: str,
    user_id: str,
    alert_id: str,
    severity: str,
    title: str,
    message: str
) -> Dict[str, Any]:
    """
    Send an official alert email with a signed one-click acknowledge button.
    """
    ack_url = generate_signed_ack_url(alert_id, user_id)
    subject = f"[{severity.upper()}] AICTE SLA Alert: {title}"

    badge_color = "#dc2626" if severity == "critical" else "#d97706"
    badge_text = "CRITICAL ESCALATION" if severity == "critical" else "WARNING - SLA BREACH"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
        .card {{ max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
        .header {{ background: #1e3a8a; padding: 24px; text-align: center; color: #ffffff; }}
        .header h1 {{ margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.025em; }}
        .header p {{ margin: 4px 0 0; font-size: 12px; opacity: 0.85; }}
        .content {{ padding: 32px 24px; }}
        .badge {{ display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; color: #ffffff; background-color: {badge_color}; text-transform: uppercase; margin-bottom: 16px; }}
        .title {{ font-size: 18px; font-weight: 700; margin: 0 0 12px; color: #0f172a; }}
        .message {{ font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px; background: #f1f5f9; padding: 16px; border-radius: 12px; border-left: 4px solid {badge_color}; }}
        .btn-wrapper {{ text-align: center; margin: 32px 0 24px; }}
        .btn {{ display: inline-block; padding: 14px 28px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; border-radius: 12px; box-shadow: 0 2px 4px rgba(37,99,235,0.2); }}
        .footer {{ padding: 20px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #64748b; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>AICTE National Workflow & SLA Monitoring Engine</h1>
          <p>Official Statutory Governance Notification</p>
        </div>
        <div class="content">
          <span class="badge">{badge_text}</span>
          <h2 class="title">{title}</h2>
          <div class="message">{message}</div>
          
          <div class="btn-wrapper">
            <a href="{ack_url}" class="btn">Acknowledge Alert (1-Click)</a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
            Clicking this button cryptographically acknowledges the alert and halts further automatic escalation tiers.
          </p>
        </div>
        <div class="footer">
          Notice: Advisory only, final decisions rest with the competent authority.<br>
          AICTE Approval Process Handbook (APH) 2024–2027 SLA Protocol.
        </div>
      </div>
    </body>
    </html>
    """

    return send_email(to_email=user_email, subject=subject, html_content=html)


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
