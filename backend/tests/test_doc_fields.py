"""Fields read from documents and the Decision Assurance consistency check built on them (§15.2)."""
import pytest

from services import doc_fields
from services.assurance import _consistency_flags


@pytest.mark.parametrize("a, b, expected", [
    ("Demo Institute of Technology", "DEMO INST. OF TECH.", True),
    ("Demo Institute of Technology", "Demo Institute of Technology, Navi Mumbai", True),
    ("Gujarat Institute of Science", "Gujarat Inst of Sci", True),
    ("Eastern Valley Institute of Technology", "Western Valley Institute of Engineering", False),
    # A name made only of generic words identifies nobody
    ("Institute of Technology", "Demo Institute of Technology", False),
    ("Demo Institute of Technology", "", None),
])
def test_names_match(a, b, expected):
    assert doc_fields.names_match(a, b) is expected


@pytest.mark.parametrize("text, sq_m", [
    ("10.5 acres", 42_492),
    ("Land area: 10.5 Acres.", 42_492),
    ("4.25 ha", 42_500),
    ("42,492 sq. m", 42_492),
    ("4,57,380 sq ft", 42_492),
    ("105 gunthas", 10_623),
])
def test_area_units(text, sq_m):
    assert doc_fields.area_sq_m(text) == pytest.approx(sq_m, rel=0.001)


def test_area_without_known_unit_is_not_compared():
    assert doc_fields.area_sq_m("about 3 bigha") is None
    assert doc_fields.area_sq_m("") is None


def test_areas_match_within_rounding():
    assert doc_fields.areas_match(doc_fields.area_sq_m("10.5 acres"), doc_fields.area_sq_m("4.25 hectares"))
    assert not doc_fields.areas_match(doc_fields.area_sq_m("8 acres"), doc_fields.area_sq_m("4.05 hectares"))


@pytest.mark.parametrize("text", ["Survey No. 112/3", "S. No. 112-3", "112 / 3", "Sy. No: 112/3"])
def test_survey_number_forms(text):
    assert doc_fields.survey_number(text) == "112/3"


INST = {"name": "Demo Institute of Technology"}


def _doc(i, title, doc_type="other", **meta):
    return {"id": f"d{i}", "title": title, "doc_type": doc_type, "metadata": meta}


def test_consistent_documents_raise_no_flags():
    docs = [
        _doc(1, "Lease", "lease", institution_name="Demo Institute of Technology", land_area="10.5 acres",
             survey_number="Survey No. 112/3"),
        _doc(2, "Land Use Certificate", institution_name="Demo Inst. of Tech.", land_area="4.25 hectares",
             survey_number="S. No. 112-3"),
    ]
    flags, compared = _consistency_flags(docs, INST)
    assert flags == []
    assert any("land area" in c for c in compared) and any("survey number" in c for c in compared)


def test_disagreements_are_flagged_against_the_lease():
    docs = [
        _doc(1, "Certificate", land_area="4.05 hectares", survey_number="S. No. 54-2"),
        _doc(2, "Lease", "lease", institution_name="Eastern Valley Institute", land_area="8 acres",
             survey_number="Survey No. 45/2"),
    ]
    flags, _ = _consistency_flags(docs, INST)
    messages = " | ".join(f["message"] for f in flags)
    assert {f["check_type"] for f in flags} == {"consistency"}
    assert "names 'Eastern Valley Institute'" in messages
    assert "Land area differs: 'Lease' says 8 acres, 'Certificate' says 4.05 hectares" in messages
    assert "Survey numbers differ" in messages
    assert len(flags) == 3


def test_dates_typed_by_hand_and_impossible_ranges():
    edited = {**_doc(1, "Lease", "lease"), "valid_until": "2030-03-31", "ocr_status": "edited",
              "ocr_suggested_expiry": "2028-03-31"}
    backwards = {**_doc(2, "NOC", start_date="2027-01-01"), "valid_until": "2026-01-01"}
    # A rejected suggestion was wrong, so a different date is expected
    rejected = {**_doc(3, "Lease 2", "lease"), "valid_until": "2030-03-31", "ocr_status": "rejected",
                "ocr_suggested_expiry": "2028-03-31"}
    flags, _ = _consistency_flags([edited, backwards, rejected], INST)
    assert [f["entity_id"] for f in flags] == ["d1", "d2"]
    assert "entered by hand as 2030-03-31, but the document reads 2028-03-31" in flags[0]["message"]
    assert "after its expiry" in flags[1]["message"]
