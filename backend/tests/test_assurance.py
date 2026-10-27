"""
Phase 7B Tests — Decision Assurance Engine (§15.2, §15.11)

Tests:
1. Pre-decision checks run and return structured reports.
2. Open flags prevent decision commit.
3. Overriding a flag without a valid reason is rejected.
4. Overriding with a documented reason succeeds and updates audit log.
5. Committing succeeds when all flags are acknowledged/overridden.
6. Post-decision daily recheck flags newly expired evidence.

The decision tables have foreign keys, so every row hangs off seeded case A (Western region,
visible to the regional officer) and is removed afterwards.
"""
import hashlib
import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from main import app
from core.db import db
from core import clock
from services.assurance import assurance_service

client = TestClient(app)


@pytest.fixture(scope="module")
def regional_token():
    from tests.test_dashboards_reports import get_token
    return get_token("regional@demo.sih")


@pytest.fixture(scope="module")
def regional_id(regional_token):
    return client.get("/api/v1/me", headers={"Authorization": f"Bearer {regional_token}"}).json()["user_id"]


@pytest.fixture(scope="module")
def case_a():
    return db.table("applications").select("*").eq("application_no", "DEMO-CASE-B").limit(1).execute().data[0]


@pytest.fixture
def decisions(case_a):
    """Creates decisions on case B and deletes them (cascading to reports and flags) afterwards."""
    created = []

    def make(status: str, stage_key: str = "test_stage", decided_by=None):
        dec = db.insert("decisions", {
            "application_id": case_a["id"], "stage_key": f"{stage_key}_{uuid.uuid4().hex[:6]}",
            "outcome": "approve", "status": status, "decided_by": decided_by,
            "decided_at": clock.now().isoformat(),
        })
        created.append(dec["id"])
        rep = db.insert("assurance_reports", {
            "decision_id": dec["id"], "kind": "pre", "generated_at": clock.now().isoformat(),
            "checks": [{"check": "freshness", "result": "flagged", "detail": "Test flag"}], "passed": 0, "flagged": 1,
        })
        return dec, rep

    yield make
    for dec_id in created:
        db.table("decisions").delete().eq("id", dec_id).execute()


def _flag(dec, rep, status="open", check_type="freshness"):
    return db.insert("assurance_flags", {
        "report_id": rep["id"], "decision_id": dec["id"], "check_type": check_type,
        "severity": "critical", "message": "Test flag", "status": status,
    })


@pytest.mark.asyncio
async def test_decision_assurance_pre_checks(regional_token, case_a):
    """Drafting a decision runs the pre-decision checks."""
    clock.reset()
    headers = {"Authorization": f"Bearer {regional_token}"}
    res = client.post(
        f"/api/v1/applications/{case_a['id']}/decisions",
        headers=headers,
        json={"stage_key": case_a["current_stage"], "outcome": "approve", "remarks": "Assurance pre-check automated test"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert "decision_id" in data and "checks" in data and "flags" in data
    assert isinstance(data["checks"], list)
    assert len(data["checks"]) >= 4
    db.table("decisions").delete().eq("id", data["decision_id"]).execute()


@pytest.mark.asyncio
async def test_commit_blocked_with_open_flag(regional_token, regional_id, decisions):
    """A decision cannot be committed while any flag is open."""
    dec, rep = decisions("draft", decided_by=regional_id)
    _flag(dec, rep, "open")
    headers = {"Authorization": f"Bearer {regional_token}"}
    res = client.post(f"/api/v1/decisions/{dec['id']}/commit", headers=headers)
    assert res.status_code == 400
    assert "open assurance flag" in res.json()["detail"]


@pytest.mark.asyncio
async def test_override_flag_requires_reason(regional_token, regional_id, decisions):
    """Overriding a flag without a valid reason (<5 chars) must be rejected."""
    dec, rep = decisions("draft", decided_by=regional_id)
    flag = _flag(dec, rep, "open", "completeness")
    headers = {"Authorization": f"Bearer {regional_token}"}

    res = client.post(f"/api/v1/assurance/flags/{flag['id']}/override", headers=headers, json={"reason": "no"})
    assert res.status_code in (400, 422)

    res_ok = client.post(f"/api/v1/assurance/flags/{flag['id']}/override", headers=headers,
                         json={"reason": "Document verified via physical file on-site"})
    assert res_ok.status_code == 200, res_ok.text
    assert res_ok.json()["flag"]["status"] == "overridden"
    assert res_ok.json()["flag"]["reason"] == "Document verified via physical file on-site"


@pytest.mark.asyncio
async def test_commit_succeeds_after_override(regional_token, regional_id, decisions):
    """Committing succeeds once all flags are acknowledged or overridden."""
    dec, rep = decisions("draft", decided_by=regional_id)
    _flag(dec, rep, "acknowledged", "source_verification")
    headers = {"Authorization": f"Bearer {regional_token}"}
    res = client.post(f"/api/v1/decisions/{dec['id']}/commit", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["decision"]["status"] == "committed"


@pytest.mark.asyncio
async def test_post_decision_recheck(case_a, decisions):
    """Daily post-decision recheck raises flags for committed decisions whose evidence expired."""
    clock.reset()
    now = clock.now()
    dec, _ = decisions("committed")
    exp_date = (now + timedelta(days=10)).strftime("%Y-%m-%d")
    doc = db.insert("documents", {
        "institution_id": case_a["institution_id"], "doc_type": "lease", "title": f"Recheck test {uuid.uuid4().hex[:6]}",
        "status": "verified", "valid_until": exp_date, "sha256": hashlib.sha256(b"recheck").hexdigest(),
    })
    db.insert("decision_evidence", {
        "decision_id": dec["id"], "document_id": doc["id"], "valid_until": exp_date,
        "doc_sha256": doc["sha256"], "linked_at": now.isoformat(),
    })
    try:
        clock.advance_days(15)  # evidence is now expired
        summary = await assurance_service.run_daily_post_decision_recheck()
        assert summary["new_flags_raised"] >= 1
        flags = db.table("assurance_flags").select("check_type").eq("decision_id", dec["id"]).execute().data
        assert any(f["check_type"] == "post_decision_freshness" for f in flags)
    finally:
        clock.reset()
        db.table("decisions").delete().eq("id", dec["id"]).execute()
        alert_ids = [a["id"] for a in db.table("alerts").select("id").eq("entity_type", "decision").eq("entity_id", dec["id"]).execute().data]
        if alert_ids:
            db.table("notifications").delete().in_("alert_id", alert_ids).execute()
            db.table("alerts").delete().in_("id", alert_ids).execute()
        db.table("documents").delete().eq("id", doc["id"]).execute()
