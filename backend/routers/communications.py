"""
Standardised communications (§15.7).

Officers pick a message template, see it filled for the application, edit the text and send it
to the institution. Every send is stored in `communications` and audited. External channels
still carry only the template text the officer saw; the LLM can polish a draft (/ai/polish)
but never sends anything.
"""
from datetime import timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from supabase import create_client

from core import clock
from core.config import settings
from core.security import AuthenticatedUser, require_case_access, require_role
from routers.applications import _get_scoped_app
from services import audit as audit_service
from services import notifier

router = APIRouter(prefix="/communications", tags=["Communications"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

SENDER_ROLES = ["scrutiny_officer", "regional_officer", "bureau_officer"]
TEMPLATE_CODES = ("acknowledgement", "deficiency_letter", "deadline_reminder", "escalation_notice",
                  "renewal_request", "undertaking_notice")


class PreviewRequest(BaseModel):
    application_id: str
    template_code: str = Field(..., pattern="^(" + "|".join(TEMPLATE_CODES) + ")$")
    locale: str = Field("en", pattern="^(en|hi)$")
    channel: str = Field("email", pattern="^(email|in_app)$")


class SendRequest(PreviewRequest):
    subject: Optional[str] = Field(None, max_length=300)
    body: str = Field(..., min_length=1, max_length=8000)


def _placeholders(app: Dict[str, Any], user: AuthenticatedUser) -> Dict[str, Any]:
    inst = _supabase.table("institutions").select("name").eq("id", app["institution_id"]).limit(1).execute().data
    due = app.get("due_at")
    return {
        "reference_no": app["application_no"],
        "application_no": app["application_no"],
        "institution_name": inst[0]["name"] if inst else "",
        "stage": app.get("current_stage", ""),
        "due_date": clock.display_date(due if due else clock.now() + timedelta(days=15)),
        "officer_name": user.full_name or "",
        "link": f"{settings.FRONTEND_ORIGIN}/applications/{app['id']}",
        "today": clock.display_date(clock.now()),
    }


@router.get("/templates")
async def list_templates(
    locale: Optional[str] = Query(None, pattern="^(en|hi)$"),
    user: AuthenticatedUser = Depends(require_role(SENDER_ROLES)),
):
    q = _supabase.table("message_templates").select("*").order("code")
    if locale:
        q = q.eq("locale", locale)
    return q.execute().data or []


@router.post("/preview")
async def preview(req: PreviewRequest, user: AuthenticatedUser = Depends(require_role(SENDER_ROLES))):
    app = _get_scoped_app(req.application_id, user)
    tmpl = notifier.get_template(req.template_code, req.channel, req.locale)
    values = _placeholders(app, user)
    return {
        "template_code": req.template_code,
        "locale": req.locale,
        "channel": req.channel,
        "subject": notifier.render(tmpl.get("subject") or "", values),
        "body": notifier.render(tmpl["body"], values),
        "placeholders": values,
    }


@router.post("/send", status_code=201)
async def send(req: SendRequest, user: AuthenticatedUser = Depends(require_role(SENDER_ROLES))):
    """Send the officer's final text to the institution's users, log it and audit it."""
    app = _get_scoped_app(req.application_id, user)
    recipients = [p["user_id"] for p in (_supabase.table("profiles").select("user_id")
                  .eq("institution_id", app["institution_id"]).execute().data or [])]
    if not recipients:
        raise HTTPException(status_code=400, detail="The institution has no user accounts to receive this")

    row = _supabase.table("communications").insert({
        "application_id": app["id"],
        "template_code": req.template_code,
        "channel": req.channel,
        "subject": req.subject,
        "body": req.body,
        "sent_by": user.id,
        "sent_at": clock.now().isoformat(),
    }).execute().data[0]

    # The full text is visible in-app after sign-in; email carries a short notice with the link
    notifier.notify_users(recipients, req.subject or f"Message about {app['application_no']}", req.body)
    if req.channel == "email":
        from services import email as email_service
        for uid in recipients:
            address = notifier._get_user_email(uid)
            if address:
                subject = f"Nirikshan: new message on {app['application_no']}"
                body = f"A new message about reference {app['application_no']} is waiting. Sign in to read it."
                email_service.send_email(address, subject, email_service.notice_html(
                    subject, body, f"{settings.FRONTEND_ORIGIN}/applications/{app['id']}"))

    audit_service.record(
        actor=user, action="COMMUNICATION_SENT", entity_type="application", entity_id=app["id"],
        before=None,
        after={"communication_id": row["id"], "template_code": req.template_code, "channel": req.channel,
               "locale": req.locale, "recipients": len(recipients)},
        reason=f"Sent {req.template_code.replace('_', ' ')}",
    )
    return row


@router.get("")
async def list_communications(
    application_id: str,
    user: AuthenticatedUser = Depends(require_case_access),
):
    """Messages sent on an application, newest first; the institution sees its own."""
    _get_scoped_app(application_id, user)
    rows = _supabase.table("communications").select("*").eq("application_id", application_id) \
        .order("sent_at", desc=True).execute().data or []
    uids = list({r["sent_by"] for r in rows if r.get("sent_by")})
    names = {p["user_id"]: p["full_name"] for p in (_supabase.table("profiles").select("user_id, full_name")
             .in_("user_id", uids).execute().data or [])} if uids else {}
    for r in rows:
        r["sent_by_name"] = names.get(r.get("sent_by"))
    return rows
