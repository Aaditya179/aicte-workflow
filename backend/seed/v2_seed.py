"""
Seed data for the v2 additions (§15.9).

- Accounts: auditor, SAC/SHC member, a second administrator (maker-checker) and two more EVC
  members, each EVC member with a different base city.
- Reference data: mandatory_evidence, message_templates (English and Hindi), channels on the
  escalation chain, and the SAC/SHC stage owned by the SAC/SHC member.
- Time-relative data: EVC availability and cases G, H, I and J.

`seed_v2_reference(region_map)` runs from seed.py; `seed_v2_cases()` runs with the scripted
cases, since it is relative to the simulated clock.
"""
from datetime import timedelta
from pathlib import Path
import hashlib
import sys

backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from supabase import create_client

from core import clock
from core.config import settings

_supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
DATA_DIR = Path(__file__).resolve().parent / "data"
SAMPLE_LEASE = DATA_DIR / "sample_lease.png"
SAMPLE_LEASE_EXPIRY = "2028-03-31"

V2_ACCOUNTS = [
    {"email": "auditor@demo.sih", "full_name": "Internal Auditor", "role": "auditor", "region": None},
    {"email": "sacshc@demo.sih", "full_name": "SAC/SHC Committee Member", "role": "sac_shc_member", "region": None},
    {"email": "admin2@demo.sih", "full_name": "Second Administrator", "role": "admin", "region": None},
    {"email": "mfa.officer@demo.sih", "full_name": "Western Regional Officer (MFA)", "role": "regional_officer", "region": "Western"},
    {"email": "evc2@demo.sih", "full_name": "Pune EVC Member", "role": "evc_member", "region": "Western", "base_city": "Pune"},
    {"email": "evc3@demo.sih", "full_name": "Ahmedabad EVC Member", "role": "evc_member", "region": "Western", "base_city": "Ahmedabad"},
]
# Existing accounts that get contact details and a base city
EXTRA_PROFILE_FIELDS = {
    "evc@demo.sih": {"base_city": "Mumbai", "phone": "+919800000004"},
    "scrutiny@demo.sih": {"phone": "+919800000002"},
    "regional@demo.sih": {"phone": "+919800000003"},
    "bureau@demo.sih": {"phone": "+919800000005", "bureau": "Approval Bureau"},
    "institution@demo.sih": {"phone": "+919800000001"},
    "evc2@demo.sih": {"phone": "+919800000006"},
    "evc3@demo.sih": {"phone": "+919800000007"},
    "sacshc@demo.sih": {"phone": "+919800000008"},
    "mfa.officer@demo.sih": {"phone": "+919800000009"},
    "admin@demo.sih": {"phone": "+919800000010"},
    "admin2@demo.sih": {"phone": "+919800000011"},
    "auditor@demo.sih": {"phone": "+919800000012"},
}

CHAIN_CHANNELS = {1: ["in_app", "email"], 2: ["in_app", "email", "sms"], 3: ["in_app", "email", "sms", "whatsapp"]}

EVC_TEMPLATES = ("SCRUTINY_EVC", "EVC_SAC_SHC", "ONLY_EVC")
MANDATORY_EVIDENCE = (
    [{"template_code": t, "stage_key": "evc_visit", "doc_type": "evc_report", "label": "EVC inspection report"} for t in EVC_TEMPLATES]
    + [{"template_code": t, "stage_key": "final_decision", "doc_type": d, "label": l}
       for t in EVC_TEMPLATES + ("ONLY_SCRUTINY",)
       for d, l in (("lease", "Verified land or building lease"), ("application_form", "Verified application form"))]
    + [{"template_code": t, "stage_key": "final_decision", "doc_type": "evc_report", "label": "EVC inspection report"} for t in EVC_TEMPLATES]
    + [{"template_code": t, "stage_key": s, "doc_type": "application_form", "label": "Verified application form"}
       for t in ("SCRUTINY_EVC", "ONLY_SCRUTINY") for s in ("scrutiny", "re_scrutiny")]
)

