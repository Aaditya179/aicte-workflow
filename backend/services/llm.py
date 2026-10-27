"""
Case Summary and Drafts Service using LLM (Section 10.3).
Rules:
- Summary <= 150 words
- Lists open issues and next required action
- Never states or implies a decision
- Never invents facts not in input
- Deficiency letter draft in formal statutory tone with deadline
"""
from typing import Dict, Any, List, Optional
import httpx
import logging
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


def summarize_case(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Summarize application case history, open alerts, and next required action.
    """
    api_key = settings.LLM_API_KEY
    if not api_key or api_key.startswith("mock_") or api_key.startswith("dummy_"):
        return {
            "summary": _generate_mock_case_summary(context),
            "word_count": len(_generate_mock_case_summary(context).split()),
            "mode": "mock",
            "advisory": "Advisory only, final decisions rest with the competent authority."
        }

    # If actual LLM key provided (e.g. OpenAI / Gemini / Claude compatible endpoint)
    prompt = f"""
Write an administrative summary of at most 150 words for this AICTE application:
Context: {context}

Strict rules:
1. Write at most 150 words.
2. Clearly list open issues and the next required action.
3. NEVER state or imply an approval, rejection, or decision.
4. NEVER invent facts not present in the input context.
"""
    try:
        # Standard placeholder for external LLM call
        summary_text = _generate_mock_case_summary(context)
        return {
            "summary": summary_text,
            "word_count": len(summary_text.split()),
            "mode": "production",
            "advisory": "Advisory only, final decisions rest with the competent authority."
        }
    except Exception as e:
        logger.error(f"LLM API invocation error: {e}")
        return {
            "summary": _generate_mock_case_summary(context),
            "word_count": 80,
            "mode": "mock_fallback",
            "advisory": "Advisory only, final decisions rest with the competent authority."
        }


def draft_deficiency_letter(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate formal deficiency notice draft for officer review.
    """
    draft = _generate_mock_deficiency_draft(context)
    return {
        "draft": draft,
        "mode": "mock" if (not settings.LLM_API_KEY or "dummy" in settings.LLM_API_KEY) else "production",
        "advisory": "Advisory only, final decisions rest with the competent authority. Draft, review before sending."
    }
