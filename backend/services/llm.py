"""
Case Summary and Drafts Service using LLM (Section 10.3).
Rules:
- Summary <= 150 words
- Lists open issues and next required action
- Never states or implies a decision
- Never invents facts not in input
- Deficiency letter draft in formal statutory tone with deadline
"""
from typing import Dict, Any, List, Optional, Union
import base64
import io
import json
import logging

import anthropic

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

# Models that accept server-side refusal fallbacks in their "default" routing form
_FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"}

_client: Optional[anthropic.Anthropic] = None


def llm_enabled() -> bool:
    key = settings.LLM_API_KEY
    return bool(key) and not key.startswith(("mock_", "dummy_"))


def _get_client() -> Optional[anthropic.Anthropic]:
    global _client
    if not llm_enabled():
        return None
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.LLM_API_KEY, timeout=90.0, max_retries=2)
    return _client


def _complete(
    system: str,
    content: Union[str, List[Dict[str, Any]]],
    schema: Optional[Dict[str, Any]] = None,
    effort: str = "low",
    max_tokens: int = 4000,
) -> Optional[Union[str, Dict[str, Any]]]:
    """
    One Claude call. Returns parsed JSON when a schema is given, otherwise text.
    Returns None when no key is configured or the call fails, so callers fall back to templates.
    """
    client = _get_client()
    if client is None:
        return None
    output_config: Dict[str, Any] = {"effort": effort}
    if schema:
        output_config["format"] = {"type": "json_schema", "schema": schema}
    kwargs: Dict[str, Any] = {
        "model": settings.LLM_MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": content}],
        "output_config": output_config,
    }
    if settings.LLM_MODEL in _FALLBACK_MODELS:
        kwargs["betas"] = ["server-side-fallback-2026-07-01"]
        kwargs["fallbacks"] = "default"
    try:
        response = client.beta.messages.create(**kwargs)
    except anthropic.APIConnectionError as e:
        logger.error(f"LLM connection error: {e}")
        return None
    except anthropic.RateLimitError as e:
        logger.error(f"LLM rate limited: {e}")
        return None
    except anthropic.APIStatusError as e:
        logger.error(f"LLM API error {e.status_code}: {e.message}")
        return None

    if response.stop_reason in ("refusal", "max_tokens"):
        logger.warning(f"LLM stopped with {response.stop_reason} (request {response._request_id})")
        return None
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    if not schema:
        return text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.error(f"LLM returned invalid JSON (request {response._request_id})")
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
        effort="medium",
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
        effort="medium",
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
    polished = _complete(POLISH_SYSTEM, text, effort="low")
    return {
        "text": polished or text,
        "mode": "production" if polished else ("mock" if not llm_enabled() else "mock_fallback"),
        "advisory": f"{ADVISORY} Draft, review before sending."
    }


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
    return _complete(system, question, schema=NL_FILTER_SCHEMA, effort="low", max_tokens=1000)


OCR_SCHEMA = {
    "type": "object",
    "properties": {
        "expiry_date": {"type": "string", "description": "YYYY-MM-DD, or empty if no expiry date is printed"},
        "confidence": {"type": "number", "description": "0 to 1"},
        "evidence_text": {"type": "string", "description": "The exact line where the date was found, or empty"},
        "institution_name": {"type": "string", "description": "Lessee or institution name as printed, or empty"},
        "land_area": {"type": "string", "description": "Land area as printed, with units, or empty"},
    },
    "required": ["expiry_date", "confidence", "evidence_text", "institution_name", "land_area"],
    "additionalProperties": False,
}

OCR_SYSTEM = (
    "You read scanned validity documents (leases, NOCs, certificates) for AICTE. Find the date the document "
    "expires or is valid until. Copy the line containing it verbatim as evidence_text. If there is no "
    "clearly printed expiry or validity end date, return an empty expiry_date and confidence 0. Never infer "
    "an expiry date from a start date and a duration unless the end date is printed. Also copy the "
    "institution or lessee name and land area if printed."
)


def ocr_expiry(file_bytes: bytes, media_type: str) -> Dict[str, Any]:
    """
    Suggest the expiry date of an uploaded document (§15.3). The result is only a suggestion;
    valid_until is set when a person confirms it.
    """
    if media_type == "application/pdf":
        block = {"type": "document", "source": {"type": "base64", "media_type": media_type,
                                                "data": base64.standard_b64encode(file_bytes).decode()}}
    else:
        block = {"type": "image", "source": {"type": "base64", "media_type": media_type,
                                             "data": base64.standard_b64encode(file_bytes).decode()}}
    result = _complete(OCR_SYSTEM, [block, {"type": "text", "text": "Extract the fields."}],
                       schema=OCR_SCHEMA, effort="low", max_tokens=2000)
    if result is not None:
        result["mode"] = "production"
        return result
    mock = _mock_ocr(file_bytes, media_type)
    mock["mode"] = "mock" if not llm_enabled() else "mock_fallback"
    return mock


def _mock_ocr(file_bytes: bytes, media_type: str) -> Dict[str, Any]:
    """
    Without a model, only the seeded sample lease can be read: it carries its printed fields as
    PNG text chunks. Anything else returns no date, which the UI shows as 'enter it manually'.
    """
    empty = {"expiry_date": "", "confidence": 0.0, "evidence_text": "", "institution_name": "", "land_area": ""}
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
    }
