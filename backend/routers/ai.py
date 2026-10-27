"""
AI and Query Router (Section 10.4).
- POST /api/v1/ai/query: Natural-language query parsed to validated JSON filter schema.
- POST /api/v1/ai/case-summary: Case summary <= 150 words.
- POST /api/v1/ai/deficiency-draft: Formal draft deficiency letter.
Never outputs SQL. All results passed through standard filtered endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from supabase import create_client

from core.config import settings
from core.security import AuthenticatedUser, require_role
from services import llm as llm_service
from services import risk as risk_service
from services import health_score as health_service
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


@router.post("/query")
async def natural_language_query(
    req: NLQueryRequest,
    user: AuthenticatedUser = Depends(require_role(["bureau_officer", "regional_officer", "scrutiny_officer", "admin"]))
):
    """
    Parse a natural language query into an allow-listed JSON filter and execute it (§10.4).
    Never produces or executes raw SQL.
    """
    q = req.query.lower().strip()
    
    # 1. Allow-listed Rule-based NL Parser (production safe & instant)
    entity = "applications"
    if "evc" in q or "visit" in q or "inspection" in q:
        entity = "evc"
    elif "undertaking" in q or "compliance" in q:
        entity = "undertakings"
    elif "document" in q or "affidavit" in q or "noc" in q:
        entity = "documents"

    is_overdue = True if ("overdue" in q or "delayed" in q or "breach" in q or "late" in q) else None
    
    # Identify region if mentioned
    region = None
    for r in ["north", "south", "east", "west", "central", "north-west"]:
        if r in q:
            region = r
            break

    # Identify stage
    stage = None
    for s in ["scrutiny", "re_scrutiny", "evc_visit", "shc_sac", "approval", "council_decision"]:
        if s.replace("_", " ") in q or s in q:
            stage = s
            break

    validated_filter = NLQueryFilter(
        entity=entity,
        region=region,
        stage=stage,
        overdue=is_overdue
    )

    # 2. Execute query against allowable endpoints/tables
    sim_now = clock.now()
    results = []

    if entity == "applications":
        query = _supabase.table("applications").select("*, institutions(name, region_id)")
        if user.role == "regional_officer" and user.region_id:
            query = query.eq("region_id", user.region_id)
        if stage:
            query = query.eq("current_stage", stage)
        if is_overdue:
            query = query.lt("due_at", sim_now.isoformat()).eq("status", "in_progress")
        
        db_res = query.limit(25).execute()
        results = db_res.data or []

    elif entity == "evc":
        query = _supabase.table("evc_visits").select("*, applications(application_number, institutions(name))")
        if is_overdue:
            query = query.lt("scheduling_due_at", sim_now.isoformat()).eq("status", "queued")
        db_res = query.limit(25).execute()
        results = db_res.data or []

    elif entity == "undertakings":
        query = _supabase.table("undertakings").select("*, institutions(name)")
        if is_overdue:
            query = query.lt("due_at", sim_now.isoformat()).in_("status", ["pending", "submitted"])
        db_res = query.limit(25).execute()
        results = db_res.data or []

    elif entity == "documents":
        query = _supabase.table("documents").select("*, institutions(name)")
        if is_overdue:
            query = query.lt("valid_until", sim_now.isoformat())
        db_res = query.limit(25).execute()
        results = db_res.data or []

    return {
        "query": req.query,
        "filter": validated_filter.model_dump(),
        "total_matches": len(results),
        "results": results,
        "advisory": "Advisory only, final decisions rest with the competent authority."
    }


@router.post("/case-summary")
async def get_case_summary(
    req: CaseSummaryRequest,
    user: AuthenticatedUser = Depends(require_role(["bureau_officer", "regional_officer", "scrutiny_officer", "admin"]))
):
    """
    Generate statutory case summary <= 150 words with open issues and next action (§10.3).
    """
    app_res = _supabase.table("applications").select("*, institutions(name, health_score)").eq("id", req.application_id).limit(1).execute()
    if not app_res.data:
        raise HTTPException(status_code=404, detail="Application not found")
    app = app_res.data[0]

    # Gather context
    hist_res = _supabase.table("stage_history").select("*").eq("application_id", req.application_id).order("seq").execute()
    alerts_res = _supabase.table("alerts").select("*").eq("entity_id", req.application_id).eq("status", "open").execute()
    uts_res = _supabase.table("undertakings").select("*").eq("institution_id", app["institution_id"]).in_("status", ["pending", "submitted"]).execute()

    context = {
        "application_number": app.get("application_number"),
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
    user: AuthenticatedUser = Depends(require_role(["regional_officer", "scrutiny_officer", "admin"]))
):
    """
    Draft formal deficiency letter with response deadline (§10.3).
    """
    app_res = _supabase.table("applications").select("*, institutions(name)").eq("id", req.application_id).limit(1).execute()
    if not app_res.data:
        raise HTTPException(status_code=404, detail="Application not found")
    app = app_res.data[0]

    context = {
        "application_number": app.get("application_number"),
        "institution_name": (app.get("institutions") or {}).get("name", "College"),
        "deficiencies": req.deficiencies,
        "deadline_days": req.deadline_days
    }

    return llm_service.draft_deficiency_letter(context)


@router.get("/risk/{application_id}")
async def get_application_risk(
    application_id: str,
    user: AuthenticatedUser = Depends(require_role(["bureau_officer", "regional_officer", "scrutiny_officer", "admin"]))
):
    """
    Get 0-100 delay-risk score and top 3 reasons (§10.1).
    """
    sim_now = clock.now()
    return risk_service.compute_application_risk(application_id, sim_now)


@router.get("/health-score/{institution_id}")
async def get_institution_health_score(
    institution_id: str,
    user: AuthenticatedUser = Depends(require_role(["bureau_officer", "regional_officer", "institution", "admin"]))
):
    """
    Get 0-100 compliance health score and deduction breakdown (§10.2).
    """
    sim_now = clock.now()
    return health_service.compute_institution_health_score(institution_id, sim_now)
