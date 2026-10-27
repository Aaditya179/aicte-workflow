"""Daily brief: computed facts, and the guard that keeps the AI summary to those facts."""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
from services import brief
from tests.test_workflow import _sign_in, _headers

client = TestClient(app)

FACTS = [
    {"key": "overdue", "severity": "critical", "link": "/applications",
     "text": "3 applications in your region are past the stage deadline; the longest, DEMO-CASE-B, is 5 days overdue."},
    {"key": "evc_queue", "severity": "info", "link": "/evc",
     "text": "17 EVC visits in your region are waiting to be scheduled, 0 past the scheduling deadline."},
]


def test_summary_numbers_must_come_from_the_facts():
    assert brief._numbers_supported("3 applications are overdue, DEMO-CASE-B by 5 days; 17 EVC visits wait.", FACTS)
    assert not brief._numbers_supported("4 applications are overdue.", FACTS)
    # Numbers written as words are checked too
    assert brief._numbers_supported("Seventeen EVC visits wait and three cases are overdue.", FACTS)
    assert not brief._numbers_supported("Twelve EVC visits wait.", FACTS)


def test_deadline_facts():
    now = datetime(2026, 11, 1, tzinfo=timezone.utc)
    apps = [
        {"id": "a", "application_no": "A-1", "current_stage": "scrutiny", "due_at": (now - timedelta(days=5)).isoformat()},
        {"id": "b", "application_no": "B-1", "current_stage": "evc_queue", "due_at": (now - timedelta(days=1)).isoformat()},
        {"id": "c", "application_no": "C-1", "current_stage": "scrutiny", "due_at": (now + timedelta(days=2)).isoformat()},
        {"id": "d", "application_no": "D-1", "current_stage": "scrutiny", "due_at": (now + timedelta(days=20)).isoformat()},
    ]
    overdue, soon = brief._deadline_facts(apps, now, "in your region")
    assert overdue["text"] == ("2 applications in your region are past the stage deadline; the longest, A-1, "
                               "is 5 days overdue at Scrutiny.")
    assert overdue["link"] == "/applications/a" and overdue["severity"] == "critical"
    assert soon["text"] == ("1 application in your region will pass the stage deadline in the next 7 days, "
                            "the first being C-1 on 03/11/2026.")


def test_unsupported_summary_falls_back_to_the_facts():
    user = brief.AuthenticatedUser(id="u-test", role="regional_officer", region_id="r")
    with patch.object(brief, "compute_facts", return_value=FACTS), \
         patch.object(brief.llm, "write_daily_brief", return_value={"summary": "40 cases are overdue."}):
        result = brief._build_brief(user)
    assert result["summary"] == f"{FACTS[0]['text']} {FACTS[1]['text']}"
    assert result["mode"] == "mock_fallback" and result["facts"] == FACTS


def test_brief_endpoint_by_role():
    r = client.get("/api/v1/dashboard/brief", headers=_headers(_sign_in("regional@demo.sih")))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["summary"] and isinstance(data["facts"], list)
    assert all(f["severity"] in ("critical", "warning", "info") and f["link"].startswith("/") for f in data["facts"])
    # The administrator has no access to case data
    r = client.get("/api/v1/dashboard/brief", headers=_headers(_sign_in("admin@demo.sih")))
    assert r.status_code == 403