# Alert templates (deadline_reminder, escalation_notice, renewal_request) carry only safe
# placeholders: reference, alert type, due date and the signed link (§15.0).
MESSAGE_TEMPLATES = {
    "en": {
        "acknowledgement": ("Application {{reference_no}} received",
            "Dear {{institution_name}},\n\nWe acknowledge receipt of application {{reference_no}}. It is now at the {{stage}} stage. "
            "You can follow its progress at {{link}}.\n\nRegards,\n{{officer_name}}\nAICTE"),
        "deficiency_letter": ("Deficiency in application {{reference_no}}",
            "Dear {{institution_name}},\n\nOn review of application {{reference_no}}, the following deficiencies were found:\n\n"
            "1. [describe the deficiency]\n\nPlease submit the documents by {{due_date}} at {{link}}. If no response is received "
            "by then, the application will be processed on the available record.\n\nRegards,\n{{officer_name}}\nAICTE"),
        "deadline_reminder": ("Nirikshan reminder: {{reference_no}}",
            "Nirikshan {{alert_type}} for reference {{reference_no}}, due {{due_date}}. Sign in to view details: {{link}}"),
        "escalation_notice": ("Nirikshan escalation: {{reference_no}}",
            "Nirikshan {{alert_type}} for reference {{reference_no}}. Action is needed. Sign in to view details: {{link}}"),
        "renewal_request": ("Nirikshan renewal due: {{reference_no}}",
            "Nirikshan {{alert_type}} for reference {{reference_no}}, due {{due_date}}. Sign in to upload the renewal: {{link}}"),
        "undertaking_notice": ("Undertaking due for {{reference_no}}",
            "Dear {{institution_name}},\n\nAn undertaking given with application {{reference_no}} is due on {{due_date}}. "
            "Please upload the supporting evidence at {{link}}.\n\nRegards,\n{{officer_name}}\nAICTE"),
    },
    "hi": {
        "acknowledgement": ("आवेदन {{reference_no}} प्राप्त हुआ",
            "प्रिय {{institution_name}},\n\nहम आवेदन {{reference_no}} की प्राप्ति की पुष्टि करते हैं। यह अभी {{stage}} चरण में है। "
            "आप इसकी प्रगति {{link}} पर देख सकते हैं।\n\nसादर,\n{{officer_name}}\nएआईसीटीई"),
        "deficiency_letter": ("आवेदन {{reference_no}} में कमियाँ",
            "प्रिय {{institution_name}},\n\nआवेदन {{reference_no}} की समीक्षा में निम्नलिखित कमियाँ पाई गईं:\n\n"
            "1. [कमी का विवरण लिखें]\n\nकृपया {{due_date}} तक दस्तावेज़ {{link}} पर जमा करें। तब तक उत्तर न मिलने पर "
            "आवेदन उपलब्ध अभिलेख के आधार पर संसाधित किया जाएगा।\n\nसादर,\n{{officer_name}}\nएआईसीटीई"),
        "deadline_reminder": ("Nirikshan अनुस्मारक: {{reference_no}}",
            "Nirikshan: संदर्भ {{reference_no}} के लिए {{alert_type}}, नियत तिथि {{due_date}}। विवरण देखने के लिए साइन इन करें: {{link}}"),
        "escalation_notice": ("Nirikshan एस्केलेशन: {{reference_no}}",
            "Nirikshan: संदर्भ {{reference_no}} के लिए {{alert_type}}। कार्रवाई आवश्यक है। विवरण देखने के लिए साइन इन करें: {{link}}"),
        "renewal_request": ("Nirikshan नवीनीकरण: {{reference_no}}",
            "Nirikshan: संदर्भ {{reference_no}} के लिए {{alert_type}}, नियत तिथि {{due_date}}। नवीनीकरण अपलोड करने के लिए साइन इन करें: {{link}}"),
        "undertaking_notice": ("{{reference_no}} के लिए वचनबद्धता देय",
            "प्रिय {{institution_name}},\n\nआवेदन {{reference_no}} के साथ दी गई वचनबद्धता {{due_date}} को देय है। "
            "कृपया सहायक साक्ष्य {{link}} पर अपलोड करें।\n\nसादर,\n{{officer_name}}\nएआईसीटीई"),
    },
}
SHORT_CHANNEL_CODES = ("deadline_reminder", "escalation_notice", "renewal_request")


