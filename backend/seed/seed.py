import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Ensure backend root is in sys.path
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

load_dotenv(backend_root / ".env")

from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "password123")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in backend/.env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

REGIONS = [
    "Western",
    "Northern",
    "North-Western",
    "Central",
    "South-Western",
    "Southern",
    "Eastern"
]

TEMPLATES = [
    {
        "code": "SCRUTINY_EVC",
        "name": "Scrutiny and EVC Process",
        "definition": {
            "code": "SCRUTINY_EVC",
            "start": "scrutiny",
            "stages": {
                "scrutiny": {
                    "label": "Scrutiny",
                    "sla_days": 15,
                    "owner_role": "scrutiny_officer",
                    "next": "evc_queue",
                    "on_return": "institution_response"
                },
                "institution_response": {
                    "label": "Institution Response",
                    "sla_days": 7,
                    "owner_role": "institution",
                    "next": "re_scrutiny"
                },
                "re_scrutiny": {
                    "label": "Re-scrutiny",
                    "sla_days": 10,
                    "owner_role": "scrutiny_officer",
                    "next": "evc_queue",
                    "on_return": "institution_response"
                },
                "evc_queue": {
                    "label": "EVC Queue",
                    "sla_days": 30,
                    "owner_role": "regional_officer",
                    "next": "evc_visit",
                    "creates": "evc_visit"
                },
                "evc_visit": {
                    "label": "EVC Visit",
                    "sla_days": 15,
                    "owner_role": "evc_member",
                    "next": "final_decision"
                },
                "final_decision": {
                    "label": "Final Decision",
                    "sla_days": 20,
                    "owner_role": "bureau_officer",
                    "next": None
                }
            }
        }
    },
    {
        "code": "ONLY_SCRUTINY",
        "name": "Only Scrutiny Process",
        "definition": {
            "code": "ONLY_SCRUTINY",
            "start": "scrutiny",
            "stages": {
                "scrutiny": {
                    "label": "Scrutiny",
                    "sla_days": 15,
                    "owner_role": "scrutiny_officer",
                    "next": "final_decision",
                    "on_return": "institution_response"
                },
                "institution_response": {
                    "label": "Institution Response",
                    "sla_days": 7,
                    "owner_role": "institution",
                    "next": "re_scrutiny"
                },
                "re_scrutiny": {
                    "label": "Re-scrutiny",
                    "sla_days": 10,
                    "owner_role": "scrutiny_officer",
                    "next": "final_decision",
                    "on_return": "institution_response"
                },
                "final_decision": {
                    "label": "Final Decision",
                    "sla_days": 20,
                    "owner_role": "bureau_officer",
                    "next": None
                }
            }
        }
    },
    {
        "code": "EVC_SAC_SHC",
        "name": "EVC and SAC/SHC Process",
        "definition": {
            "code": "EVC_SAC_SHC",
            "start": "evc_queue",
            "stages": {
                "evc_queue": {
                    "label": "EVC Queue",
                    "sla_days": 30,
                    "owner_role": "regional_officer",
                    "next": "evc_visit",
                    "creates": "evc_visit"
                },
                "evc_visit": {
                    "label": "EVC Visit",
                    "sla_days": 15,
                    "owner_role": "evc_member",
                    "next": "sac_shc"
                },
                "sac_shc": {
                    "label": "SAC/SHC Committee",
                    "sla_days": 20,
                    "owner_role": "bureau_officer",
                    "next": "final_decision"
                },
                "final_decision": {
                    "label": "Final Decision",
                    "sla_days": 20,
                    "owner_role": "bureau_officer",
                    "next": None
                }
            }
        }
    },
    {
        "code": "ONLY_EVC",
        "name": "Only EVC Process",
        "definition": {
            "code": "ONLY_EVC",
            "start": "evc_queue",
            "stages": {
                "evc_queue": {
                    "label": "EVC Queue",
                    "sla_days": 30,
                    "owner_role": "regional_officer",
                    "next": "evc_visit",
                    "creates": "evc_visit"
                },
                "evc_visit": {
                    "label": "EVC Visit",
                    "sla_days": 15,
                    "owner_role": "evc_member",
                    "next": "final_decision"
                },
                "final_decision": {
                    "label": "Final Decision",
                    "sla_days": 20,
                    "owner_role": "bureau_officer",
                    "next": None
                }
            }
        }
    }
]

