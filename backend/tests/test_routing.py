"""Routing rules: the workflow follows from what is applied for and the institution's record."""
import pytest

from services import routing

GOOD = {"health_score": 85, "expired_documents": 0}
WEAK = {"health_score": 45, "expired_documents": 2}


def test_extension_without_changes_needs_scrutiny_only():
    code, reasons = routing._decide("extension_of_approval", {"changes_since_last_approval": False}, GOOD)
    assert code == "ONLY_SCRUTINY" and len(reasons) == 1


def test_extension_adds_a_visit_for_each_concern():
    code, reasons = routing._decide("extension_of_approval", {"changes_since_last_approval": True}, WEAK)
    assert code == "SCRUTINY_EVC"
    assert len(reasons) == 3 and "45" in reasons[1] and "2 documents" in reasons[2]


def test_intake_increase_depends_on_accreditation():
    details = {"nba_accredited": True}
    assert routing._decide("increase_in_intake", details, GOOD)[0] == "ONLY_SCRUTINY"
    assert routing._decide("increase_in_intake", details, WEAK)[0] == "SCRUTINY_EVC"
    code, reasons = routing._decide("increase_in_intake", {"nba_accredited": False}, GOOD)
    assert code == "SCRUTINY_EVC" and "not NBA accredited" in reasons[0]


def test_fixed_routes():
    assert routing._decide("change_of_name", {}, WEAK)[0] == "ONLY_SCRUTINY"
    assert routing._decide("change_of_site", {}, GOOD)[0] == "SCRUTINY_EVC"
    assert routing._decide("new_institution", {}, GOOD)[0] == "SCRUTINY_EVC"
    assert routing._decide("restoration_of_intake", {}, GOOD)[0] == "ONLY_EVC"
    assert routing._decide("appeal", {}, GOOD)[0] == "EVC_SAC_SHC"


def test_validation():
    with pytest.raises(routing.RoutingError, match="Missing"):
        routing.validate("new_course", {"level": "UG"})
    with pytest.raises(routing.RoutingError, match="more than the current"):
        routing.validate("increase_in_intake", {"level": "UG", "discipline": "Engineering", "course_name": "B.Tech CSE",
                                                "current_intake": 120, "proposed_intake": "60", "nba_accredited": True})
    clean = routing.validate("restoration_of_intake", {"course_name": "B.Tech", "intake_to_restore": "60",
                                                       "compliance_summary": "Done", "unexpected": "dropped"})
    assert clean == {"course_name": "B.Tech", "intake_to_restore": 60, "compliance_summary": "Done"}
