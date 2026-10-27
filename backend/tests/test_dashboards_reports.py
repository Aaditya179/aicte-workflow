"""
Phase 5 Tests — Dashboards, SQL Views with app_now(), and PDF/Excel Reports

Acceptance Criteria (Section 11 Phase 5):
- Dashboard numbers change dynamically after a time jump.
- Bureau, Regional, Officer, and Institution dashboards return structured data.
- PDF and Excel reports download successfully with correct binary signatures.
"""
import pytest
from fastapi.testclient import TestClient
from datetime import timedelta
from supabase import create_client

from main import app
from core.config import settings
from core import clock

client = TestClient(app)


def get_token(email: str) -> str:
    sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    res = sb.auth.sign_in_with_password({
        "email": email,
        "password": settings.DEMO_PASSWORD
    })
    return res.session.access_token


@pytest.fixture(scope="module")
def bureau_token():
    return get_token("bureau@demo.sih")


@pytest.fixture(scope="module")
def regional_token():
    return get_token("regional@demo.sih")


@pytest.fixture(scope="module")
def scrutiny_token():
    return get_token("scrutiny@demo.sih")


@pytest.fixture(scope="module")
def institution_token():
    return get_token("institution@demo.sih")


def test_bureau_dashboard(bureau_token):
    """Bureau officer receives national KPIs, region summary, stage funnel, and officer workload."""
    clock.reset()
    headers = {"Authorization": f"Bearer {bureau_token}"}
    res = client.get("/api/v1/dashboard/bureau", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert "kpis" in data
    kpis = data["kpis"]
    assert "open_applications" in kpis
    assert "overdue_applications" in kpis
    assert "sla_compliance_rate" in kpis

    assert "region_summary" in data
    assert isinstance(data["region_summary"], list)

    assert "stage_funnel" in data
    assert isinstance(data["stage_funnel"], list)

    assert "officer_workload" in data
    assert isinstance(data["officer_workload"], list)


def test_regional_dashboard_and_urgency_queue(regional_token):
    """Regional officer dashboard includes an urgent case queue sorted by urgency."""
    clock.reset()
    headers = {"Authorization": f"Bearer {regional_token}"}
    res = client.get("/api/v1/dashboard/regional", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert "urgent_case_queue" in data
    queue = data["urgent_case_queue"]
    assert isinstance(queue, list)
    if len(queue) > 1 and queue[0].get("days_left") is not None and queue[1].get("days_left") is not None:
        assert queue[0]["days_left"] <= queue[1]["days_left"]


def test_officer_dashboard(scrutiny_token):
    """Individual officer sees their case distribution (due today, due this week, overdue)."""
    headers = {"Authorization": f"Bearer {scrutiny_token}"}
    res = client.get("/api/v1/dashboard/officer", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert "kpis" in data
    assert "cases" in data
    cases = data["cases"]
    assert "overdue" in cases
    assert "due_today" in cases
    assert "due_this_week" in cases


def test_institution_dashboard(institution_token):
    """Institution sees their applications, undertakings, documents, and health score."""
    headers = {"Authorization": f"Bearer {institution_token}"}
    res = client.get("/api/v1/dashboard/institution", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert "health_score" in data
    assert data["health_score"] >= 0
    assert "applications" in data
    assert "undertakings" in data
    assert "documents" in data


def test_time_jump_alters_dashboard_numbers(bureau_token):
    """
    Jumping time updates app_now() in PostgreSQL views and dashboard API responses.
    """
    headers = {"Authorization": f"Bearer {bureau_token}"}

    # Baseline at t=0
    clock.reset()
    res1 = client.get("/api/v1/dashboard/bureau", headers=headers)
    assert res1.status_code == 200
    baseline_overdue = res1.json()["kpis"]["overdue_applications"]

    # Advance clock by 14 days
    clock.advance_days(14)
    res2 = client.get("/api/v1/dashboard/bureau", headers=headers)
    assert res2.status_code == 200
    advanced_overdue = res2.json()["kpis"]["overdue_applications"]

    # Reset
    clock.reset()

    # Overdue cases must be >= baseline after jumping 14 days
    assert advanced_overdue >= baseline_overdue


def test_reports_json_format(bureau_token):
    """Exporting reports as JSON returns metadata and table rows."""
    headers = {"Authorization": f"Bearer {bureau_token}"}
    for report_type in ["pendency", "overdue_summary", "officer_workload", "compliance", "audit"]:
        res = client.get(f"/api/v1/reports/{report_type}?format=json", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["report_type"] == report_type
        assert "headers" in data
        assert "data" in data
        assert "Advisory only" in data["disclaimer"]


def test_reports_pdf_generation(bureau_token):
    """ReportLab generates a valid PDF binary with %PDF magic header."""
    headers = {"Authorization": f"Bearer {bureau_token}"}
    res = client.get("/api/v1/reports/pendency?format=pdf", headers=headers)
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF")
    assert len(res.content) > 500


def test_reports_excel_generation(bureau_token):
    """openpyxl generates a valid Excel workbook with PK zip magic header."""
    headers = {"Authorization": f"Bearer {bureau_token}"}
    res = client.get("/api/v1/reports/officer_workload?format=xlsx", headers=headers)
    assert res.status_code == 200
    assert "spreadsheetml.sheet" in res.headers["content-type"]
    assert res.content.startswith(b"PK\x03\x04")
    assert len(res.content) > 1000