def seed_regions():
    print("Seeding regions...")
    region_map = {}
    for r_name in REGIONS:
        existing = supabase.table("regions").select("*").eq("name", r_name).execute()
        if existing.data and len(existing.data) > 0:
            region_map[r_name] = existing.data[0]["id"]
        else:
            inserted = supabase.table("regions").insert({"name": r_name}).execute()
            if inserted.data:
                region_map[r_name] = inserted.data[0]["id"]
    print(f"Regions seeded: {len(region_map)}")
    return region_map

def seed_templates():
    print("Seeding workflow templates...")
    for tmpl in TEMPLATES:
        existing = supabase.table("workflow_templates").select("*").eq("code", tmpl["code"]).execute()
        if not existing.data:
            supabase.table("workflow_templates").insert(tmpl).execute()
    print("Workflow templates seeded.")

def seed_institutions(region_map):
    print("Seeding institutions...")
    western_id = region_map.get("Western")
    primary_inst = {
        "name": "Demo Institute of Technology",
        "aicte_id": "1-DEMO-001",
        "state": "Maharashtra",
        "city": "Mumbai",
        "region_id": western_id,
        "kind": "existing",
        "contact_email": "institution@demo.sih",
        "health_score": 100
    }
    existing = supabase.table("institutions").select("*").eq("aicte_id", primary_inst["aicte_id"]).execute()
    primary_id = None
    if existing.data and len(existing.data) > 0:
        primary_id = existing.data[0]["id"]
    else:
        inserted = supabase.table("institutions").insert(primary_inst).execute()
        if inserted.data:
            primary_id = inserted.data[0]["id"]

    # Seed additional sample institutions across regions
    sample_colleges = [
        ("Pune Engineering College", "1-PUN-002", "Maharashtra", "Pune", "Western"),
        ("Gujarat Institute of Science", "1-GUJ-003", "Gujarat", "Ahmedabad", "Western"),
        ("Delhi National Institute", "1-DEL-004", "Delhi", "New Delhi", "Northern"),
        ("Punjab Technical University Demo", "1-PUN-005", "Punjab", "Chandigarh", "North-Western"),
        ("Bhopal Central Polytechnic", "1-BHO-006", "Madhya Pradesh", "Bhopal", "Central"),
        ("Bangalore Institute of Advanced Tech", "1-BLR-007", "Karnataka", "Bengaluru", "South-Western"),
        ("Chennai College of Engineering", "1-CHN-008", "Tamil Nadu", "Chennai", "Southern"),
        ("Kolkata Institute of Technology", "1-KOL-009", "West Bengal", "Kolkata", "Eastern"),
    ]
    for name, aicte_id, state, city, reg_name in sample_colleges:
        reg_id = region_map.get(reg_name)
        inst_check = supabase.table("institutions").select("id").eq("aicte_id", aicte_id).execute()
        if not inst_check.data:
            supabase.table("institutions").insert({
                "name": name,
                "aicte_id": aicte_id,
                "state": state,
                "city": city,
                "region_id": reg_id,
                "kind": "existing",
                "health_score": 90
            }).execute()

    print(f"Primary institution seeded: {primary_id}")
    return primary_id

def create_or_get_user(email: str, password: str, metadata: dict):
    # Try to find existing user
    users = supabase.auth.admin.list_users()
    target_user = None
    for u in users:
        if u.email == email:
            target_user = u
            break

    if target_user:
        # Update user app_metadata and password
        supabase.auth.admin.update_user_by_id(
            target_user.id,
            {
                "password": password,
                "app_metadata": metadata,
                "user_metadata": metadata
            }
        )
        return target_user.id
    else:
        new_u = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "app_metadata": metadata,
            "user_metadata": metadata
        })
        return new_u.user.id

