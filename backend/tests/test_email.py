import pytest
import hmac
import hashlib
from fastapi.testclient import TestClient
from main import app
from core import clock
from core.config import settings
from services.email import generate_signed_ack_url, verify_ack_signature, send_email, notice_html, send_daily_digest
from core.security import supabase_admin

client = TestClient(app)

def test_generate_and_verify_signed_ack():
    alert_id = "test-alert-123"
    user_id = "test-user-456"
    
    url = generate_signed_ack_url(alert_id, user_id, expires_in_days=7)
    assert url is not None
    assert "/alerts/ack?" in url
    assert f"alert_id={alert_id}" in url
    assert f"user_id={user_id}" in url
    assert "sig=" in url
    assert "exp=" in url
    
    # Extract params
    from urllib.parse import urlparse, parse_qs
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    
    exp = int(qs["exp"][0])
    sig = qs["sig"][0]
    
    # Verify valid signature
    is_valid = verify_ack_signature(alert_id, user_id, exp, sig)
    assert is_valid is True

def test_expired_signed_ack():
    alert_id = "test-alert-expired"
    user_id = "test-user-expired"
    
    # Simulate an expired timestamp
    past_exp = int(clock.now().timestamp()) - 3600
    secret = settings.SUPABASE_JWT_SECRET or "aicte-secret-key-for-hmac-signatures"
    sig = hmac.new(secret.encode(), f"{alert_id}:{user_id}:{past_exp}".encode(), hashlib.sha256).hexdigest()
    
    is_valid = verify_ack_signature(alert_id, user_id, past_exp, sig)
    assert is_valid is False

def test_tampered_signature():
    alert_id = "test-alert-tamper"
    user_id = "test-user-tamper"
    exp = int(clock.now().timestamp()) + 3600
    
    tampered_sig = "deadbeef12345678" * 4
    is_valid = verify_ack_signature(alert_id, user_id, exp, tampered_sig)
    assert is_valid is False

def test_ack_by_token_endpoint():
    supabase = supabase_admin
    
    # Fetch an existing alert or skip
    res = supabase.table("alerts").select("*").limit(1).execute()
    if not res.data:
        pytest.skip("No alerts found in test database to acknowledge")
        
    alert = res.data[0]
    alert_id = alert["id"]
    user_id = alert.get("user_id") or "00000000-0000-0000-0000-000000000000"
    
    exp = int(clock.now().timestamp()) + 3600
    secret = settings.SUPABASE_JWT_SECRET or "aicte-secret-key-for-hmac-signatures"
    sig = hmac.new(secret.encode(), f"{alert_id}:{user_id}:{exp}".encode(), hashlib.sha256).hexdigest()
    
    payload = {
        "alert_id": alert_id,
        "user_id": user_id,
        "exp": exp,
        "sig": sig,
        "notes": "Automated test 1-click ack"
    }
    
    response = client.post("/api/v1/alerts/ack-by-token", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data.get("ok") is True
    assert data["alert"]["id"] == alert_id

def test_alert_email_mock_carries_only_safe_content():
    # Alert emails carry the reference, alert type and signed link, escaped (§15.0)
    html = notice_html("Escalation notice: APP-1", "Reference APP-1 <b>x</b>", "http://x/ack?a=1&b=2")
    assert "&lt;b&gt;" in html and "a=1&amp;b=2" in html
    res = send_email("regional.officer@aicte.gov.in", "Escalation notice: APP-1", html)
    assert res.get("status") == "sent" and res.get("id")
