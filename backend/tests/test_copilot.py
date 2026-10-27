"""Case copilot: answers from the case record only, escalation drafts, and sending to the chain."""
import uuid
from datetime import timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient

from core import clock
from core.db import db
from main import app
from services import copilot
from tests.test_workflow import _sign_in, _headers

client = TestClient(app)


def _case(no: str) -> dict:
    return db.table("applications").select("*").eq("application_no", no).limit(1).execute().data[0]


def test_record_says_whether_the_case_is_late():
    case = _case("DEMO-CASE-B")
    on_time = {**case, "due_at": (clock.now() + timedelta(days=2)).isoformat()}
    record = copilot.case_record(on_time)
    assert not record["late"] and any("not past any deadline" in f for f in record["facts"])
    late = {**case, "due_at": (clock.now() - timedelta(days=5, hours=1)).isoformat()}
    record = copilot.case_record(late)
    assert record["late"] and "5 days past its deadline" in record["causes"][0]
    assert copilot._delay_answer(late, record).startswith("DEMO-CASE-B is delayed mainly because it has been at Scrutiny")


def test_answer_with_a_number_not_in_the_record_is_replaced():
    case = {**_case("DEMO-CASE-B"), "due_at": (clock.now() - timedelta(days=5, hours=1)).isoformat()}
    with patch.object(copilot.llm, "_complete", return_value={"answer": "It is 40 days late."}), \
         patch.object(copilot.llm, "llm_enabled", return_value=True):
        result = copilot.answer(case, "Why is this case delayed?", [])
    assert result["mode"] == "mock_fallback" and "40" not in result["answer"]
    assert "5 days past its deadline" in result["answer"]
    with patch.object(copilot.llm, "_complete", return_value={"answer": "It is 5 days overdue at Scrutiny."}):
        result = copilot.answer(case, "Why is this case delayed?", [])
    assert result["mode"] == "production" and result["answer"] == "It is 5 days overdue at Scrutiny."


def test_copilot_endpoints_and_escalation_chain():
    case = _case("DEMO-CASE-B")
    regional = _headers(_sign_in("regional@demo.sih"))
    with patch.object(copilot.llm, "_complete", return_value=None):
        r = client.post("/api/v1/ai/copilot", headers=regional,
                        json={"application_id": case["id"], "question": "Why is this case delayed?"})
        assert r.status_code == 200, r.text
        assert r.json()["answer"].startswith("DEMO-CASE-B") and r.json()["facts"]
        draft = client.post("/api/v1/ai/copilot/escalation-draft", headers=regional,
                            json={"application_id": case["id"]}).json()
    # A regional officer escalates to the bureau
    assert draft["recipients"] and all(rc["role"] == "bureau officer" for rc in draft["recipients"])
    assert "DEMO-CASE-B" in draft["subject"]

    # The institution has no copilot, and a message can only go up the chain
    inst = _headers(_sign_in("institution@demo.sih"))
    assert client.post("/api/v1/ai/copilot", headers=inst,
                       json={"application_id": case["id"], "question": "Why?"}).status_code == 403
    scrutiny_id = db.table("profiles").select("user_id").eq("role", "scrutiny_officer").limit(1).execute().data[0]["user_id"]
    body = {"application_id": case["id"], "subject": "Test", "body": "Test"}
    assert client.post("/api/v1/ai/copilot/escalation-send", headers=regional,
                       json={**body, "recipient_id": scrutiny_id}).status_code == 403

    subject = f"Copilot test {uuid.uuid4().hex[:8]}"
    to = draft["recipients"][0]["user_id"]
    r = client.post("/api/v1/ai/copilot/escalation-send", headers=regional,
                    json={**body, "subject": subject, "recipient_id": to})
    try:
        assert r.status_code == 200 and r.json()["sent"] is True
        assert db.table("notifications").select("id").eq("user_id", to).eq("title", subject).execute().data
        logged = db.table("audit_log").select("action").eq("entity_id", case["id"]) \
            .eq("action", "copilot.escalation_sent").execute().data
        assert logged
    finally:
        db.table("notifications").delete().eq("user_id", to).eq("title", subject).execute()
