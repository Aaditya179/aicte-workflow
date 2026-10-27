"""
v2 tests (§15.11): Decision Assurance on seeded cases G, H and J, OCR, the EVC scheduling
assistant, multi-channel delivery, and the security items (MFA, admin isolation, uploads,
signed links, access logging, maker-checker).

Runs against the configured Supabase project and reseeds cases G to J first.
"""
import time
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient

from core import clock
from core.config import settings
from core.db import db
from core.ratelimit import reset as reset_rate_limits
from main import app
from seed.v2_seed import SAMPLE_LEASE, SAMPLE_LEASE_EXPIRY, seed_v2_cases
from services import notifier, storage
from tests.test_workflow import _sign_in, _headers

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def seeded():
    clock.reset()
    reset_rate_limits()
    seed_v2_cases()
    yield
    clock.reset()


@pytest.fixture(scope="module")
def tokens():
    emails = {
        "institution": "institution@demo.sih", "scrutiny": "scrutiny@demo.sih", "regional": "regional@demo.sih",
        "bureau": "bureau@demo.sih", "admin": "admin@demo.sih", "admin2": "admin2@demo.sih",
        "auditor": "auditor@demo.sih", "mfa": "mfa.officer@demo.sih",
    }
    return {k: _sign_in(v) for k, v in emails.items()}


def _app(app_no: str) -> dict:
    return db.table("applications").select("*").eq("application_no", app_no).limit(1).execute().data[0]


def _draft(token: str, app_no: str, stage: str) -> dict:
    a = _app(app_no)
    r = client.post(f"/api/v1/applications/{a['id']}/decisions", headers=_headers(token),
                    json={"stage_key": stage, "outcome": "approve", "remarks": "v2 test"})
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Decision Assurance
# ---------------------------------------------------------------------------
class TestAssuranceCases:
    def test_case_g_four_flags_ack_override_commit(self, tokens):
        data = _draft(tokens["bureau"], "DEMO-CASE-G", "final_decision")
        types = sorted({f["check_type"] for f in data["flags"]})
        assert types == ["completeness", "consistency", "freshness", "source_verification"], data["flags"]
        dec_id = data["decision_id"]
        h = _headers(tokens["bureau"])

        # Commit is blocked while any flag is open
        assert client.post(f"/api/v1/decisions/{dec_id}/commit", headers=h).status_code == 400

        flags = client.get(f"/api/v1/decisions/{dec_id}/assurance", headers=h).json()["flags"]
        first, rest = flags[0], flags[1:]
        assert client.post(f"/api/v1/assurance/flags/{first['id']}/acknowledge", headers=h).status_code == 200
        # An override without a reason is rejected
        r = client.post(f"/api/v1/assurance/flags/{rest[0]['id']}/override", headers=h, json={"reason": ""})
        assert r.status_code in (400, 422)
        for f in rest:
            r = client.post(f"/api/v1/assurance/flags/{f['id']}/override", headers=h,
                            json={"reason": "Checked against the physical file during the hearing"})
            assert r.status_code == 200, r.text

        r = client.post(f"/api/v1/decisions/{dec_id}/commit", headers=h)
        assert r.status_code == 200, r.text
        assert db.table("audit_log").select("seq").eq("entity_id", first["id"]).execute().data

    def test_case_h_post_recheck_raises_flag_and_alert(self):
        import asyncio
        from services.assurance import assurance_service
        dec = db.table("decisions").select("id").eq("application_id", _app("DEMO-CASE-H")["id"]) \
            .eq("status", "committed").limit(1).execute().data[0]
        try:
            clock.advance_days(15)
            asyncio.run(assurance_service.run_daily_post_decision_recheck())
        finally:
            clock.reset()
        flags = db.table("assurance_flags").select("check_type").eq("decision_id", dec["id"]).execute().data
        assert any(f["check_type"] == "post_decision_freshness" for f in flags)
        reports = db.table("assurance_reports").select("kind").eq("decision_id", dec["id"]).eq("kind", "post").execute().data
        assert reports
        alerts = db.table("alerts").select("id").eq("entity_type", "decision").eq("entity_id", dec["id"]).execute().data
        assert alerts

    def test_case_j_anomaly_flag(self, tokens):
        data = _draft(tokens["scrutiny"], "DEMO-CASE-J", "re_scrutiny")
        assert any(f["check_type"] == "anomaly" and "overrides" in f["message"] for f in data["flags"]), data["flags"]


# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------
class TestSecurity:
    def test_officer_routes_reject_token_without_mfa(self, tokens):
        r = client.get("/api/v1/applications", headers=_headers(tokens["mfa"]))
        assert r.status_code == 401 and r.json()["detail"] == "mfa_required"
        me = client.get("/api/v1/me", headers=_headers(tokens["mfa"])).json()
        assert me["mfa_required"] is True and me["aal"] == "aal1"

    def test_admin_has_no_case_access(self, tokens):
        h = _headers(tokens["admin"])
        app_id = _app("DEMO-CASE-G")["id"]
        assert client.get(f"/api/v1/applications/{app_id}", headers=h).status_code == 403
        assert client.post(f"/api/v1/applications/{app_id}/advance", json={}, headers=h).status_code == 403
        assert client.get("/api/v1/documents", headers=h).status_code == 403
        assert client.get("/api/v1/dashboard/admin", headers=h).status_code == 200

    def test_upload_rejects_disallowed_type_and_size(self, tokens):
        h = _headers(tokens["institution"])
        r = client.post("/api/v1/documents/upload", headers=h, data={"doc_type": "lease", "title": "Script"},
                        files={"file": ("lease.pdf", b"#!/bin/sh\necho hi\n", "application/pdf")})
        assert r.status_code == 415
        big = b"%PDF-1.4\n" + b"0" * (settings.MAX_UPLOAD_BYTES + 1)
        r = client.post("/api/v1/documents/upload", headers=h, data={"doc_type": "lease", "title": "Too big"},
                        files={"file": ("big.pdf", big, "application/pdf")})
        assert r.status_code == 413

    def test_institution_cannot_read_other_institutions_documents(self, tokens):
        g_inst = _app("DEMO-CASE-G")["institution_id"]
        other = db.table("documents").select("id").eq("institution_id", g_inst).limit(1).execute().data[0]
        h = _headers(tokens["institution"])
        assert client.get(f"/api/v1/documents/{other['id']}", headers=h).status_code == 404
        listed = client.get("/api/v1/documents", headers=h).json()
        assert all(d["institution_id"] != g_inst for d in listed)

    def test_maker_checker_blocks_self_approval(self, tokens):
        rules = client.get("/api/v1/admin/sla-rules", headers=_headers(tokens["admin"])).json()
        rule = next(r for r in rules if r.get("scope") == "stage" and r.get("stage_key") == "scrutiny")
        body = {k: rule.get(k) for k in ("id", "scope", "stage_key", "region_id", "template_id", "duration_days",
                                         "reminder_offsets_days", "is_active") if k in rule}
        r = client.put("/api/v1/admin/sla-rules", headers=_headers(tokens["admin"]), json=body)
        assert r.status_code == 202, r.text
        req_id = r.json()["approval_request"]["id"]
        # The rule is unchanged until a second administrator approves
        r = client.post(f"/api/v1/admin/approvals/{req_id}/approve", headers=_headers(tokens["admin"]), json={})
        assert r.status_code == 403
        r = client.post(f"/api/v1/admin/approvals/{req_id}/approve", headers=_headers(tokens["admin2"]), json={})
        assert r.status_code == 200, r.text
        assert r.json()["request"]["status"] == "approved"

    def test_login_lockout_after_repeated_failures(self):
        reset_rate_limits()
        email = f"lockout-{uuid.uuid4().hex[:6]}@demo.sih"
        for _ in range(settings.LOGIN_MAX_FAILURES):
            assert client.post("/api/v1/auth/login", json={"email": email, "password": "wrong"}).status_code == 401
        assert client.post("/api/v1/auth/login", json={"email": email, "password": "wrong"}).status_code == 423


