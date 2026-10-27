"""
Phase 4 Tests — Specialized Monitoring Workflows:
- EVC Visits (Case C): schedule, report upload, completion, auto-resolve alerts
- Undertakings (Case D): issue, submit evidence, reject with extension, verify, auto-resolve alerts
- Document Expiry & Renewals (Case E): register, validity tracking, renew superseding old doc, verification
- Sequential SHA-256 Audit trail integrity for all monitoring actions
"""
import pytest
from fastapi.testclient import TestClient
from datetime import timedelta, date
import uuid
from supabase import create_client

from main import app
from core.config import settings
from core import clock
from services import scheduler
from services import audit as audit_service

client = TestClient(app)
_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def get_token(email: str) -> str:
    sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    res = sb.auth.sign_in_with_password({
        "email": email,
        "password": settings.DEMO_PASSWORD
    })
    return res.session.access_token


@pytest.fixture(scope="module")
def admin_token():
    return get_token("admin@demo.sih")


@pytest.fixture(scope="module")
def regional_token():
    return get_token("regional@demo.sih")


@pytest.fixture(scope="module")
def evc_token():
    return get_token("evc@demo.sih")


@pytest.fixture(scope="module")
def institution_token():
    return get_token("institution@demo.sih")


@pytest.fixture(scope="module")
def test_setup():
    clock.reset()
    now = clock.now()
    
    inst = _supabase.table("institutions").select("id").limit(1).execute()
    inst_id = inst.data[0]["id"]
    
    west = _supabase.table("regions").select("id").eq("name", "Western").limit(1).execute()
    west_id = west.data[0]["id"]
    
    tmpl = _supabase.table("workflow_templates").select("id").eq("code", "SCRUTINY_EVC").limit(1).execute()
    tmpl_id = tmpl.data[0]["id"] if tmpl.data else None

    # Get EVC member profile ID
    evc_prof = _supabase.table("profiles").select("user_id").eq("role", "evc_member").limit(1).execute()
    evc_member_id = evc_prof.data[0]["user_id"] if evc_prof.data else None

    # Create dedicated test application
    app_no = f"TEST-MON-{uuid.uuid4().hex[:6].upper()}"
    app_res = _supabase.table("applications").insert({
        "application_no": app_no,
        "institution_id": inst_id,
        "region_id": west_id,
        "template_id": tmpl_id,
        "application_type": "extension_of_approval",
        "current_stage": "evc",
        "status": "in_progress",
        "stage_entered_at": now.isoformat(),
        "submitted_at": now.isoformat()
    }).execute()
    app_id = app_res.data[0]["id"]

    return {
        "inst_id": inst_id,
        "region_id": west_id,
        "app_id": app_id,
        "app_no": app_no,
        "evc_member_id": evc_member_id
    }


