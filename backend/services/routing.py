"""
Application routing: which workflow an application follows is decided here, from what is applied
for and the institution's record, never by the applicant.

Each rule gives its reason in plain words. The reasons are shown to the institution before it
submits, and recorded on the case's first stage and in the audit trail.
"""
from typing import Any, Dict, List, Optional, Tuple

from core import clock
from core.db import db

HEALTH_THRESHOLD = 60  # below this, a physical verification is added

STAGE_LABELS = {
    "scrutiny": "Scrutiny", "evc_queue": "EVC scheduling", "evc_visit": "Expert visit",
    "sac_shc": "SAC/SHC review", "final_decision": "Final decision",
}
ROLE_LABELS = {
    "scrutiny_officer": "Scrutiny officer", "regional_officer": "Regional office", "evc_member": "Expert visit committee",
    "sac_shc_member": "SAC/SHC committee", "bureau_officer": "Approval bureau",
}

APPLICATION_TYPES = {
    "extension_of_approval": "Extension of approval",
    "increase_in_intake": "Increase in intake",
    "new_course": "New course",
    "change_of_name": "Change of name",
    "change_of_site": "Change of site",
    "new_institution": "New institution",
    "restoration_of_intake": "Restoration of intake",
    "appeal": "Appeal against a decision",
}

# Fields each type needs, besides academic_year and the declaration
REQUIRED_FIELDS = {
    "extension_of_approval": ["changes_since_last_approval"],
    "increase_in_intake": ["level", "discipline", "course_name", "current_intake", "proposed_intake", "nba_accredited"],
    "new_course": ["level", "discipline", "course_name", "proposed_intake", "existing_discipline"],
    "change_of_name": ["new_name", "reason"],
    "change_of_site": ["new_address", "land_area", "land_tenure"],
    "new_institution": ["proposed_name", "trust_name", "new_address", "land_area", "level", "discipline"],
    "restoration_of_intake": ["course_name", "intake_to_restore", "compliance_summary"],
    "appeal": ["reference_application_no", "grounds"],
}


class RoutingError(ValueError):
    pass


def _institution_record(institution_id: str) -> Dict[str, Any]:
    inst = (db.table("institutions").select("id, name, health_score").eq("id", institution_id)
            .limit(1).execute().data or [{}])[0]
    today = clock.now().date().isoformat()
    docs = db.table("documents").select("valid_until, status").eq("institution_id", institution_id) \
        .not_.is_("valid_until", "null").execute().data or []
    expired = sum(1 for d in docs if d.get("status") != "renewed" and str(d["valid_until"])[:10] < today)
    return {"health_score": inst.get("health_score"), "expired_documents": expired}


def validate(application_type: str, details: Dict[str, Any]) -> Dict[str, Any]:
    if application_type not in APPLICATION_TYPES:
        raise RoutingError(f"Unknown application type '{application_type}'")
    missing = [f for f in REQUIRED_FIELDS[application_type] if details.get(f) in (None, "")]
    if missing:
        raise RoutingError("Missing: " + ", ".join(f.replace("_", " ") for f in missing))
    clean = {k: details[k] for k in REQUIRED_FIELDS[application_type] + ["remarks"] if k in details}
    for f in ("current_intake", "proposed_intake", "intake_to_restore"):
        if f in clean:
            try:
                clean[f] = int(clean[f])
            except (TypeError, ValueError):
                raise RoutingError(f"{f.replace('_', ' ').capitalize()} must be a number")
            if clean[f] <= 0:
                raise RoutingError(f"{f.replace('_', ' ').capitalize()} must be more than 0")
    if application_type == "increase_in_intake" and clean["proposed_intake"] <= clean["current_intake"]:
        raise RoutingError("Proposed intake must be more than the current intake")
    return clean


