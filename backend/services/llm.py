"""
Case Summary and Drafts Service using LLM (Section 10.3).
Rules:
- Summary <= 150 words
- Lists open issues and next required action
- Never states or implies a decision
- Never invents facts not in input
- Deficiency letter draft in formal statutory tone with deadline
"""
from typing import Dict, Any, List, Optional, Tuple, Union
import base64
import io
import json
import logging

import httpx

from core.config import settings

logger = logging.getLogger("aicte.llm")


def _generate_mock_case_summary(context: Dict[str, Any]) -> str:
    app_num = context.get("application_number", "APP-XXXX")
    inst_name = context.get("institution_name", "Institution")
    current_stage = context.get("current_stage", "Scrutiny").replace("_", " ").title()
    status = context.get("status", "in_progress")
    open_alerts = context.get("open_alerts", [])
    open_uts = context.get("open_undertakings", [])
    history_count = len(context.get("stage_history", []))

    issues = []
    if open_alerts:
        issues.append(f"{len(open_alerts)} active SLA alert(s)")
    if open_uts:
        issues.append(f"{len(open_uts)} pending compliance undertaking(s)")
    
    issues_str = ", ".join(issues) if issues else "No critical compliance flags detected"

    return (
        f"Application {app_num} from {inst_name} is currently in the {current_stage} stage ({status}). "
        f"The case has recorded {history_count} stage progression steps to date. "
        f"Identified open issues include: {issues_str}. "
        f"The next required administrative action is for the assigned scrutiny officer to review submitted evidence "
        f"and execute the statutory verification checklist."
    )


def _generate_mock_deficiency_draft(context: Dict[str, Any]) -> str:
    app_num = context.get("application_number", "APP-XXXX")
    inst_name = context.get("institution_name", "The Principal / Director")
    deficiencies = context.get("deficiencies", ["Incomplete faculty roster", "Land title affidavit unnotarized"])
    deadline_days = context.get("deadline_days", 15)
    
    bullet_points = "\n".join([f"  {idx+1}. {d}" for idx, d in enumerate(deficiencies)])

    return f"""To,
The Principal / Director,
{inst_name}

Subject: Statutory Deficiency Notice regarding Application Reference {app_num}

Sir / Madam,

Upon detailed scrutiny of your institutional approval application {app_num} under AICTE Approval Process Handbook guidelines, the competent scrutiny committee has observed the following deficiencies:

{bullet_points}

You are hereby directed to rectify the above-noted deficiencies and upload authenticated compliance evidence on the AICTE portal within {deadline_days} calendar days of this notice.

Failure to cure said deficiencies within the stipulated SLA timeframe will lead to processing of the application strictly based on available on-record documentation.

Yours faithfully,
Competent Scrutiny Officer
All India Council for Technical Education (AICTE)"""


ADVISORY = "Advisory only, final decisions rest with the competent authority."

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
# Groq accepts inline base64 images up to 4 MB
MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024
# A different key cannot fix a malformed request (400/404/413/422), so only these move to the failsafe key
_RETRY_WITH_FAILSAFE = {401, 403, 429, 498, 500, 502, 503, 504}


def _usable(key: Optional[str]) -> bool:
    return bool(key) and not key.startswith(("mock_", "dummy_", "your_"))


def _keys() -> List[Tuple[str, str]]:
    """Default key first, failsafe second."""
    keys = []
    if _usable(settings.GROQ_API_KEY):
        keys.append(("default", settings.GROQ_API_KEY))
    if _usable(settings.GROQ_API_KEY_FAILSAFE):
        keys.append(("failsafe", settings.GROQ_API_KEY_FAILSAFE))
    return keys


def llm_enabled() -> bool:
    return bool(_keys())


def _schema_instruction(schema: Dict[str, Any]) -> str:
    return (
        "\n\nRespond with a single JSON object and nothing else. It must have exactly these keys, "
        "all present, matching this JSON Schema:\n" + json.dumps(schema)
    )