# ---------------------------------------------------------------------------
# Upload, OCR, signed links and the access log
# ---------------------------------------------------------------------------
class TestDocuments:
    @pytest.fixture(scope="class")
    def uploaded(self, tokens):
        h = _headers(tokens["institution"])
        r = client.post("/api/v1/documents/upload", headers=h, data={"doc_type": "lease", "title": "Case I lease"},
                        files={"file": ("sample_lease.png", SAMPLE_LEASE.read_bytes(), "image/png")})
        assert r.status_code == 201, r.text
        return r.json()

    def test_upload_hashes_and_logs(self, uploaded):
        import hashlib
        assert uploaded["sha256"] == hashlib.sha256(SAMPLE_LEASE.read_bytes()).hexdigest()
        assert uploaded["storage_path"].startswith(uploaded["institution_id"] + "/")
        log = db.table("document_access_log").select("action").eq("document_id", uploaded["id"]).execute().data
        assert {"action": "upload"} in log

    def test_ocr_suggests_but_does_not_set_valid_until(self, uploaded):
        assert uploaded["ocr_status"] == "suggested"
        assert str(uploaded["ocr_suggested_expiry"]) == SAMPLE_LEASE_EXPIRY
        assert float(uploaded["ocr_confidence"]) > 0
        assert uploaded["valid_until"] is None

    def test_accept_sets_valid_until_and_is_audited(self, tokens, uploaded):
        r = client.post(f"/api/v1/documents/{uploaded['id']}/ocr/accept", headers=_headers(tokens["institution"]), json={})
        assert r.status_code == 200, r.text
        assert r.json()["valid_until"] == SAMPLE_LEASE_EXPIRY
        audit = db.table("audit_log").select("action").eq("entity_id", uploaded["id"]).execute().data
        assert any(a["action"] == "OCR_SUGGESTION_ACCEPTED" for a in audit)

    def test_signed_link_download_logged_and_tampering_rejected(self, tokens, uploaded):
        h = _headers(tokens["institution"])
        detail = client.get(f"/api/v1/documents/{uploaded['id']}", headers=h).json()
        url = detail["link"]["url"].replace(settings.API_PUBLIC_URL, "")
        r = client.get(url)
        assert r.status_code == 200 and r.content == SAMPLE_LEASE.read_bytes()
        actions = [a["action"] for a in db.table("document_access_log").select("action").eq("document_id", uploaded["id"]).execute().data]
        assert "view" in actions and "download" in actions

        assert client.get(url[:-4] + "0000").status_code == 403
        uid = detail["link"]["url"].split("uid=")[1].split("&")[0]
        exp = int(time.time()) - 10
        expired = f"/api/v1/documents/{uploaded['id']}/file?uid={uid}&exp={exp}&sig={storage._link_sig(uploaded['id'], uid, exp)}"
        assert client.get(expired).status_code == 403
        assert client.get(f"/api/v1/documents/{uploaded['id']}/file?uid={uid}&exp=0&sig=").status_code == 403


# ---------------------------------------------------------------------------
# EVC scheduling assistant
# ---------------------------------------------------------------------------
class TestEvcSuggestions:
    def test_suggestions_respect_weekends_availability_and_bookings(self, tokens):
        h = _headers(tokens["regional"])
        visit = db.table("evc_visits").select("id").eq("application_id", _app("DEMO-CASE-C")["id"]).limit(1).execute().data[0]
        data = client.get(f"/api/v1/evc/{visit['id']}/suggest-dates", headers=h).json()
        assert data["suggestions"], data
        for s in data["suggestions"]:
            d = date.fromisoformat(s["date"])
            assert d.weekday() < 5
            for m in s["members"]:
                row = db.table("evc_availability").select("available").eq("member_id", m["user_id"]).eq("day", s["date"]).execute().data
                assert row and row[0]["available"] is True

        # Book the first suggested member elsewhere on that day; the day must no longer use them
        first = data["suggestions"][0]
        member = first["members"][0]["user_id"]
        other_app = _app("DEMO-CASE-A")["id"]
        tmp = db.table("evc_visits").insert({
            "application_id": other_app, "status": "scheduled", "queued_at": clock.now().isoformat(),
            "scheduling_due_at": clock.now().isoformat(), "scheduled_for": f"{first['date']}T10:00:00+00:00",
            "committee_members": [member],
        }).execute().data[0]
        try:
            again = client.get(f"/api/v1/evc/{visit['id']}/suggest-dates", headers=h).json()["suggestions"]
            for s in again:
                if s["date"] == first["date"]:
                    assert member not in [m["user_id"] for m in s["members"]]
        finally:
            db.table("evc_visits").delete().eq("id", tmp["id"]).execute()


