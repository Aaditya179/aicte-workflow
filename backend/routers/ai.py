"""
AI and Query Router (Section 10.4).
- POST /api/v1/ai/query: Natural-language query parsed to validated JSON filter schema.
- POST /api/v1/ai/case-summary: Case summary <= 150 words.
- POST /api/v1/ai/deficiency-draft: Formal draft deficiency letter.
Never outputs SQL. All results passed through standard filtered endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Tuple
from datetime import timedelta
import re
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, require_role, require_case_access
from routers.applications import _get_scoped_app
from services import llm as llm_service
from services import risk as risk_service
from services import health_score as health_service
from services import copilot as copilot_service, notifier
from services import audit as audit_service
from core import clock

router = APIRouter(prefix="/ai", tags=["AI & Differentiators"])
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


class NLQueryRequest(BaseModel):
    query: str = Field(..., description="Natural language search query")


class NLQueryFilter(BaseModel):
    entity: str = Field("applications", description="applications, evc, undertakings, documents")
    region: Optional[str] = None
    stage: Optional[str] = None
    status: Optional[str] = None
    overdue: Optional[bool] = None
    days_overdue_gte: Optional[int] = None
    institution_name: Optional[str] = None


class CaseSummaryRequest(BaseModel):
    application_id: str


class DeficiencyDraftRequest(BaseModel):
    application_id: str
    deficiencies: List[str]
    deadline_days: int = 15


STAGES = ["re_scrutiny", "institution_response", "evc_queue", "evc_visit", "sac_shc", "final_decision", "scrutiny"]
ENTITY_STATUSES = {
    "applications": {"draft", "in_progress", "returned", "approved", "rejected", "closed"},
    "evc": {"queued", "scheduled", "completed", "overdue", "cancelled"},
    "undertakings": {"pending", "submitted", "verified", "rejected", "overdue"},
    "documents": {"active", "expiring", "expired", "renewed", "under_verification", "verified"},
}


def _rule_parse(q: str, regions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Keyword parser used when no model is configured or the model call fails."""
    entity = "applications"
    if "evc" in q or "visit" in q or "inspection" in q:
        entity = "evc"
    elif "undertaking" in q or "compliance" in q:
        entity = "undertakings"
    elif "document" in q or "affidavit" in q or "noc" in q or "lease" in q:
        entity = "documents"
    region = None
    for r in sorted(regions, key=lambda r: len(r["name"]), reverse=True):
        name = r["name"].lower()
        if name in q or name.replace("-", " ") in q or name.removesuffix("ern") in q:
            region = r["name"]
            break
    stage = next((s for s in STAGES if s.replace("_", " ") in q or s in q), None)
    days = re.search(r"(?:more than|over|at least|>=?)\s*(\d+)\s*days?", q)
    return {
        "entity": entity,
        "region": region,
        "stage": stage,
        "overdue": True if any(w in q for w in ("overdue", "delayed", "breach", "late")) or days else None,
        "days_overdue_gte": int(days.group(1)) if days else None,
    }


def _parse_query(question: str, regions: List[Dict[str, Any]]) -> Tuple[NLQueryFilter, str]:
    """
    Model output is only ever a filter object, validated against the allow-list before use.
    Anything outside it is dropped; the model never produces SQL.
    """
    raw = llm_service.nl_query_filter(question, [r["name"] for r in regions], STAGES)
    parser = "llm"
    if raw is None:
        raw, parser = _rule_parse(question.lower().strip(), regions), "rules"
    cleaned = {k: (v if v not in ("", 0, False) else None) for k, v in raw.items()}
    if cleaned.get("entity") not in ENTITY_STATUSES:
        cleaned["entity"] = "applications"
    if cleaned.get("region") not in {r["name"] for r in regions}:
        cleaned["region"] = None
    if cleaned.get("stage") not in STAGES:
        cleaned["stage"] = None
    if cleaned.get("status") not in ENTITY_STATUSES[cleaned["entity"]]:
        cleaned["status"] = None
    if cleaned.get("days_overdue_gte"):
        cleaned["overdue"] = True
    return NLQueryFilter(**cleaned), parser


