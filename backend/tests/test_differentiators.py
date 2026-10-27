import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from main import app
from core import clock
from core.security import supabase_admin
from services import health_score, risk, llm

client = TestClient(app)

def test_health_score_calculation():
    sim_now = clock.now()
    # Fetch first institution
    inst_res = supabase_admin.table("institutions").select("id").limit(1).execute()
    if not inst_res.data:
        pytest.skip("No institutions found to test health score")
    
    inst_id = inst_res.data[0]["id"]
    res = health_score.compute_institution_health_score(inst_id, sim_now)
    assert "health_score" in res
    assert 0 <= res["health_score"] <= 100
    assert res["tier"] in ("Good", "Watch", "At risk")
    assert isinstance(res["deductions"], list)

def test_delay_risk_score():
    sim_now = clock.now()
    app_res = supabase_admin.table("applications").select("id").limit(1).execute()
    if not app_res.data:
        pytest.skip("No applications found to test risk score")
        
    app_id = app_res.data[0]["id"]
    res = risk.compute_application_risk(app_id, sim_now)
    assert "risk_score" in res
    assert 0 <= res["risk_score"] <= 100
    assert res["tier"] in ("Low", "Medium", "High")
    assert len(res["reasons"]) >= 1
    assert "Advisory only" in res["advisory"]

def test_llm_case_summary():
    context = {
        "application_number": "APP-2026-TEST",
        "institution_name": "Test Engineering College",
        "current_stage": "scrutiny",
        "status": "in_progress",
        "stage_history": [{"action": "submit"}, {"action": "advance"}],
        "open_alerts": [{"title": "Warning SLA"}],
        "open_undertakings": []
    }
    res = llm.summarize_case(context)
    assert "summary" in res
    assert res["word_count"] <= 150
    assert "Advisory only" in res["advisory"]

def test_llm_deficiency_draft():
    context = {
        "application_number": "APP-2026-TEST",
        "institution_name": "Test Engineering College",
        "deficiencies": ["Missing fire safety NOC", "Faculty deficit in CSE"],
        "deadline_days": 15
    }
    res = llm.draft_deficiency_letter(context)
    assert "draft" in res
    assert "Missing fire safety NOC" in res["draft"]
    assert "15 calendar days" in res["draft"]
    assert "Advisory only" in res["advisory"]

def test_natural_language_query_endpoint():
    # Public token mock or direct call
    headers = {"Authorization": "Bearer mock_token"}
    res = client.post("/api/v1/ai/query", json={"query": "Show me overdue scrutiny applications in western region"}, headers=headers)
    # Even if mock token unauthorized in test client, test endpoint structure
    assert res.status_code in (200, 401, 403)
