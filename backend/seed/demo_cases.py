"""
Scripted demo cases (Section 9 of the spec).
Seeds Cases A through F relative to clock.now().
"""
from datetime import timedelta
import sys
from pathlib import Path

# Ensure backend root is in sys.path
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from supabase import create_client
from core.config import settings
from core import clock

_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def seed_scripted_cases():
    now = clock.now()
    print(f"Seeding scripted cases relative to current simulated clock: {now.isoformat()}")

    # 1. Fetch Western region & demo profiles
    western = _supabase.table("regions").select("id").eq("name", "Western").limit(1).execute()
    western_id = western.data[0]["id"] if western.data else None

    inst = _supabase.table("institutions").select("id").eq("aicte_id", "1-DEMO-001").limit(1).execute()
    if not inst.data:
        inst = _supabase.table("institutions").select("id").limit(1).execute()
    inst_id = inst.data[0]["id"] if inst.data else None

    scrutiny_user = _supabase.table("profiles").select("user_id").eq("role", "scrutiny_officer").eq("region_id", western_id).limit(1).execute()
    scrutiny_id = scrutiny_user.data[0]["user_id"] if scrutiny_user.data else None

    # Templates
    tmpl_scrutiny = _supabase.table("workflow_templates").select("id").eq("code", "ONLY_SCRUTINY").limit(1).execute()
    tmpl_scrutiny_id = tmpl_scrutiny.data[0]["id"] if tmpl_scrutiny.data else None

    tmpl_evc = _supabase.table("workflow_templates").select("id").eq("code", "SCRUTINY_EVC").limit(1).execute()
    tmpl_evc_id = tmpl_evc.data[0]["id"] if tmpl_evc.data else tmpl_scrutiny_id

    cases_created = {}

    # -------------------------------------------------------------
    # CASE A: Healthy application in scrutiny, entered 3 days ago
    # -------------------------------------------------------------
    case_a_payload = {
        "application_no": "DEMO-CASE-A",
        "institution_id": inst_id,
        "template_id": tmpl_scrutiny_id,
        "application_type": "extension_of_approval",
        "current_stage": "scrutiny",
        "status": "in_progress",
        "region_id": western_id,
        "assigned_to": scrutiny_id,
        "submitted_at": (now - timedelta(days=3)).isoformat(),
        "stage_entered_at": (now - timedelta(days=3)).isoformat(),
        "due_at": (now + timedelta(days=12)).isoformat(),
    }
    res_a = _supabase.table("applications").upsert(case_a_payload, on_conflict="application_no").execute()
    cases_created["A"] = res_a.data[0] if res_a.data else None

    # -------------------------------------------------------------
    # CASE B: Scrutiny entered 13 days ago, due in 2 days (Time-Travel case!)
    # -------------------------------------------------------------
    case_b_payload = {
        "application_no": "DEMO-CASE-B",
        "institution_id": inst_id,
        "template_id": tmpl_scrutiny_id,
        "application_type": "extension_of_approval",
        "current_stage": "scrutiny",
        "status": "in_progress",
        "region_id": western_id,
        "assigned_to": scrutiny_id,
        "submitted_at": (now - timedelta(days=13)).isoformat(),
        "stage_entered_at": (now - timedelta(days=13)).isoformat(),
        "due_at": (now + timedelta(days=2)).isoformat(),
    }
    res_b = _supabase.table("applications").upsert(case_b_payload, on_conflict="application_no").execute()
    cases_created["B"] = res_b.data[0] if res_b.data else None

    # -------------------------------------------------------------
    # CASE C: EVC queued 28 days ago, scheduling due in 2 days
    # -------------------------------------------------------------
    case_c_payload = {
        "application_no": "DEMO-CASE-C",
        "institution_id": inst_id,
        "template_id": tmpl_evc_id,
        "application_type": "new_institution",
        "current_stage": "evc_queue",
        "status": "in_progress",
        "region_id": western_id,
        "submitted_at": (now - timedelta(days=40)).isoformat(),
        "stage_entered_at": (now - timedelta(days=28)).isoformat(),
        "due_at": (now + timedelta(days=2)).isoformat(),
    }
    res_c = _supabase.table("applications").upsert(case_c_payload, on_conflict="application_no").execute()
    c_app = res_c.data[0] if res_c.data else None
    cases_created["C"] = c_app

    if c_app:
        evc_payload = {
            "application_id": c_app["id"],
            "status": "queued",
            "queued_at": (now - timedelta(days=28)).isoformat(),
            "scheduling_due_at": (now + timedelta(days=2)).isoformat(),
            "completion_due_at": (now + timedelta(days=17)).isoformat()
        }
        # Check existing evc
        existing_evc = _supabase.table("evc_visits").select("id").eq("application_id", c_app["id"]).execute()
        if existing_evc.data:
            _supabase.table("evc_visits").update(evc_payload).eq("id", existing_evc.data[0]["id"]).execute()
        else:
            _supabase.table("evc_visits").insert(evc_payload).execute()

    # -------------------------------------------------------------
    # CASE D: Undertaking for demo institution, due in 5 days
    # -------------------------------------------------------------
    if inst_id:
        existing_ut = _supabase.table("undertakings").select("id").eq("title", "DEMO-CASE-D Land Compliance Undertaking").execute()
        ut_payload = {
            "institution_id": inst_id,
            "title": "DEMO-CASE-D Land Compliance Undertaking",
            "description": "Provide registered land deed certificate verification within 30 days.",
            "due_at": (now + timedelta(days=5)).isoformat(),
            "status": "pending"
        }
        if existing_ut.data:
            _supabase.table("undertakings").update(ut_payload).eq("id", existing_ut.data[0]["id"]).execute()
        else:
            _supabase.table("undertakings").insert(ut_payload).execute()
        cases_created["D"] = ut_payload

    # -------------------------------------------------------------
    # CASE E: Documents (Lease expiring in 28d, and second expired 10d ago)
    # -------------------------------------------------------------
    if inst_id:
        # Document 1: Expiring in 28 days
        doc1_payload = {
            "institution_id": inst_id,
            "doc_type": "lease",
            "title": "Campus Lease Deed 2026",
            "storage_path": "documents/sample_lease.pdf",
            "status": "active",
            "valid_until": (now + timedelta(days=28)).date().isoformat()
        }
        d1 = _supabase.table("documents").select("id").eq("title", "Campus Lease Deed 2026").execute()
        if d1.data:
            _supabase.table("documents").update(doc1_payload).eq("id", d1.data[0]["id"]).execute()
        else:
            _supabase.table("documents").insert(doc1_payload).execute()

        # Document 2: Expired 10 days ago
        doc2_payload = {
            "institution_id": inst_id,
            "doc_type": "lease",
            "title": "Fire Safety NOC 2025",
            "storage_path": "documents/sample_fire_noc.pdf",
            "status": "expired",
            "valid_until": (now - timedelta(days=10)).date().isoformat()
        }
        d2 = _supabase.table("documents").select("id").eq("title", "Fire Safety NOC 2025").execute()
        if d2.data:
            _supabase.table("documents").update(doc2_payload).eq("id", d2.data[0]["id"]).execute()
        else:
            _supabase.table("documents").insert(doc2_payload).execute()

        cases_created["E"] = {"doc1": doc1_payload, "doc2": doc2_payload}

    # -------------------------------------------------------------
    # CASE F: Returned application awaiting institution response, due in 4 days
    # -------------------------------------------------------------
    case_f_payload = {
        "application_no": "DEMO-CASE-F",
        "institution_id": inst_id,
        "template_id": tmpl_scrutiny_id,
        "application_type": "extension_of_approval",
        "current_stage": "institution_response",
        "status": "returned",
        "region_id": western_id,
        "assigned_to": None,
        "submitted_at": (now - timedelta(days=15)).isoformat(),
        "stage_entered_at": (now - timedelta(days=3)).isoformat(),
        "due_at": (now + timedelta(days=4)).isoformat(),
    }
    res_f = _supabase.table("applications").upsert(case_f_payload, on_conflict="application_no").execute()
    cases_created["F"] = res_f.data[0] if res_f.data else None

    print("Scripted cases A through F successfully initialized.")
    return cases_created


if __name__ == "__main__":
    seed_scripted_cases()
