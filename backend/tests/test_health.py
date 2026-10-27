from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_api_health():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_demo_accounts():
    response = client.get("/api/v1/demo/accounts")
    assert response.status_code == 200
    accounts = response.json()
    roles = {acc["role"] for acc in accounts}
    expected_roles = {"institution", "scrutiny_officer", "regional_officer", "evc_member", "sac_shc_member",
                      "bureau_officer", "auditor", "admin"}
    assert roles == expected_roles
    # One officer account demonstrates the full MFA flow (§15.9)
    assert [a["email"] for a in accounts if a["mfa"]] == ["mfa.officer@demo.sih"]
