import pytest
from fastapi.testclient import TestClient
from main import app
from core.config import settings
from supabase import create_client

client = TestClient(app)

def test_demo_accounts_login_and_me():
    anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqbGt4bW9kanBjenlhYnp3c3FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMjkxNzYsImV4cCI6MjEwODYwNTE3Nn0.61j2LUZ31YT3GF1qK6oBk-nHrUQAherjlyoHguI9uy4"
    sb = create_client(settings.SUPABASE_URL, anon_key)

    demo_cases = [
        ("institution@demo.sih", "institution"),
        ("scrutiny@demo.sih", "scrutiny_officer"),
        ("regional@demo.sih", "regional_officer"),
        ("evc@demo.sih", "evc_member"),
        ("bureau@demo.sih", "bureau_officer"),
        ("admin@demo.sih", "admin"),
    ]

    for email, expected_role in demo_cases:
        auth_res = sb.auth.sign_in_with_password({"email": email, "password": "password123"})
        assert auth_res.session is not None
        token = auth_res.session.access_token

        me_res = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200
        data = me_res.json()
        assert data["email"] == email
        assert data["role"] == expected_role