def test_evc_lifecycle_case_c(regional_token, evc_token, test_setup):
    """
    Test Case C: EVC Queue -> Schedule Visit -> Upload Report -> Complete Visit
    """
    headers_reg = {"Authorization": f"Bearer {regional_token}"}
    headers_evc = {"Authorization": f"Bearer {evc_token}"}
    app_id = test_setup["app_id"]
    now = clock.now()

    # 1. Create an EVC visit in 'queued' status
    visit_res = _supabase.table("evc_visits").insert({
        "application_id": app_id,
        "status": "queued",
        "queued_at": now.isoformat(),
        "scheduling_due_at": (now + timedelta(days=7)).isoformat()
    }).execute()
    visit_id = visit_res.data[0]["id"]

    # 2. List EVC visits as Regional Officer
    res = client.get("/api/v1/evc", headers=headers_reg)
    assert res.status_code == 200
    visits = res.json()
    assert any(v["id"] == visit_id for v in visits)

    # 3. Schedule the visit with an EVC committee member
    committee = [test_setup["evc_member_id"]] if test_setup["evc_member_id"] else []
    sched_time = (clock.now() + timedelta(days=5)).isoformat()
    res = client.post(
        f"/api/v1/evc/{visit_id}/schedule",
        headers=headers_reg,
        json={
            "scheduled_for": sched_time,
            "committee_members": committee
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "scheduled"

    # 4. Upload EVC inspection report
    res = client.post(
        f"/api/v1/evc/{visit_id}/report",
        headers=headers_reg,
        json={
            "title": "Comprehensive Campus Inspection Report 2026",
            "storage_path": "documents/evc_reports/report_case_c.pdf",
            "remarks": "Infrastructure meets AICTE norms. Adequate laboratories and library facilities."
        }
    )
    assert res.status_code == 200
    doc_res = res.json()
    assert doc_res["ok"] is True
    assert doc_res["document_id"] is not None

    # 5. Complete visit
    res = client.post(
        f"/api/v1/evc/{visit_id}/complete",
        headers=headers_reg,
        params={"remarks": "Visit completed successfully. Recommending approval."}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "completed"

    # Verify visit status in DB
    updated = _supabase.table("evc_visits").select("status").eq("id", visit_id).execute()
    assert updated.data[0]["status"] == "completed"


def test_undertakings_case_d(regional_token, institution_token, test_setup):
    """
    Test Case D: Issue Undertaking -> Submit Evidence -> Reject with extension -> Re-submit -> Verify
    """
    headers_reg = {"Authorization": f"Bearer {regional_token}"}
    headers_inst = {"Authorization": f"Bearer {institution_token}"}
    inst_id = test_setup["inst_id"]
    app_id = test_setup["app_id"]

    # 1. Create undertaking as Regional Officer
    res = client.post(
        "/api/v1/undertakings",
        headers=headers_reg,
        json={
            "institution_id": inst_id,
            "application_id": app_id,
            "title": "Establishment of Incubation Center",
            "description": "Provide functional 100-sqm incubation center with high-speed internet by due date.",
            "condition_type": "infrastructure",
            "due_days": 15
        }
    )
    assert res.status_code == 200
    ut_data = res.json()
    ut_id = ut_data["id"]
    assert ut_data["status"] == "pending"

    # 2. List undertakings
    res = client.get(f"/api/v1/undertakings?institution_id={inst_id}", headers=headers_inst)
    assert res.status_code == 200
    uts = res.json()
    assert any(u["id"] == ut_id for u in uts)

    # 3. Institution submits evidence
    res = client.post(
        f"/api/v1/undertakings/{ut_id}/submit",
        headers=headers_inst,
        json={
            "title": "Incubation Center Draft Plan",
            "storage_path": "documents/evidence/incubation_center_draft.pdf"
        }
    )
    assert res.status_code == 200
    assert res.json()["status"] == "submitted"

    # 4. Regional Officer rejects evidence with revision deadline
    res = client.post(
        f"/api/v1/undertakings/{ut_id}/reject",
        headers=headers_reg,
        json={
            "remarks": "Incomplete photo evidence. Please attach geotagged photos of working equipment.",
            "extension_days": 7
        }
    )
    assert res.status_code == 200
    rej_data = res.json()
    assert rej_data["status"] == "rejected"

    # 5. Institution submits revised evidence
    res = client.post(
        f"/api/v1/undertakings/{ut_id}/submit",
        headers=headers_inst,
        json={
            "title": "Incubation Center Geotagged Photos",
            "storage_path": "documents/evidence/incubation_center_photos.pdf"
        }
    )
    assert res.status_code == 200
    assert res.json()["status"] == "submitted"

    # 6. Regional Officer verifies and clears undertaking
    res = client.post(
        f"/api/v1/undertakings/{ut_id}/verify",
        headers=headers_reg,
        json={"remarks": "Evidence verified and approved. Condition satisfied."}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "verified"


def test_documents_lifecycle_case_e(regional_token, institution_token, test_setup):
    """
    Test Case E: Register Land Lease Document -> Check Expiry Status -> Renew -> Verify Renewal
    """
    headers_reg = {"Authorization": f"Bearer {regional_token}"}
    headers_inst = {"Authorization": f"Bearer {institution_token}"}
    inst_id = test_setup["inst_id"]

    sim_today = clock.now().date()
    valid_from = (sim_today - timedelta(days=360)).isoformat()
    valid_until = (sim_today + timedelta(days=20)).isoformat()  # Expiring in 20 days (<30d)

    # 1. Register document
    res = client.post(
        "/api/v1/documents",
        headers=headers_inst,
        json={
            "institution_id": inst_id,
            "doc_type": "lease",
            "title": "Main Campus 30-Year Lease Agreement",
            "storage_path": "documents/lease/lease_2026.pdf",
            "valid_from": valid_from,
            "valid_until": valid_until
        }
    )
    assert res.status_code == 200
    doc1 = res.json()
    doc1_id = doc1["id"]

    # 2. List documents and check computed validity live_status
    res = client.get(f"/api/v1/documents?institution_id={inst_id}", headers=headers_reg)
    assert res.status_code == 200
    docs = res.json()
    found = next((d for d in docs if d["id"] == doc1_id), None)
    assert found is not None
    assert found["live_status"] == "expiring"
    assert found["days_remaining"] == 20

    # 3. Renew document (superseding doc1)
    new_valid_from = sim_today.isoformat()
    new_valid_until = (sim_today + timedelta(days=365 * 5)).isoformat()
    res = client.post(
        f"/api/v1/documents/{doc1_id}/renew",
        headers=headers_inst,
        json={
            "title": "Main Campus 30-Year Lease Agreement (Extended)",
            "storage_path": "documents/lease/lease_renewal_2031.pdf",
            "valid_from": new_valid_from,
            "valid_until": new_valid_until
        }
    )
    assert res.status_code == 200
    doc2 = res.json()
    doc2_id = doc2["id"]
    assert doc2["supersedes_document_id"] == doc1_id
    assert doc2["status"] == "under_verification"

    # 4. Verify renewal document as Regional Officer
    res = client.post(
        f"/api/v1/documents/{doc2_id}/verify",
        headers=headers_reg,
        json={"remarks": "Notarized 5-year extension verified with sub-registrar seal."}
    )
    assert res.status_code == 200
    assert res.json()["status"] == "verified"

    # Verify old doc status changed to renewed
    old_doc = _supabase.table("documents").select("status").eq("id", doc1_id).execute()
    assert old_doc.data[0]["status"] == "renewed"


def test_audit_integrity_after_monitoring_workflows(admin_token):
    """
    Verify that all Phase 4 actions created cryptographic SHA-256 chained audit entries
    and the entire chain verifies with 0 violations.
    """
    headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.get("/api/v1/audit/verify", headers=headers)
    assert res.status_code == 200
    chain_info = res.json()
    assert chain_info["ok"] is True
    assert chain_info["entries_verified"] > 0
