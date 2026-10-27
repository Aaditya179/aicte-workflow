"""
Phase 7B Tests — Decision Assurance Engine (§15.2, §15.11)

Tests:
1. Pre-decision checks run and return structured reports.
2. Open flags prevent decision commit.
3. Overriding a flag without a valid reason is rejected.
4. Overriding with a documented reason succeeds and updates audit log.
5. Committing succeeds when all flags are acknowledged/overridden.
6. Post-decision daily recheck flags newly expired evidence.
"""
import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta
import uuid

from main import app
from core.db import db
from core import clock
from services.assurance import assurance_service

client = TestClient(app)


@pytest.fixture(scope="module")
def regional_token():
    from tests.test_dashboards_reports import get_token
    return get_token("regional@demo.sih")


@pytest.mark.asyncio
async def test_decision_assurance_pre_checks(regional_token):
    """Test drafting a decision triggers pre-decision statutory checks."""
    clock.reset()
    # Find an open application
    apps = db.table("applications").select("id, current_stage").eq("status", "in_progress").limit(1).execute().data
    assert apps and len(apps) > 0
    test_app = apps[0]

    headers = {"Authorization": f"Bearer {regional_token}"}
    res = client.post(
        f"/api/v1/applications/{test_app['id']}/decisions",
        headers=headers,
        json={
            "stage_key": test_app["current_stage"],
            "outcome": "approve",
            "remarks": "Assurance pre-check automated test"
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert "decision_id" in data
    assert "checks" in data
    assert "flags" in data
    assert isinstance(data["checks"], list)
    assert len(data["checks"]) >= 4


@pytest.mark.asyncio
async def test_commit_blocked_with_open_flag(regional_token):
    """A decision cannot be committed while any flag is open."""
    # Create a draft decision with a known open flag
    dec = db.insert("decisions", {
        "application_id": str(uuid.uuid4()),
        "stage_key": "final_decision",
        "outcome": "approve",
        "status": "draft"
    })
    dec_id = dec["id"]

    rep = db.insert("assurance_reports", {
        "decision_id": dec_id,
        "kind": "pre",
        "generated_at": clock.now().isoformat(),
        "checks": [{"check": "freshness", "result": "flagged", "detail": "Test flag"}],
        "passed": 0,
        "flagged": 1
    })

    flag = db.insert("assurance_flags", {
        "report_id": rep["id"],
        "decision_id": dec_id,
        "check_type": "freshness",
        "severity": "critical",
        "message": "Test blocking flag",
        "status": "open"
    })

    headers = {"Authorization": f"Bearer {regional_token}"}
    # Attempt commit while open flag exists -> must fail with 400
    res = client.post(f"/api/v1/decisions/{dec_id}/commit", headers=headers)
    assert res.status_code == 400
    assert "open assurance flag" in res.json()["detail"]


@pytest.mark.asyncio
async def test_override_flag_requires_reason(regional_token):
    """Overriding a flag without a valid reason (<5 chars) must be rejected."""
    flag = db.insert("assurance_flags", {
        "report_id": str(uuid.uuid4()),
        "decision_id": str(uuid.uuid4()),
        "check_type": "completeness",
        "severity": "critical",
        "message": "Mandatory doc missing",
        "status": "open"
    })

    headers = {"Authorization": f"Bearer {regional_token}"}
    # Short reason -> rejected
    res = client.post(f"/api/v1/assurance/flags/{flag['id']}/override", headers=headers, json={"reason": "no"})
    assert res.status_code == 422 or res.status_code == 400

    # Valid reason -> accepted
    res_ok = client.post(
        f"/api/v1/assurance/flags/{flag['id']}/override",
        headers=headers,
        json={"reason": "Document verified via physical file on-site"}
    )
    assert res_ok.status_code == 200
    assert res_ok.json()["flag"]["status"] == "overridden"
    assert res_ok.json()["flag"]["reason"] == "Document verified via physical file on-site"


@pytest.mark.asyncio
async def test_commit_succeeds_after_override(regional_token):
    """Committing succeeds once all flags are acknowledged or overridden."""
    dec = db.insert("decisions", {
        "application_id": str(uuid.uuid4()),
        "stage_key": "scrutiny",
        "outcome": "approve",
        "status": "draft"
    })
    dec_id = dec["id"]

    flag = db.insert("assurance_flags", {
        "report_id": str(uuid.uuid4()),
        "decision_id": dec_id,
        "check_type": "source_verification",
        "severity": "warning",
        "message": "Advisory warning",
        "status": "acknowledged"
    })

    headers = {"Authorization": f"Bearer {regional_token}"}
    res = client.post(f"/api/v1/decisions/{dec_id}/commit", headers=headers)
    assert res.status_code == 200
    assert res.json()["decision"]["status"] == "committed"


@pytest.mark.asyncio
async def test_post_decision_recheck():
    """Daily post-decision recheck raises flags for committed decisions whose evidence expired."""
    clock.reset()
    now = clock.now()
    # Create committed decision citing evidence expiring in 10 days
    dec = db.insert("decisions", {
        "application_id": str(uuid.uuid4()),
        "stage_key": "final_decision",
        "outcome": "approve",
        "status": "committed"
    })
    dec_id = dec["id"]

    # Link evidence expiring in 10 days
    exp_date = (now + timedelta(days=10)).strftime("%Y-%m-%d")
    db.insert("decision_evidence", {
        "decision_id": dec_id,
        "document_id": str(uuid.uuid4()),
        "valid_until": exp_date,
        "linked_at": now.isoformat()
    })

    # Time jump +15 days -> evidence is now expired
    clock.advance_days(15)

    recheck_summary = await assurance_service.run_daily_post_decision_recheck()
    assert recheck_summary["new_flags_raised"] >= 1

    # Clean up clock
    clock.reset()