def _run_filter(f: NLQueryFilter, region_id: Optional[str]) -> List[Dict[str, Any]]:
    """Run a validated filter through the same scoped table queries as the list endpoints."""
    sim_now = clock.now()
    cutoff = sim_now - timedelta(days=f.days_overdue_gte or 0)
    name = f.institution_name

    if f.entity == "applications":
        query = _supabase.table("applications").select("*, institutions!inner(name, region_id)")
        if region_id:
            query = query.eq("region_id", region_id)
        if f.stage:
            query = query.eq("current_stage", f.stage)
        if f.status:
            query = query.eq("status", f.status)
        if f.overdue:
            query = query.lt("due_at", cutoff.isoformat()).in_("status", ["in_progress", "returned"])
        if name:
            query = query.ilike("institutions.name", f"%{name}%")
    elif f.entity == "evc":
        query = _supabase.table("evc_visits").select("*, applications!inner(application_no, region_id, institutions!inner(name))")
        if region_id:
            query = query.eq("applications.region_id", region_id)
        if f.status:
            query = query.eq("status", f.status)
        if f.overdue:
            query = query.lt("scheduling_due_at", cutoff.isoformat()).eq("status", "queued")
        if name:
            query = query.ilike("applications.institutions.name", f"%{name}%")
    elif f.entity == "undertakings":
        query = _supabase.table("undertakings").select("*, institutions!inner(name, region_id)")
        if region_id:
            query = query.eq("institutions.region_id", region_id)
        if f.status:
            query = query.eq("status", f.status)
        if f.overdue:
            query = query.lt("due_at", cutoff.isoformat()).in_("status", ["pending", "rejected", "overdue"])
        if name:
            query = query.ilike("institutions.name", f"%{name}%")
    else:
        query = _supabase.table("documents").select("*, institutions!inner(name, region_id)")
        if region_id:
            query = query.eq("institutions.region_id", region_id)
        if f.status:
            query = query.eq("status", f.status)
        if f.overdue:
            query = query.lt("valid_until", cutoff.date().isoformat()).neq("status", "renewed")
        if name:
            query = query.ilike("institutions.name", f"%{name}%")
    return query.limit(25).execute().data or []


@router.post("/query")
async def natural_language_query(
    req: NLQueryRequest,
    user: AuthenticatedUser = Depends(require_role(["bureau_officer", "regional_officer", "scrutiny_officer"]))
):
    """
    Parse a natural language query into an allow-listed JSON filter and execute it (§10.4).
    Never produces or executes raw SQL.
    """
    regions = _supabase.table("regions").select("id, name").execute().data or []
    validated_filter, parser = _parse_query(req.query, regions)

    region_id = next((r["id"] for r in regions if r["name"] == validated_filter.region), None)
    if user.role in ("regional_officer", "scrutiny_officer") and user.region_id:
        region_id = user.region_id  # officers below bureau never query outside their region

    results = _run_filter(validated_filter, region_id)
    return {
        "query": req.query,
        "filter": validated_filter.model_dump(),
        "parser": parser,
        "total_matches": len(results),
        "results": results,
        "advisory": "Advisory only, final decisions rest with the competent authority."
    }


@router.post("/case-summary")
async def get_case_summary(
    req: CaseSummaryRequest,
    user: AuthenticatedUser = Depends(require_role(["bureau_officer", "regional_officer", "scrutiny_officer"]))
):
    """
    Generate statutory case summary <= 150 words with open issues and next action (§10.3).
    """
    _get_scoped_app(req.application_id, user)
    app_res = _supabase.table("applications").select("*, institutions(name, health_score)").eq("id", req.application_id).limit(1).execute()
    if not app_res.data:
        raise HTTPException(status_code=404, detail="Application not found")
    app = app_res.data[0]

    # Gather context
    hist_res = _supabase.table("stage_history").select("*").eq("application_id", req.application_id).order("entered_at").execute()
    alerts_res = _supabase.table("alerts").select("*").eq("entity_id", req.application_id).eq("status", "open").execute()
    uts_res = _supabase.table("undertakings").select("*").eq("institution_id", app["institution_id"]).in_("status", ["pending", "submitted", "rejected", "overdue"]).execute()

    context = {
        "application_number": app.get("application_no"),
        "institution_name": (app.get("institutions") or {}).get("name", "Institution"),
        "current_stage": app.get("current_stage"),
        "status": app.get("status"),
        "stage_history": hist_res.data or [],
        "open_alerts": alerts_res.data or [],
        "open_undertakings": uts_res.data or []
    }

    return llm_service.summarize_case(context)