def _one(table: str, **eq):
    q = _supabase.table(table).select("*")
    for k, v in eq.items():
        q = q.eq(k, v)
    res = q.limit(1).execute().data
    return res[0] if res else None


def _profile_by_email(email: str):
    from seed.seed import find_user_id
    uid = find_user_id(email)
    return _one("profiles", user_id=uid) if uid else None


# ---------------------------------------------------------------------------
# Accounts and reference data
# ---------------------------------------------------------------------------
def seed_v2_accounts(region_map):
    from seed.seed import upsert_account
    for acc in V2_ACCOUNTS:
        upsert_account(acc["email"], acc["full_name"], acc["role"],
                       region_map.get(acc["region"]) if acc["region"] else None, None)
    for email, fields in EXTRA_PROFILE_FIELDS.items():
        prof = _profile_by_email(email)
        if prof:
            _supabase.table("profiles").update(fields).eq("user_id", prof["user_id"]).execute()
    for acc in V2_ACCOUNTS:
        if acc.get("base_city"):
            prof = _profile_by_email(acc["email"])
            _supabase.table("profiles").update({"base_city": acc["base_city"]}).eq("user_id", prof["user_id"]).execute()
    print(f"v2 accounts seeded: {', '.join(a['email'] for a in V2_ACCOUNTS)}")


def seed_v2_reference():
    # Mandatory evidence: replaced wholesale so the list matches this file
    _supabase.table("mandatory_evidence").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    _supabase.table("mandatory_evidence").insert(MANDATORY_EVIDENCE).execute()

    rows = []
    for locale, templates in MESSAGE_TEMPLATES.items():
        for code, (subject, body) in templates.items():
            rows.append({"code": code, "channel": "email", "locale": locale, "subject": subject, "body": body})
            rows.append({"code": code, "channel": "in_app", "locale": locale, "subject": subject, "body": body})
            if code in SHORT_CHANNEL_CODES:
                for ch in ("sms", "whatsapp"):
                    rows.append({"code": code, "channel": ch, "locale": locale, "subject": None, "body": body})
    _supabase.table("message_templates").upsert(rows, on_conflict="code,channel,locale").execute()

    # Channels per escalation level on every chain (§15.5)
    for chain in _supabase.table("escalation_chains").select("*").execute().data or []:
        levels = [{**l, "channels": l.get("channels") or CHAIN_CHANNELS.get(l.get("level"), ["in_app", "email"])}
                  for l in chain.get("levels") or []]
        _supabase.table("escalation_chains").update({"levels": levels}).eq("id", chain["id"]).execute()

    # The SAC/SHC stage belongs to the SAC/SHC member (§15.0 roles)
    tmpl = _one("workflow_templates", code="EVC_SAC_SHC")
    if tmpl:
        definition = tmpl["definition"]
        stage = definition.get("stages", {}).get("sac_shc")
        if stage and stage.get("owner_role") != "sac_shc_member":
            stage["owner_role"] = "sac_shc_member"
            _supabase.table("workflow_templates").update({"definition": definition}).eq("id", tmpl["id"]).execute()

    make_sample_lease()
    print(f"v2 reference data seeded: {len(MANDATORY_EVIDENCE)} mandatory evidence rows, {len(rows)} message templates")


