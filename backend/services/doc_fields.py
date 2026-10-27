"""
Fields read from uploaded documents, normalised so Decision Assurance (§15.2) can compare them
across documents: institution names, land areas and survey numbers are printed differently on
every deed and certificate ("Inst. of Tech." / "Institute of Technology", "10.5 acres" / "4.25 ha").
"""
import re
from typing import Optional

# Abbreviations common on Indian deeds and certificates
_ABBREVIATIONS = {
    "inst": "institute", "instt": "institute", "tech": "technology", "technol": "technology",
    "engg": "engineering", "eng": "engineering", "univ": "university", "coll": "college",
    "mgmt": "management", "sci": "science", "edu": "education", "intl": "international",
    "natl": "national", "res": "research", "&": "and", "pvt": "private", "ltd": "limited",
}
_FILLER = {"the", "of", "and", "for", "a"}
# Words every institution name shares; a name made only of these identifies nobody
_GENERIC = {
    "institute", "technology", "engineering", "university", "college", "management", "science",
    "education", "research", "school", "academy", "polytechnic", "trust", "society", "private", "limited",
}


def _name_tokens(name: str) -> list:
    words = re.findall(r"[a-z0-9&]+", (name or "").lower())
    return [w for w in (_ABBREVIATIONS.get(w, w) for w in words) if w not in _FILLER]


def names_match(a: Optional[str], b: Optional[str]) -> Optional[bool]:
    """
    Whether two printed names refer to the same institution. None when either is missing.
    Equal after normalising, or one name contained in the other ("Demo Institute of Technology"
    and "Demo Institute of Technology, Navi Mumbai").
    """
    ta, tb = _name_tokens(a or ""), _name_tokens(b or "")
    if not ta or not tb:
        return None
    if ta == tb:
        return True
    small, large = (set(ta), set(tb)) if len(ta) <= len(tb) else (set(tb), set(ta))
    return len(small) >= 2 and bool(small - _GENERIC) and small <= large


# Square metres per unit. Bigha and other regional units vary by state, so they are not converted.
_AREA_UNITS = [
    (r"hectares?|ha", 10_000.0),
    (r"acres?|ac", 4_046.8564224),
    (r"sq\.?\s*(?:m|mt|mtr|metres?|meters?)|square\s+(?:metres?|meters?)|m2|m²", 1.0),
    (r"sq\.?\s*(?:ft|feet)|square\s+feet|ft2|ft²", 0.09290304),
    (r"gunthas?|gunta", 101.17141056),
]
_AREA_RE = re.compile(
    r"(\d[\d,]*(?:\.\d+)?)\s*(" + "|".join(f"(?:{u})" for u, _ in _AREA_UNITS) + r")\b\.?",
    re.IGNORECASE,
)


def area_sq_m(text: Optional[str]) -> Optional[float]:
    """Land area in square metres, or None when no amount with a known unit is printed."""
    m = _AREA_RE.search(text or "")
    if not m:
        return None
    amount = float(m.group(1).replace(",", ""))
    unit = m.group(2).lower()
    for pattern, factor in _AREA_UNITS:
        if re.fullmatch(pattern, unit, re.IGNORECASE):
            return amount * factor
    return None


def areas_match(a_sq_m: float, b_sq_m: float, tolerance: float = 0.02) -> bool:
    """Equal within 2%, which absorbs rounding when a deed and a certificate use different units."""
    return abs(a_sq_m - b_sq_m) <= tolerance * max(a_sq_m, b_sq_m)


def survey_number(text: Optional[str]) -> Optional[str]:
    """
    Comparable survey (or gat / khasra / CTS) number: "Survey No. 112/3", "S. No. 112-3" and
    "112 / 3" all become "112/3".
    """
    s = (text or "").upper()
    s = re.sub(r"\b(?:SURVEY|SY|S|GAT|KHASRA|CTS|HISSA)\b\.?\s*(?:NO|NOS|NUMBER)?\b\.?\s*:?", " ", s)
    s = re.sub(r"\s*[-/]\s*", "/", s.strip())
    s = re.sub(r"\s+", " ", s)
    return s or None