@router.post("/deficiency-draft")
async def get_deficiency_draft(
    req: DeficiencyDraftRequest,
    user: AuthenticatedUser = Depends(require_role(["regional_officer", "scrutiny_officer"]))
):
    """
    Draft formal deficiency letter with response deadline (§10.3).
    """
    _get_scoped_app(req.application_id, user)
    app_res = _supabase.table("applications").select("*, institutions(name)").eq("id", req.application_id).limit(1).execute()
    if not app_res.data:
        raise HTTPException(status_code=404, detail="Application not found")
    app = app_res.data[0]

    context = {
        "application_number": app.get("application_no"),
        "institution_name": (app.get("institutions") or {}).get("name", "College"),
        "deficiencies": req.deficiencies,
        "deadline_days": req.deadline_days
    }

    return llm_service.draft_deficiency_letter(context)


class PolishRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=8000)


@router.post("/polish")
async def polish_draft(req: PolishRequest, user: AuthenticatedUser = Depends(require_role(["scrutiny_officer", "regional_officer", "bureau_officer"]))):
    """Suggest better wording for a communication draft (§15.7). Nothing is sent."""
    return llm_service.polish_text(req.text)


@router.get("/risk/{application_id}")
async def get_application_risk(
    application_id: str,
    user: AuthenticatedUser = Depends(require_role(["bureau_officer", "regional_officer", "scrutiny_officer"]))
):
    """
    Get 0-100 delay-risk score and top 3 reasons (§10.1).
    """
    sim_now = clock.now()
    return risk_service.compute_application_risk(application_id, sim_now)


@router.get("/health-score/{institution_id}")
async def get_institution_health_score(
    institution_id: str,
    user: AuthenticatedUser = Depends(require_role(["bureau_officer", "regional_officer", "institution"]))
):
    """
    Get 0-100 compliance health score and deduction breakdown (§10.2).
    """
    if user.role == "institution" and user.institution_id != institution_id:
        raise HTTPException(status_code=403, detail="Institutions can only view their own health score")
    sim_now = clock.now()
    return health_service.compute_institution_health_score(institution_id, sim_now)


# ─── Case copilot ────────────────────────────────────────────────────────────

COPILOT_ROLES = ["scrutiny_officer", "regional_officer", "bureau_officer", "evc_member", "sac_shc_member"]


class CopilotTurn(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., max_length=4000)


class CopilotRequest(BaseModel):
    application_id: str
    question: str = Field(..., min_length=1, max_length=1000)
    history: List[CopilotTurn] = Field(default_factory=list, max_length=20)


class EscalationDraftRequest(BaseModel):
    application_id: str


class EscalationSendRequest(BaseModel):
    application_id: str
    recipient_id: str
    subject: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=3000)


@router.post("/copilot")
async def case_copilot(req: CopilotRequest, user: AuthenticatedUser = Depends(require_role(COPILOT_ROLES))):
    """Answer a question about one case from its record. Advisory; changes nothing."""
    app = _get_scoped_app(req.application_id, user)
    return copilot_service.answer(app, req.question.strip(), [t.model_dump() for t in req.history])


@router.post("/copilot/escalation-draft")
async def copilot_escalation_draft(req: EscalationDraftRequest,
                                   user: AuthenticatedUser = Depends(require_role(COPILOT_ROLES))):
    """Draft an escalation message to the next level up. Nothing is sent from here."""
    app = _get_scoped_app(req.application_id, user)
    return copilot_service.draft_escalation(app, user)


@router.post("/copilot/escalation-send")
async def copilot_escalation_send(req: EscalationSendRequest,
                                  user: AuthenticatedUser = Depends(require_role(COPILOT_ROLES))):
    """The officer sends the reviewed escalation as an in-app message to a senior officer. Audited."""
    app = _get_scoped_app(req.application_id, user)
    allowed = {r["user_id"]: r for r in copilot_service.escalation_recipients(app, user)}
    if req.recipient_id not in allowed:
        raise HTTPException(status_code=403, detail="That officer is not above you in this case's escalation chain")
    notifier.notify_user(req.recipient_id, req.subject.strip(), req.body.strip())
    audit_service.record(
        actor=user, action="copilot.escalation_sent", entity_type="application", entity_id=app["id"],
        before=None, after={"to": req.recipient_id, "subject": req.subject.strip()},
        reason=f"Escalated to {allowed[req.recipient_id].get('full_name') or 'a senior officer'}",
    )
    return {"sent": True, "recipient": allowed[req.recipient_id].get("full_name")}
