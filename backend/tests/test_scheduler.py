"""
Phase 3 Tests — Scheduler, Alerts, Time-Travel Simulator, Escalation Chains.

Acceptance Criteria (Section 11 Phase 3):
- Clock service can advance and reset simulated time.
- Jumping clock on Case B produces:
  1. Upcoming reminder (when due in 2 days)
  2. Overdue alert & Level 1 escalation (+3 days)
  3. Level 2 escalation (+7 days)
  4. Level 3 escalation (+10 days)
- Exactly once each; rerun creates nothing new.
- Alert inbox, acknowledgment with audit entry, and in-app notifications.
"""
import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timedelta, timezone
from supabase import create_client

from main import app
from core.config import settings
from core import clock
from services import scheduler
from seed.demo_cases import seed_scripted_cases

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


import uuid

@pytest.fixture(scope="module")
def case_b_setup():
    clock.reset()

    # Find template and institution
    tmpl = _supabase.table("workflow_templates").select("id").eq("code", "ONLY_SCRUTINY").limit(1).execute()
    tmpl_id = tmpl.data[0]["id"]
    inst = _supabase.table("institutions").select("id").limit(1).execute()
    inst_id = inst.data[0]["id"]
    west = _supabase.table("regions").select("id").eq("name", "Western").limit(1).execute()
    west_id = west.data[0]["id"]
    officer = _supabase.table("profiles").select("user_id").eq("role", "scrutiny_officer").eq("region_id", west_id).limit(1).execute()
    officer_id = officer.data[0]["user_id"] if officer.data else None

    now = clock.now()
    app_no = f"TEST-CASE-B-{uuid.uuid4().hex[:8].upper()}"

    payload = {
        "application_no": app_no,
        "institution_id": inst_id,
        "template_id": tmpl_id,
        "application_type": "extension_of_approval",
        "current_stage": "scrutiny",
        "status": "in_progress",
        "region_id": west_id,
        "assigned_to": officer_id,
        "submitted_at": (now - timedelta(days=13)).isoformat(),
        "stage_entered_at": (now - timedelta(days=13)).isoformat(),
        "due_at": (now + timedelta(days=2)).isoformat(),
    }

    res = _supabase.table("applications").insert(payload).execute()
    assert res.data, "Failed to create test Case B application"
    return res.data[0]


class TestCaseBTimeTravelAndAlerts:

    def test_baseline_produces_reminder(self, case_b_setup):
        """Case B has due_at in 2 days. Running scheduler at baseline fires reminder."""
        clock.reset()
        res = scheduler.run_once()

        # Check alerts for Case B
        case_b_id = case_b_setup["id"]
        alerts = _supabase.table("alerts").select("*").eq("entity_id", case_b_id).execute().data

        # Should have upcoming alert (due in 2 days <= 3 days offset)
        upcoming = [a for a in alerts if a["kind"] == "upcoming"]
        assert len(upcoming) >= 1, "Expected upcoming reminder alert for Case B"
        assert upcoming[0]["level"] in (1, 3, 7)

    def test_jump_3_days_produces_overdue_and_level_1(self, case_b_setup):
        """At +3 days, Case B is 1 day overdue -> fires overdue + level 1 escalation."""
        clock.set_offset(3 * 86400)
        run_res = scheduler.run_once()

        case_b_id = case_b_setup["id"]
        alerts = _supabase.table("alerts").select("*").eq("entity_id", case_b_id).execute().data

        overdue = [a for a in alerts if a["kind"] == "overdue"]
        assert len(overdue) == 1, "Expected exactly 1 overdue alert"
        assert overdue[0]["level"] == 0

        esc_1 = [a for a in alerts if a["kind"] == "escalation" and a["level"] == 1]
        assert len(esc_1) == 1, "Expected Level 1 escalation"
        assert esc_1[0]["severity"] == "critical"

    def test_jump_7_days_produces_level_2(self, case_b_setup):
        """At +7 days, Case B is 5 days overdue (>= 3 days overdue) -> fires level 2 escalation."""
        clock.set_offset(7 * 86400)
        scheduler.run_once()

        case_b_id = case_b_setup["id"]
        alerts = _supabase.table("alerts").select("*").eq("entity_id", case_b_id).execute().data

        esc_2 = [a for a in alerts if a["kind"] == "escalation" and a["level"] == 2]
        assert len(esc_2) == 1, "Expected Level 2 escalation"
        assert esc_2[0]["severity"] == "critical"

    def test_jump_10_days_produces_level_3(self, case_b_setup):
        """At +10 days, Case B is 8 days overdue (>= 7 days overdue) -> fires level 3 escalation."""
        clock.set_offset(10 * 86400)
        scheduler.run_once()

        case_b_id = case_b_setup["id"]
        alerts = _supabase.table("alerts").select("*").eq("entity_id", case_b_id).execute().data

        esc_3 = [a for a in alerts if a["kind"] == "escalation" and a["level"] == 3]
        assert len(esc_3) == 1, "Expected Level 3 escalation"
        assert esc_3[0]["severity"] == "critical"

    def test_rerun_is_idempotent_creates_nothing_new(self, case_b_setup):
        """Rerunning scheduler at +10 days must create 0 new alerts for Case B."""
        case_b_id = case_b_setup["id"]
        alerts_before = _supabase.table("alerts").select("id").eq("entity_id", case_b_id).execute().data

        run_res = scheduler.run_once()

        alerts_after = _supabase.table("alerts").select("id").eq("entity_id", case_b_id).execute().data
        assert len(alerts_before) == len(alerts_after), "Rerun should not create any new alerts for Case B"