def seed_demo_accounts(region_map, primary_institution_id):
    print("Seeding demo accounts...")
    western_id = region_map.get("Western")

    demo_users = [
        {
            "email": "institution@demo.sih",
            "full_name": "Demo Institute Principal",
            "role": "institution",
            "region_id": western_id,
            "institution_id": primary_institution_id,
        },
        {
            "email": "scrutiny@demo.sih",
            "full_name": "Western Scrutiny Officer",
            "role": "scrutiny_officer",
            "region_id": western_id,
            "institution_id": None,
        },
        {
            "email": "regional@demo.sih",
            "full_name": "Western Regional Officer",
            "role": "regional_officer",
            "region_id": western_id,
            "institution_id": None,
        },
        {
            "email": "evc@demo.sih",
            "full_name": "Western EVC Member",
            "role": "evc_member",
            "region_id": western_id,
            "institution_id": None,
        },
        {
            "email": "bureau@demo.sih",
            "full_name": "AICTE Bureau Officer",
            "role": "bureau_officer",
            "region_id": None,
            "institution_id": None,
        },
        {
            "email": "admin@demo.sih",
            "full_name": "System Administrator",
            "role": "admin",
            "region_id": None,
            "institution_id": None,
        }
    ]

    for d in demo_users:
        metadata = {
            "role": d["role"],
            "region_id": d["region_id"],
            "institution_id": d["institution_id"],
            "full_name": d["full_name"]
        }
        user_id = create_or_get_user(d["email"], DEMO_PASSWORD, metadata)
        print(f"User {d['email']} created/updated with ID: {user_id}")

        # Update or insert into public.profiles
        prof = supabase.table("profiles").select("*").eq("user_id", user_id).execute()
        prof_data = {
            "user_id": user_id,
            "full_name": d["full_name"],
            "role": d["role"],
            "region_id": d["region_id"],
            "institution_id": d["institution_id"],
            "locale": "en"
        }
        if prof.data and len(prof.data) > 0:
            supabase.table("profiles").update(prof_data).eq("user_id", user_id).execute()
        else:
            supabase.table("profiles").insert(prof_data).execute()

    print("Demo accounts and profiles seeded successfully.")

def seed_rules_and_chains(region_map):
    print("Seeding default SLA rules and escalation chains...")
    # Escalation chain
    existing_chain = supabase.table("escalation_chains").select("id").eq("scope", "application_stage").execute()
    if not existing_chain.data:
        supabase.table("escalation_chains").insert({
            "scope": "application_stage",
            "levels": [
                {"level": 1, "after_days_overdue": 0, "notify_role": "assigned_officer"},
                {"level": 2, "after_days_overdue": 3, "notify_role": "regional_officer"},
                {"level": 3, "after_days_overdue": 7, "notify_role": "bureau_officer"}
            ],
            "ack_timeout_hours": 48
        }).execute()

    # Default SLA Rules
    existing_rules = supabase.table("sla_rules").select("id").execute()
    if not existing_rules.data:
        rules = [
            {"scope": "stage", "stage_key": "scrutiny", "duration_days": 15, "reminder_offsets_days": [7, 3, 1]},
            {"scope": "stage", "stage_key": "institution_response", "duration_days": 7, "reminder_offsets_days": [5, 2, 1]},
            {"scope": "stage", "stage_key": "re_scrutiny", "duration_days": 10, "reminder_offsets_days": [5, 2, 1]},
            {"scope": "evc_scheduling", "stage_key": "evc_queue", "duration_days": 30, "reminder_offsets_days": [10, 5, 2]},
            {"scope": "evc_completion", "stage_key": "evc_visit", "duration_days": 15, "reminder_offsets_days": [7, 3, 1]},
            {"scope": "stage", "stage_key": "final_decision", "duration_days": 20, "reminder_offsets_days": [7, 3, 1]},
            {"scope": "undertaking", "duration_days": 30, "reminder_offsets_days": [10, 5, 2]},
            {"scope": "document_expiry", "duration_days": 90, "reminder_offsets_days": [90, 60, 30, 7]},
        ]
        supabase.table("sla_rules").insert(rules).execute()
    print("SLA rules and escalation chains seeded.")

def run_seed():
    print("=== Starting SIH26262 Database Seed ===")
    region_map = seed_regions()
    seed_templates()
    primary_inst_id = seed_institutions(region_map)
    seed_demo_accounts(region_map, primary_inst_id)
    seed_rules_and_chains(region_map)
    print("=== Seeding Complete ===")

if __name__ == "__main__":
    run_seed()