def _decide(application_type: str, d: Dict[str, Any], inst: Dict[str, Any]) -> Tuple[str, List[str]]:
    health = inst.get("health_score")
    weak = health is not None and health < HEALTH_THRESHOLD
    expired = inst["expired_documents"]
    record_issues = []
    if weak:
        record_issues.append(f"the institution's compliance health score is {health}, below {HEALTH_THRESHOLD}")
    if expired:
        record_issues.append(f"{expired} document{'s' if expired != 1 else ''} on record "
                             f"{'have' if expired != 1 else 'has'} expired")

    if application_type == "extension_of_approval":
        reasons = []
        if d.get("changes_since_last_approval"):
            reasons.append("land, buildings or programmes have changed since the last approval")
        reasons += record_issues
        if reasons:
            return "SCRUTINY_EVC", [f"An expert visit is needed because {r}." for r in reasons]
        return "ONLY_SCRUTINY", ["Nothing has changed since the last approval and the institution's record is in order, "
                                 "so the self-disclosure is checked by scrutiny alone."]

    if application_type == "increase_in_intake":
        if d.get("nba_accredited") and not record_issues:
            return "ONLY_SCRUTINY", ["The programme is NBA accredited and the institution's record is in order, "
                                     "so the increase is checked by scrutiny alone."]
        why = ["the programme is not NBA accredited"] if not d.get("nba_accredited") else []
        return "SCRUTINY_EVC", [f"An expert visit checks the added classrooms, labs and faculty because "
                                f"{r}." for r in why + record_issues]

    if application_type == "new_course":
        if d.get("existing_discipline") and not record_issues:
            return "ONLY_SCRUTINY", ["The institution already runs this discipline with its labs, "
                                     "so the new course is checked by scrutiny alone."]
        why = ["the discipline is new to the institution"] if not d.get("existing_discipline") else []
        return "SCRUTINY_EVC", [f"An expert visit checks labs and faculty for the course because {r}."
                                for r in why + record_issues]

    if application_type == "change_of_name":
        return "ONLY_SCRUTINY", ["A change of name does not change the campus, so it is checked by scrutiny alone."]

    if application_type == "change_of_site":
        return "SCRUTINY_EVC", ["The new site's land and buildings are verified by an expert visit after scrutiny."]

    if application_type == "new_institution":
        return "SCRUTINY_EVC", ["A new institution is checked by scrutiny, then an expert visit verifies the land, "
                                "buildings and facilities before the decision."]

    if application_type == "restoration_of_intake":
        return "ONLY_EVC", ["The documents are already on record from the earlier approval, so an expert visit "
                            "verifies the compliance before the decision."]

    # appeal
    return "EVC_SAC_SHC", ["An appeal is reviewed by a fresh expert visit and then heard by the Standing "
                           "Appellate/Hearing Committee before the decision."]


def _stage_path(definition: Dict[str, Any]) -> List[Dict[str, Any]]:
    stages, key, path = definition["stages"], definition["start"], []
    while key and key not in [p["key"] for p in path]:
        s = stages[key]
        path.append({"key": key, "label": STAGE_LABELS.get(key, key.replace("_", " ").capitalize()),
                     "owner": ROLE_LABELS.get(s.get("owner_role"), s.get("owner_role")),
                     "sla_days": s.get("sla_days")})
        key = s.get("next")
    return path


def route(application_type: str, details: Dict[str, Any], institution_id: str,
          region_id: Optional[str] = None) -> Dict[str, Any]:
    """The workflow for this application, the reasons, and the stages it will pass through."""
    from services.workflow_engine import _compute_due, _get_template_by_code

    clean = validate(application_type, details)
    code, reasons = _decide(application_type, clean, _institution_record(institution_id))
    tmpl = _get_template_by_code(code)
    stages = _stage_path(tmpl["definition"])
    now = clock.now()
    for s in stages:  # the deadline that will actually apply, including any regional rule
        s["sla_days"] = (_compute_due({**tmpl["definition"]["stages"][s["key"]], "key": s["key"]},
                                      code, region_id, now) - now).days
    return {"template_code": code, "workflow_name": tmpl.get("name") or code, "reasons": reasons,
            "stages": stages, "total_days": sum(s["sla_days"] or 0 for s in stages), "details": clean}