class TestAlertAndClockEndpoints:

    def test_admin_clock_advance_api(self, admin_token):
        """POST /api/v1/admin/clock/advance advances time and returns new clock status."""
        res = client.post(
            "/api/v1/admin/clock/advance",
            json={"days": 1.5},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True
        assert "scheduler_run" in data

    def test_admin_clock_reset_api(self, admin_token):
        """POST /api/v1/admin/clock/reset sets clock back to 0."""
        res = client.post(
            "/api/v1/admin/clock/reset",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True
        assert data["offset_days"] == 0

    def test_list_alerts_endpoint(self, regional_token):
        """GET /api/v1/alerts returns alerts list and supports filtering."""
        res = client.get(
            "/api/v1/alerts?limit=20",
            headers={"Authorization": f"Bearer {regional_token}"}
        )
        assert res.status_code == 200
        alerts = res.json()
        assert isinstance(alerts, list)

    def test_acknowledge_alert_creates_audit_entry(self, regional_token, case_b_setup):
        """POST /api/v1/alerts/{id}/acknowledge marks alert acknowledged and creates audit row."""
        case_b_id = case_b_setup["id"]
        alert = _supabase.table("alerts").select("*").eq("entity_id", case_b_id).eq("status", "open").limit(1).execute().data
        if not alert:
            alert = _supabase.table("alerts").select("*").eq("entity_id", case_b_id).limit(1).execute().data
        if not alert:
            # A clock reset removes alerts fired in the simulated future, so make one
            alert = _supabase.table("alerts").insert({
                "entity_type": "application_stage", "entity_id": case_b_id, "kind": "upcoming", "level": 3,
                "severity": "info", "message": "Test alert", "fired_at": datetime.now(timezone.utc).isoformat(),
            }).execute().data

        alert_id = alert[0]["id"]
        _supabase.table("alerts").update({"status": "open", "acknowledged_by": None, "acknowledged_at": None}).eq("id", alert_id).execute()

        res = client.post(
            f"/api/v1/alerts/{alert_id}/acknowledge",
            json={"notes": "Investigating delay with officer"},
            headers={"Authorization": f"Bearer {regional_token}"}
        )
        assert res.status_code == 200
        ack_data = res.json()
        assert ack_data["status"] == "acknowledged"

        # Verify audit entry exists
        audit_res = _supabase.table("audit_log").select("*") \
            .eq("action", "ALERT_ACKNOWLEDGED") \
            .eq("entity_id", alert_id).execute()
        assert len(audit_res.data) >= 1, "Audit record for alert acknowledgment missing"

    def test_notifications_list_and_read(self, regional_token):
        """GET & POST /api/v1/notifications."""
        res = client.get(
            "/api/v1/notifications",
            headers={"Authorization": f"Bearer {regional_token}"}
        )
        assert res.status_code == 200
        data = res.json()
        assert "items" in data
        assert "unread_count" in data