def _valid(result: Any, schema: Dict[str, Any]) -> bool:
    if not isinstance(result, dict) or not all(k in result for k in schema.get("required", [])):
        return False
    types = {"string": str, "boolean": bool, "integer": int, "number": (int, float)}
    for key, spec in schema.get("properties", {}).items():
        expected = types.get(spec.get("type"))
        value = result.get(key)
        if expected and not isinstance(value, expected):
            return False
        if expected in (int, (int, float)) and isinstance(value, bool):
            return False
        if "enum" in spec and value not in spec["enum"]:
            return False
    return True


def _complete(
    system: str,
    content: Union[str, List[Dict[str, Any]]],
    schema: Optional[Dict[str, Any]] = None,
    max_tokens: int = 4000,
    vision: bool = False,
    temperature: float = 0.2,
) -> Optional[Union[str, Dict[str, Any]]]:
    """
    One Groq chat completion, on the default key and then the failsafe key if the default
    fails (auth, rate limit, outage). Returns parsed JSON when a schema is given, otherwise text.
    Returns None when no key is configured or every key fails, so callers fall back to templates.
    """
    keys = _keys()
    if not keys:
        return None
    payload: Dict[str, Any] = {
        "model": settings.GROQ_VISION_MODEL if vision else settings.GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system + (_schema_instruction(schema) if schema else "")},
            {"role": "user", "content": content},
        ],
        "max_completion_tokens": max_tokens,
        "temperature": temperature,
    }
    if schema:
        payload["response_format"] = {"type": "json_object"}

    for name, key in keys:
        try:
            resp = httpx.post(GROQ_URL, headers={"Authorization": f"Bearer {key}"}, json=payload, timeout=60.0)
        except httpx.HTTPError as e:
            logger.error(f"Groq connection error on {name} key: {e}")
            continue
        if resp.status_code != 200:
            logger.error(f"Groq API error {resp.status_code} on {name} key: {resp.text[:300]}")
            if resp.status_code in _RETRY_WITH_FAILSAFE:
                continue
            return None
        choice = (resp.json().get("choices") or [{}])[0]
        if choice.get("finish_reason") == "length":
            logger.warning(f"Groq output truncated on {name} key")
            return None
        text = ((choice.get("message") or {}).get("content") or "").strip()
        if name != "default":
            logger.warning("Groq call served by the failsafe key")
        if not schema:
            return text or None
        try:
            result = json.loads(text)
        except json.JSONDecodeError:
            logger.error("Groq returned invalid JSON")
            return None
        if not _valid(result, schema):
            logger.error("Groq JSON did not match the schema")
            return None
        return result
    return None


SUMMARY_SYSTEM = (
    "You write case summaries for officers at India's All India Council for Technical Education (AICTE). "
    "Write at most 150 words. State the current stage and status, list each open issue, and name the next "
    "required action and who takes it. Never state or imply that the application will be or should be "
    "approved, rejected or decided in any way. Use only facts present in the case record; if something is "
    "unknown, leave it out rather than guess. Plain prose, no headings."
)