# ---------------------------------------------------------------------------
# Channels and delivery tracking
# ---------------------------------------------------------------------------
@pytest.fixture
def test_alert():
    app_id = _app("DEMO-CASE-A")["id"]
    alert = db.table("alerts").insert({
        "entity_type": "application_stage", "entity_id": app_id, "kind": "escalation", "level": 3,
        "severity": "critical", "message": "v2 channel test", "status": "resolved",
        "fired_at": clock.now().isoformat(), "cycle": f"test-{uuid.uuid4().hex}",
    }).execute().data[0]
    yield alert
    db.table("notifications").delete().eq("alert_id", alert["id"]).execute()
    db.table("alerts").delete().eq("id", alert["id"]).execute()


def _bureau_id():
    return db.table("profiles").select("user_id").eq("role", "bureau_officer").limit(1).execute().data[0]["user_id"]


class TestChannels:
    def test_level_3_creates_row_per_channel(self, test_alert):
        rows = notifier.dispatch_alert([_bureau_id()], "Escalation", "msg", test_alert["id"], "critical",
                                       channels=["in_app", "email", "sms", "whatsapp"], kind="escalation", reference_no="DEMO-CASE-A")
        assert sorted(r["channel"] for r in rows) == ["email", "in_app", "sms", "whatsapp"]
        external = [r for r in rows if r["channel"] != "in_app"]
        # Safe content: only the reference, alert type and link (§15.0)
        assert all("msg" not in (r["body"] or "") and "DEMO-CASE-A" in r["body"] for r in external)
        assert all(r["delivery_status"] in ("sent", "delivered") for r in rows)

    def test_failed_critical_delivery_falls_back(self, test_alert, monkeypatch):
        real = notifier.send_channel

        def failing(channel, *args, **kwargs):
            if channel == "email":
                raise notifier.DeliveryError("bounced")
            return real(channel, *args, **kwargs)
        monkeypatch.setattr(notifier, "send_channel", failing)
        rows = notifier.dispatch_alert([_bureau_id()], "Escalation", "msg", test_alert["id"], "critical",
                                       channels=["in_app", "email"], kind="escalation")
        by_channel = {r["channel"]: r for r in rows}
        assert by_channel["email"]["delivery_status"] == "failed"
        assert "sms" in by_channel

    def test_webhooks_update_delivery_status(self, test_alert, monkeypatch):
        monkeypatch.setattr(settings, "RESEND_WEBHOOK_SECRET", None)
        monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", None)
        uid = _bureau_id()
        sms = db.table("notifications").insert({"user_id": uid, "alert_id": test_alert["id"], "channel": "sms", "title": "t",
                                                "status": "sent", "delivery_status": "sent", "provider_ref": f"SM{uuid.uuid4().hex}"}).execute().data[0]
        mail = db.table("notifications").insert({"user_id": uid, "alert_id": test_alert["id"], "channel": "email", "title": "t",
                                                 "status": "sent", "delivery_status": "sent", "provider_ref": f"re_{uuid.uuid4().hex}"}).execute().data[0]
        r = client.post("/api/v1/webhooks/twilio", data={"MessageSid": sms["provider_ref"], "MessageStatus": "delivered"})
        assert r.status_code == 200 and r.json()["matched"]
        r = client.post("/api/v1/webhooks/resend", json={"type": "email.delivered", "data": {"email_id": mail["provider_ref"]}})
        assert r.status_code == 200 and r.json()["matched"]
        for n in (sms, mail):
            row = db.table("notifications").select("delivery_status, delivered_at").eq("id", n["id"]).execute().data[0]
            assert row["delivery_status"] == "delivered" and row["delivered_at"]
