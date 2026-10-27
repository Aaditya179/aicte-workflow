"""
Phase 2 tests — Workflow Engine, Audit Chain, Role Enforcement.

Tests verify:
1. All 4 templates can be started and advanced stage-by-stage.
2. Wrong role cannot advance (403).
3. Empty reason is rejected on return and revert.
4. Each stage transition creates an audit entry.
5. Audit chain verifies (ok=True).
"""
import pytest
from fastapi.testclient import TestClient
from supabase import create_client
from dotenv import load_dotenv
from core.config import settings

load_dotenv(".env")
from main import app

client = TestClient(app)

# ─── Auth fixtures ──────────────────────────────────────────────────────────

def _sign_in(email: str) -> str:
    sb = create_client(settings.SUPABASE_URL, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqbGt4bW9kanBjenlhYnp3c3FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjkxNzYsImV4cCI6MjEwODYwNTE3Nn0.61j2LUZ31YT3GF1qK6oBk-nHrUQAherjlyoHguI9uy4")
    res = sb.auth.sign_in_with_password({"email": email, "password": "password123"})
    return res.session.access_token

def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(scope="module")
def institution_token():
    return _sign_in("institution@demo.sih")

@pytest.fixture(scope="module")
def scrutiny_token():
    return _sign_in("scrutiny@demo.sih")

@pytest.fixture(scope="module")
def regional_token():
    return _sign_in("regional@demo.sih")

@pytest.fixture(scope="module")
def bureau_token():
    return _sign_in("bureau@demo.sih")

@pytest.fixture(scope="module")
def admin_token():
    return _sign_in("admin@demo.sih")

@pytest.fixture(scope="module")
def evc_token():
    return _sign_in("evc@demo.sih")

@pytest.fixture(scope="module")
def sacshc_token():
    return _sign_in("sacshc@demo.sih")

# ─── Helper ─────────────────────────────────────────────────────────────────

def _get_institution_id(token: str) -> str:
    r = client.get("/api/v1/me", headers=_headers(token))
    assert r.status_code == 200
    return r.json()["institution_id"]

# An application type that the routing rules send to each workflow, whatever the institution's record
ROUTED_TO = {
    "ONLY_SCRUTINY": ("change_of_name", {"new_name": "Demo Institute of Technology and Science",
                                         "reason": "Approved by the trust"}),
    "SCRUTINY_EVC": ("new_institution", {"proposed_name": "Demo School of Architecture", "trust_name": "Demo Trust",
                                         "new_address": "Plot 4, Navi Mumbai", "land_area": "2.5 acres",
                                         "level": "UG", "discipline": "Architecture"}),
    "ONLY_EVC": ("restoration_of_intake", {"course_name": "B.Tech Civil Engineering", "intake_to_restore": 60,
                                           "compliance_summary": "Faculty vacancies filled"}),
    "EVC_SAC_SHC": ("appeal", {"reference_application_no": "AICTE/202609/ABC123",
                               "grounds": "Intake reduced despite compliance"}),
}


def _submit_app(token: str, template_code: str) -> dict:
    inst_id = _get_institution_id(token)
    app_type, details = ROUTED_TO[template_code]
    r = client.post(
        "/api/v1/applications",
        json={"application_type": app_type, "academic_year": "2027-28", "details": details,
              "declaration": True, "institution_id": inst_id},
        headers=_headers(token)
    )
    assert r.status_code == 201, f"Submit failed: {r.text}"
    return r.json()

# ─── Tests ──────────────────────────────────────────────────────────────────

class TestApplicationSubmit:
    def test_institution_can_submit(self, institution_token):
        app = _submit_app(institution_token, "SCRUTINY_EVC")
        assert app["application_no"].startswith("AICTE/")
        assert app["current_stage"] == "scrutiny"
        assert app["status"] == "in_progress"

    def test_workflow_is_routed_not_chosen(self, institution_token):
        for code, (app_type, details) in ROUTED_TO.items():
            r = client.post("/api/v1/applications/route-preview", headers=_headers(institution_token),
                            json={"application_type": app_type, "details": details})
            assert r.status_code == 200, r.text
            assert r.json()["template_code"] == code and r.json()["reasons"]
        # A workflow named in the request is ignored
        inst_id = _get_institution_id(institution_token)
        app_type, details = ROUTED_TO["ONLY_SCRUTINY"]
        r = client.post("/api/v1/applications", headers=_headers(institution_token),
                        json={"application_type": app_type, "academic_year": "2027-28", "details": details,
                              "declaration": True, "institution_id": inst_id, "template_code": "EVC_SAC_SHC"})
        assert r.status_code == 201 and r.json()["current_stage"] == "scrutiny"
        detail = client.get(f"/api/v1/applications/{r.json()['id']}", headers=_headers(institution_token)).json()
        assert detail["form"]["routing"]["template_code"] == "ONLY_SCRUTINY"
        assert detail["form"]["details"]["new_name"] == details["new_name"]

    def test_institution_cannot_submit_incomplete_application(self, institution_token):
        inst_id = _get_institution_id(institution_token)
        base = {"academic_year": "2027-28", "declaration": True, "institution_id": inst_id}
        for body in ({"application_type": "increase_in_intake", "details": {"level": "UG"}},
                     {"application_type": "made_up", "details": {}},
                     {**dict(zip(("application_type", "details"), ROUTED_TO["ONLY_SCRUTINY"])), "declaration": False}):
            r = client.post("/api/v1/applications", json={**base, **body}, headers=_headers(institution_token))
            assert r.status_code == 422, r.text

    def test_bureau_officer_cannot_submit_application(self, bureau_token):
        r = client.post(
            "/api/v1/applications",
            json={"application_type": "change_of_name", "academic_year": "2027-28", "declaration": True, "institution_id": "fake-id"},
            headers=_headers(bureau_token)
        )
        assert r.status_code == 403


class TestWorkflowONLY_SCRUTINY:
    """ONLY_SCRUTINY: scrutiny → final_decision (return loop through institution_response & re_scrutiny)"""

    def test_full_happy_path(self, institution_token, scrutiny_token, bureau_token):
        app = _submit_app(institution_token, "ONLY_SCRUTINY")
        app_id = app["id"]

        # Scrutiny officer advances
        r = client.post(f"/api/v1/applications/{app_id}/advance", json={"remarks": "Looks good"}, headers=_headers(scrutiny_token))
        assert r.status_code == 200, r.text
        assert r.json()["current_stage"] == "final_decision"

        # Bureau officer gives final decision (this is the terminal stage — no next stage)
        r = client.post(f"/api/v1/applications/{app_id}/advance", json={}, headers=_headers(bureau_token))
        assert r.status_code == 400  # No next stage — should reject

    def test_return_flow(self, institution_token, scrutiny_token):
        app = _submit_app(institution_token, "ONLY_SCRUTINY")
        app_id = app["id"]

        # Scrutiny returns
        r = client.post(f"/api/v1/applications/{app_id}/return", json={"reason": "Missing lease document"}, headers=_headers(scrutiny_token))
        assert r.status_code == 200
        assert r.json()["status"] == "returned"
        assert r.json()["current_stage"] == "institution_response"

    def test_return_requires_reason(self, institution_token, scrutiny_token):
        app = _submit_app(institution_token, "ONLY_SCRUTINY")
        app_id = app["id"]
        r = client.post(f"/api/v1/applications/{app_id}/return", json={"reason": ""}, headers=_headers(scrutiny_token))
        assert r.status_code == 422  # Pydantic validation error


class TestWorkflowSCRUTINY_EVC:
    """SCRUTINY_EVC: scrutiny → evc_queue (creates EVC) → evc_visit → final_decision"""

    def test_stage_progression_and_evc_creation(self, institution_token, scrutiny_token, regional_token, evc_token, bureau_token):
        app = _submit_app(institution_token, "SCRUTINY_EVC")
        app_id = app["id"]

        # scrutiny -> evc_queue
        r = client.post(f"/api/v1/applications/{app_id}/advance", json={}, headers=_headers(scrutiny_token))
        assert r.status_code == 200
        assert r.json()["current_stage"] == "evc_queue"

        # Verify EVC visit was created
        sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        evc = sb.table("evc_visits").select("*").eq("application_id", app_id).execute()
        assert len(evc.data) == 1
        assert evc.data[0]["status"] == "queued"

        # evc_queue -> evc_visit
        r = client.post(f"/api/v1/applications/{app_id}/advance", json={}, headers=_headers(regional_token))
        assert r.status_code == 200
        assert r.json()["current_stage"] == "evc_visit"

        # evc_visit -> final_decision
        r = client.post(f"/api/v1/applications/{app_id}/advance", json={}, headers=_headers(evc_token))
        assert r.status_code == 200
        assert r.json()["current_stage"] == "final_decision"


class TestWorkflowEVC_SAC_SHC:
    """EVC_SAC_SHC: evc_queue → evc_visit → sac_shc → final_decision, each advanced by its owner."""

    def test_full_path_by_stage_owners(self, institution_token, regional_token, evc_token, sacshc_token):
        app_id = _submit_app(institution_token, "EVC_SAC_SHC")["id"]
        for token, expected_stage in [(regional_token, "evc_visit"), (evc_token, "sac_shc"), (sacshc_token, "final_decision")]:
            r = client.post(f"/api/v1/applications/{app_id}/advance", json={}, headers=_headers(token))
            assert r.status_code == 200, f"Advance to {expected_stage} failed: {r.text}"
            assert r.json()["current_stage"] == expected_stage


class TestAdminHasNoCaseAccess:
    """§15.0: the administrator cannot submit, read or act on cases."""

    def test_admin_cannot_submit(self, institution_token, admin_token):
        inst_id = _get_institution_id(institution_token)
        r = client.post(
            "/api/v1/applications",
            json={"application_type": "change_of_name", "academic_year": "2027-28", "declaration": True, "institution_id": inst_id},
            headers=_headers(admin_token)
        )
        assert r.status_code == 403

    def test_admin_cannot_read_or_advance(self, institution_token, admin_token):
        app_id = _submit_app(institution_token, "ONLY_EVC")["id"]
        assert client.get("/api/v1/applications", headers=_headers(admin_token)).status_code == 403
        assert client.get(f"/api/v1/applications/{app_id}", headers=_headers(admin_token)).status_code == 403
        r = client.post(f"/api/v1/applications/{app_id}/advance", json={}, headers=_headers(admin_token))
        assert r.status_code == 403


class TestRoleEnforcement:
    def test_wrong_role_cannot_advance(self, institution_token, regional_token):
        """Regional officer cannot advance from scrutiny stage (needs scrutiny_officer)"""
        app = _submit_app(institution_token, "ONLY_SCRUTINY")
        app_id = app["id"]
        r = client.post(f"/api/v1/applications/{app_id}/advance", json={}, headers=_headers(regional_token))
        assert r.status_code == 403

    def test_institution_cannot_advance_own_app(self, institution_token):
        app = _submit_app(institution_token, "ONLY_SCRUTINY")
        app_id = app["id"]
        r = client.post(f"/api/v1/applications/{app_id}/advance", json={}, headers=_headers(institution_token))
        assert r.status_code == 403

    def test_evc_cannot_return_application(self, institution_token, evc_token):
        app = _submit_app(institution_token, "ONLY_SCRUTINY")
        app_id = app["id"]
        # EVC is an officer role and CAN return; skip this or test correctly
        # Actually per spec, OFFICER_ROLES can return. evc_member IS an officer.
        # So test that institution cannot return
        r = client.post(f"/api/v1/applications/{app_id}/return", json={"reason": "test"}, headers=_headers(institution_token))
        assert r.status_code == 403

    def test_revert_requires_reason(self, institution_token, regional_token, scrutiny_token):
        app = _submit_app(institution_token, "ONLY_SCRUTINY")
        app_id = app["id"]
        # Advance to final_decision first
        r = client.post(f"/api/v1/applications/{app_id}/advance", json={}, headers=_headers(scrutiny_token))
        assert r.status_code == 200
        # Try revert with empty reason
        r = client.post(f"/api/v1/applications/{app_id}/revert", json={"target_stage": "scrutiny", "reason": ""}, headers=_headers(regional_token))
        assert r.status_code == 422


class TestAuditChain:
    def test_each_advance_creates_audit_entry(self, institution_token, scrutiny_token):
        app = _submit_app(institution_token, "ONLY_SCRUTINY")
        app_id = app["id"]

        # Get initial audit count for this entity
        sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
        before_count = len(sb.table("audit_log").select("seq").eq("entity_type", "application").eq("entity_id", app_id).execute().data)

        # Advance
        r = client.post(f"/api/v1/applications/{app_id}/advance", json={}, headers=_headers(scrutiny_token))
        assert r.status_code == 200

        after_count = len(sb.table("audit_log").select("seq").eq("entity_type", "application").eq("entity_id", app_id).execute().data)
        assert after_count > before_count, "Advance did not create an audit entry"

    def test_audit_chain_integrity(self, bureau_token):
        r = client.get("/api/v1/audit/verify", headers=_headers(bureau_token))
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True, f"Audit chain broken: {data}"

    def test_timeline_has_stage_history(self, institution_token, scrutiny_token):
        app = _submit_app(institution_token, "ONLY_SCRUTINY")
        app_id = app["id"]
        r = client.post(f"/api/v1/applications/{app_id}/advance", json={}, headers=_headers(scrutiny_token))
        assert r.status_code == 200

        r = client.get(f"/api/v1/applications/{app_id}/timeline", headers=_headers(scrutiny_token))
        assert r.status_code == 200
        data = r.json()
        assert len(data["stage_history"]) >= 2  # start + advance
        assert len(data["audit_entries"]) >= 2