def make_sample_lease(path: Path = SAMPLE_LEASE) -> Path:
    """
    Sample lease for the OCR demo (Case I): the expiry date is printed on the image for a vision
    model and also stored in PNG text chunks, which the offline mock OCR reads.
    """
    from PIL import Image, ImageDraw, ImageFont
    from PIL.PngImagePlugin import PngInfo

    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(img)
    try:
        font_title = ImageFont.truetype("DejaVuSans-Bold.ttf", 44)
        font = ImageFont.truetype("DejaVuSans.ttf", 30)
    except OSError:
        font_title = font = ImageFont.load_default(size=36)
    evidence = f"This lease shall remain valid until {SAMPLE_LEASE_EXPIRY} (31 March 2028)."
    lines = [
        ("LEASE DEED", font_title),
        ("", font),
        ("Lessor: Maharashtra Industrial Land Trust", font),
        ("Lessee: Demo Institute of Technology", font),
        ("Premises: Plot 14, Sector 7, Navi Mumbai, Maharashtra", font),
        ("Survey No. 112/3, Village Ghansoli", font),
        ("Land area: 10.5 acres", font),
        ("", font),
        ("Commencement: 1 April 2023", font),
        (evidence, font),
        ("", font),
        ("The lessee shall use the premises for a technical institution only.", font),
        ("", font),
        ("Signed and registered at Sub-Registrar Office, Thane.", font),
        ("SAMPLE DOCUMENT FOR DEMONSTRATION ONLY", font),
    ]
    y = 140
    for text, f in lines:
        draw.text((110, y), text, fill="black", font=f)
        y += 70 if text else 40
    draw.rectangle([80, 100, 1160, y + 40], outline="black", width=3)

    info = PngInfo()
    info.add_text("expiry_date", SAMPLE_LEASE_EXPIRY)
    info.add_text("evidence_text", evidence)
    info.add_text("institution_name", "Demo Institute of Technology")
    info.add_text("land_area", "10.5 acres")
    info.add_text("survey_number", "Survey No. 112/3")
    info.add_text("start_date", "2023-04-01")
    img.save(path, pnginfo=info)

    # Judges download the same file from the frontend
    public = backend_root.parent / "frontend" / "public" / "samples" / "sample_lease.png"
    try:
        public.parent.mkdir(parents=True, exist_ok=True)
        public.write_bytes(path.read_bytes())
    except OSError:
        pass
    return path


# ---------------------------------------------------------------------------
# Time-relative data
# ---------------------------------------------------------------------------
def seed_evc_availability(days: int = 60):
    """Three EVC members over the next 60 days, each with their own unavailable days."""
    today = clock.now().date()
    patterns = {"evc@demo.sih": (5, 2), "evc2@demo.sih": (4, 1), "evc3@demo.sih": (6, 3)}
    rows = []
    for email, (every, offset) in patterns.items():
        prof = _profile_by_email(email)
        if not prof:
            continue
        for i in range(days):
            rows.append({"member_id": prof["user_id"], "day": (today + timedelta(days=i)).isoformat(),
                         "available": i % every != offset})
    if rows:
        _supabase.table("evc_availability").upsert(rows, on_conflict="member_id,day").execute()
    print(f"EVC availability seeded: {len(rows)} member-days")


def _institution(name: str, aicte_id: str, city: str, region_id: str):
    inst = _one("institutions", aicte_id=aicte_id)
    if inst:
        return inst
    return _supabase.table("institutions").insert({
        "name": name, "aicte_id": aicte_id, "state": "Maharashtra", "city": city, "region_id": region_id,
        "kind": "existing", "health_score": 80,
    }).execute().data[0]


def _reset_application(app_no: str, payload: dict) -> dict:
    """Upsert an application and clear decisions left over from an earlier demo run."""
    app = _supabase.table("applications").upsert(payload, on_conflict="application_no").execute().data[0]
    _supabase.table("decisions").delete().eq("application_id", app["id"]).execute()
    return app


def _document(inst_id: str, title: str, **fields) -> dict:
    content = f"{inst_id}:{title}".encode()
    payload = {"institution_id": inst_id, "title": title, "sha256": hashlib.sha256(content).hexdigest(),
               "storage_path": f"seed/{title.lower().replace(' ', '_')}.pdf", "version": 1, **fields}
    existing = _one("documents", institution_id=inst_id, title=title)
    if existing:
        return _supabase.table("documents").update(payload).eq("id", existing["id"]).execute().data[0]
    return _supabase.table("documents").insert(payload).execute().data[0]