def summarize_case(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Summarize application case history, open alerts, and next required action.
    """
    text = _complete(
        SUMMARY_SYSTEM,
        "Case record (JSON):\n" + json.dumps(context, default=str, sort_keys=True),
        max_tokens=2000,
    )
    mode = "production"
    if not text:
        mode = "mock" if not llm_enabled() else "mock_fallback"
        text = _generate_mock_case_summary(context)
    words = text.split()
    if len(words) > 150:
        text = " ".join(words[:150])
    return {
        "summary": text,
        "word_count": len(text.split()),
        "mode": mode,
        "advisory": ADVISORY
    }


DEFICIENCY_SYSTEM = (
    "You draft formal deficiency letters from AICTE to an institution. Formal statutory tone. Address the "
    "Principal / Director of the named institution, cite the application reference, list each deficiency "
    "exactly as recorded by the officer (numbered, one per line, do not add or drop any), and end by "
    "directing the institution to respond within the given number of calendar days, written as "
    "'within N calendar days'. Do not state any decision on the application. Output only the letter text."
)


def draft_deficiency_letter(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate formal deficiency notice draft for officer review.
    """
    draft = _complete(
        DEFICIENCY_SYSTEM,
        "Letter details (JSON):\n" + json.dumps(context, default=str, sort_keys=True),
    )
    mode = "production"
    # The officer's recorded deficiencies and the deadline must survive verbatim
    if draft and not (all(d in draft for d in context.get("deficiencies", []))
                      and f"{context.get('deadline_days', 15)} calendar days" in draft):
        draft = None
    if not draft:
        mode = "mock" if not llm_enabled() else "mock_fallback"
        draft = _generate_mock_deficiency_draft(context)
    return {
        "draft": draft,
        "mode": mode,
        "advisory": f"{ADVISORY} Draft, review before sending."
    }


POLISH_SYSTEM = (
    "You improve the wording of official AICTE correspondence drafted by an officer. Keep every fact, date, "
    "reference number, link and {{placeholder}} exactly as written, keep the language of the draft "
    "(English or Hindi), and keep it formal and concise. Do not add commitments, decisions or new facts. "
    "Output only the revised text."
)


def polish_text(text: str) -> Dict[str, Any]:
    """Suggest better wording for an officer's draft. Never sends anything."""
    polished = _complete(POLISH_SYSTEM, text)
    return {
        "text": polished or text,
        "mode": "production" if polished else ("mock" if not llm_enabled() else "mock_fallback"),
        "advisory": f"{ADVISORY} Draft, review before sending."
    }


BRIEF_SCHEMA = {
    "type": "object",
    "properties": {"summary": {"type": "string", "description": "Two or three sentences, at most 70 words"}},
    "required": ["summary"],
    "additionalProperties": False,
}

BRIEF_ROLES = {
    "institution": "an institution's compliance team", "scrutiny_officer": "a scrutiny officer",
    "regional_officer": "a regional officer", "evc_member": "an EVC member",
    "sac_shc_member": "an SAC/SHC committee member", "bureau_officer": "a bureau officer",
}

BRIEF_SYSTEM = (
    "You write the morning brief for {role} at AICTE. You are given today's facts, most urgent first. "
    "Write two or three plain sentences, at most 70 words, that lead with what needs action soonest. "
    "Use only the facts given: do not add, combine or estimate any number, date or reference, write every "
    "number in digits exactly as given, and copy application numbers exactly. Add no advice, reminders or "
    "filler beyond the facts; if nothing is urgent, say so in one sentence. Do not recommend approving, "
    "rejecting or deciding any case. No greeting, no headings, no lists."
)


def write_daily_brief(role: str, facts: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """A short summary of the brief's facts, or None (the caller then uses a template)."""
    system = BRIEF_SYSTEM.format(role=BRIEF_ROLES.get(role, "an officer"))
    lines = "\n".join(f"- [{f['severity']}] {f['text']}" for f in facts)
    return _complete(system, "Today's facts:\n" + lines, schema=BRIEF_SCHEMA, max_tokens=1000, temperature=0)

NL_FILTER_SCHEMA = {
    "type": "object",
    "properties": {
        "entity": {"type": "string", "enum": ["applications", "evc", "undertakings", "documents"]},
        "region": {"type": "string", "description": "Region name or empty"},
        "stage": {"type": "string", "description": "Stage key or empty"},
        "status": {"type": "string", "description": "Status value or empty"},
        "overdue": {"type": "boolean"},
        "days_overdue_gte": {"type": "integer", "description": "0 when not asked"},
        "institution_name": {"type": "string", "description": "Institution name fragment or empty"},
    },
    "required": ["entity", "region", "stage", "status", "overdue", "days_overdue_gte", "institution_name"],
    "additionalProperties": False,
}


def nl_query_filter(question: str, regions: List[str], stages: List[str]) -> Optional[Dict[str, Any]]:
    """Translate a question into the allow-listed filter object. Never SQL."""
    system = (
        "Convert an AICTE officer's question into a filter object. Use only these values. "
        f"Regions: {', '.join(regions)}. Stages: {', '.join(stages)}. "
        "Statuses: draft, in_progress, returned, approved, rejected, closed, queued, scheduled, completed, "
        "pending, submitted, verified, active, expired, renewed. Use an empty string for any field the "
        "question does not mention, false for overdue and 0 for days_overdue_gte unless asked."
    )
    return _complete(system, question, schema=NL_FILTER_SCHEMA, max_tokens=1000, temperature=0)


OCR_SCHEMA = {
    "type": "object",
    "properties": {
        "expiry_date": {"type": "string", "description": "YYYY-MM-DD, or empty if no expiry date is printed"},
        "confidence": {"type": "number", "description": "0 to 1"},
        "evidence_text": {"type": "string", "description": "The exact line where the date was found, or empty"},
        "institution_name": {"type": "string", "description": "Lessee or institution name as printed, or empty"},
        "land_area": {"type": "string", "description": "Land area as printed, with units, or empty"},
        "survey_number": {"type": "string", "description": "Survey, gat, khasra or CTS number as printed, or empty"},
        "start_date": {"type": "string", "description": "YYYY-MM-DD the lease or validity starts, or empty"},
    },
    "required": ["expiry_date", "confidence", "evidence_text", "institution_name", "land_area",
                 "survey_number", "start_date"],
    "additionalProperties": False,
}

OCR_SYSTEM = (
    "You read scanned validity documents (leases, NOCs, certificates) for AICTE. Find the date the document "
    "expires or is valid until. Copy the line containing it verbatim as evidence_text. If there is no "
    "clearly printed expiry or validity end date, return an empty expiry_date and confidence 0. Never infer "
    "an expiry date from a start date and a duration unless the end date is printed. Also copy, exactly "
    "as printed, the institution or lessee name, the land area with its unit, the survey (gat, khasra or "
    "CTS) number, and the commencement or start date. Leave any field empty when it is not printed."
)


def ocr_expiry(file_bytes: bytes, media_type: str) -> Dict[str, Any]:
    """
    Suggest the expiry date of an uploaded document (§15.3). The result is only a suggestion;
    valid_until is set when a person confirms it.
    """
    result = None
    if media_type == "application/pdf":
        # Groq models take images, not PDFs: read the PDF's text layer instead (scanned PDFs have none)
        text = _pdf_text(file_bytes)
        if text:
            result = _complete(OCR_SYSTEM, "Document text:\n" + text[:20000],
                               schema=OCR_SCHEMA, max_tokens=1000, temperature=0)
    elif len(file_bytes) <= MAX_INLINE_IMAGE_BYTES:
        data_url = f"data:{media_type};base64,{base64.standard_b64encode(file_bytes).decode()}"
        result = _complete(OCR_SYSTEM, [{"type": "text", "text": "Extract the fields."},
                                        {"type": "image_url", "image_url": {"url": data_url}}],
                           schema=OCR_SCHEMA, max_tokens=1000, vision=True, temperature=0)
    if result is not None:
        result["mode"] = "production"
        return result
    mock = _mock_ocr(file_bytes, media_type)
    mock["mode"] = "mock" if not llm_enabled() else "mock_fallback"
    return mock


def _pdf_text(file_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        logger.warning("pypdf is not installed; PDF OCR suggestions are unavailable")
        return ""
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        return "\n".join((page.extract_text() or "") for page in reader.pages[:10]).strip()
    except Exception as e:
        logger.warning(f"Could not read PDF text: {e}")
        return ""


def _mock_ocr(file_bytes: bytes, media_type: str) -> Dict[str, Any]:
    """
    Without a model, only the seeded sample lease can be read: it carries its printed fields as
    PNG text chunks. Anything else returns no date, which the UI shows as 'enter it manually'.
    """
    empty = {"expiry_date": "", "confidence": 0.0, "evidence_text": "", "institution_name": "", "land_area": "",
             "survey_number": "", "start_date": ""}
    if media_type != "image/png":
        return empty
    try:
        from PIL import Image
        info = Image.open(io.BytesIO(file_bytes)).text  # type: ignore[attr-defined]
    except Exception:
        return empty
    if not info.get("expiry_date"):
        return empty
    return {
        "expiry_date": info["expiry_date"],
        "confidence": 0.9,
        "evidence_text": info.get("evidence_text", ""),
        "institution_name": info.get("institution_name", ""),
        "land_area": info.get("land_area", ""),
        "survey_number": info.get("survey_number", ""),
        "start_date": info.get("start_date", ""),
    }