def seed_v2_cases():
    now = clock.now()
    today = now.date()
    region = _one("regions", name="Western")
    region_id = region["id"]
    templates = {t["code"]: t["id"] for t in _supabase.table("workflow_templates").select("id, code").execute().data or []}
    bureau = _profile_by_email("bureau@demo.sih")
    scrutiny = _profile_by_email("scrutiny@demo.sih")
    sacshc = _profile_by_email("sacshc@demo.sih")
    created = {}

    # Case G: four assurance flags at final_decision (freshness, completeness, consistency, source)
    inst_g = _institution("Western Valley Institute of Engineering", "1-UNVERIFIED-010", "Mumbai", region_id)
    app_g = _reset_application("DEMO-CASE-G", {
        "application_no": "DEMO-CASE-G", "institution_id": inst_g["id"], "template_id": templates["SCRUTINY_EVC"],
        "application_type": "extension_of_approval", "current_stage": "final_decision", "status": "in_progress",
        "region_id": region_id, "assigned_to": bureau["user_id"] if bureau else None,
        "submitted_at": (now - timedelta(days=70)).isoformat(),
        "stage_entered_at": (now - timedelta(days=12)).isoformat(), "due_at": (now + timedelta(days=8)).isoformat(),
    })
    _document(inst_g["id"], "Campus Lease Deed (Case G)", application_id=app_g["id"], doc_type="lease", status="verified",
              valid_from=(today - timedelta(days=370)).isoformat(), valid_until=(today - timedelta(days=5)).isoformat(),
              metadata={"institution_name": "Eastern Valley Institute of Technology", "land_area": "8 acres",
                        "survey_number": "Survey No. 45/2", "start_date": (today - timedelta(days=370)).isoformat()})
    # Read from a second document: the land area and survey number disagree with the lease
    _document(inst_g["id"], "Land Use Certificate (Case G)", application_id=app_g["id"], doc_type="other",
              status="verified", metadata={"institution_name": inst_g["name"], "land_area": "4.05 hectares",
                                           "survey_number": "S. No. 54-2"})
    _document(inst_g["id"], "Application Form (Case G)", application_id=app_g["id"], doc_type="application_form",
              status="verified", metadata={"institution_name": inst_g["name"]})
    created["G"] = app_g["application_no"]

    # Case H: committed 20 days ago citing a lease valid for 10 more days; +15 days raises a post flag
    inst_h = _institution("Gujarat Institute of Science", "1-GUJ-003", "Ahmedabad", region_id)
    app_h = _reset_application("DEMO-CASE-H", {
        "application_no": "DEMO-CASE-H", "institution_id": inst_h["id"], "template_id": templates["ONLY_SCRUTINY"],
        "application_type": "extension_of_approval", "current_stage": "final_decision", "status": "approved",
        "region_id": region_id, "assigned_to": bureau["user_id"] if bureau else None,
        "submitted_at": (now - timedelta(days=60)).isoformat(),
        "stage_entered_at": (now - timedelta(days=30)).isoformat(), "due_at": (now - timedelta(days=10)).isoformat(),
    })
    lease_h = _document(inst_h["id"], "Campus Lease Deed (Case H)", application_id=app_h["id"], doc_type="lease",
                        status="verified", valid_from=(today - timedelta(days=355)).isoformat(),
                        valid_until=(today + timedelta(days=10)).isoformat(), metadata={"institution_name": inst_h["name"]})
    form_h = _document(inst_h["id"], "Application Form (Case H)", application_id=app_h["id"], doc_type="application_form",
                       status="verified", metadata={"institution_name": inst_h["name"]})
    decided_at = (now - timedelta(days=20)).isoformat()
    dec_h = _supabase.table("decisions").insert({
        "application_id": app_h["id"], "stage_key": "final_decision", "outcome": "approve", "status": "committed",
        "decided_by": bureau["user_id"] if bureau else None, "decided_at": decided_at,
        "remarks": "Approved for the academic year on verified lease and application form.",
    }).execute().data[0]
    _supabase.table("decision_evidence").insert([
        {"decision_id": dec_h["id"], "document_id": d["id"], "doc_version": d.get("version") or 1,
         "doc_sha256": d["sha256"], "valid_until": d.get("valid_until"), "linked_at": decided_at}
        for d in (lease_h, form_h)
    ]).execute()
    _supabase.table("assurance_reports").insert({
        "decision_id": dec_h["id"], "kind": "pre", "generated_at": decided_at, "passed": 7, "flagged": 0,
        "checks": [{"check": c, "result": "passed", "detail": "Passed at decision time"} for c in
                   ("evidence_linking", "freshness", "completeness", "consistency", "source_verification",
                    "tamper_detection", "anomaly")],
    }).execute()
    created["H"] = app_h["application_no"]

    # Case J: the scrutiny officer has 3 overrides in the last 30 days, so the next decision raises an anomaly
    inst_j = _institution("Pune Engineering College", "1-PUN-002", "Pune", region_id)
    app_j = _reset_application("DEMO-CASE-J", {
        "application_no": "DEMO-CASE-J", "institution_id": inst_j["id"], "template_id": templates["ONLY_SCRUTINY"],
        "application_type": "extension_of_approval", "current_stage": "re_scrutiny", "status": "in_progress",
        "region_id": region_id, "assigned_to": scrutiny["user_id"] if scrutiny else None,
        "submitted_at": (now - timedelta(days=40)).isoformat(),
        "stage_entered_at": (now - timedelta(days=5)).isoformat(), "due_at": (now + timedelta(days=5)).isoformat(),
    })
    _document(inst_j["id"], "Application Form (Case J)", application_id=app_j["id"], doc_type="application_form",
              status="verified", metadata={"institution_name": inst_j["name"]})
    if scrutiny:
        prior_at = (now - timedelta(days=14)).isoformat()
        dec_j = _supabase.table("decisions").insert({
            "application_id": app_j["id"], "stage_key": "scrutiny", "outcome": "return", "status": "committed",
            "decided_by": scrutiny["user_id"], "decided_at": prior_at, "remarks": "Returned for deficiencies.",
        }).execute().data[0]
        rep_j = _supabase.table("assurance_reports").insert({
            "decision_id": dec_j["id"], "kind": "pre", "generated_at": prior_at, "passed": 4, "flagged": 3,
            "checks": [{"check": "freshness", "result": "flagged", "detail": "Seeded history for Case J"}],
        }).execute().data[0]
        _supabase.table("assurance_flags").insert([
            {"report_id": rep_j["id"], "decision_id": dec_j["id"], "check_type": check, "severity": "warning",
             "message": msg, "status": "overridden", "responded_by": scrutiny["user_id"],
             "responded_at": (now - timedelta(days=days)).isoformat(), "reason": reason}
            for check, msg, days, reason in (
                ("freshness", "Fire NOC expired before the decision", 12, "Renewal receipt seen in the physical file"),
                ("consistency", "Lease metadata names a different trust", 9, "Trust renamed in 2024, deed not yet updated"),
                ("completeness", "Building plan approval missing", 6, "Submitted in the previous cycle"),
            )
        ]).execute()
    created["J"] = app_j["application_no"]

    # SAC/SHC member: a few cases at the SAC/SHC stage assigned to them
    if sacshc and "EVC_SAC_SHC" in templates:
        for n, (inst_name, aicte_id, city) in enumerate((("Gujarat Institute of Science", "1-GUJ-003", "Ahmedabad"),
                                                         ("Pune Engineering College", "1-PUN-002", "Pune")), start=1):
            inst = _institution(inst_name, aicte_id, city, region_id)
            _reset_application(f"DEMO-SACSHC-{n}", {
                "application_no": f"DEMO-SACSHC-{n}", "institution_id": inst["id"], "template_id": templates["EVC_SAC_SHC"],
                "application_type": "new_institution", "current_stage": "sac_shc", "status": "in_progress",
                "region_id": region_id, "assigned_to": sacshc["user_id"],
                "submitted_at": (now - timedelta(days=60 + n)).isoformat(),
                "stage_entered_at": (now - timedelta(days=4 * n)).isoformat(),
                "due_at": (now + timedelta(days=20 - 4 * n)).isoformat(),
            })
        created["SAC/SHC"] = ["DEMO-SACSHC-1", "DEMO-SACSHC-2"]

    # Case I: the institution uploads seed/data/sample_lease.png and OCR suggests the date. Its land-use
    # certificate is written differently (hectares, "S. No. 112-3") but agrees with the sample lease.
    demo_inst = _one("institutions", name="Demo Institute of Technology")
    if demo_inst:
        _document(demo_inst["id"], "Land Use Certificate", doc_type="other", status="verified",
                  metadata={"institution_name": "Demo Inst. of Tech.", "land_area": "4.25 hectares",
                            "survey_number": "S. No. 112-3"})
    created["I"] = f"Upload {SAMPLE_LEASE.name} as the institution (also at /samples/sample_lease.png)"
    seed_evc_availability()
    print("Cases G, H, I, J and SAC/SHC assignments seeded.")
    return created


if __name__ == "__main__":
    seed_v2_reference()
    seed_v2_cases()
